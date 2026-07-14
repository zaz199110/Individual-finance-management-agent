# 编码仓库实现约束（Harness 必遵）

> **本仓库（agent-demo）只写需求，不写业务代码。**  
> 实现请在独立编码仓库（工作名 **`agent-demo-app`**，见 PRD §2.6）进行。  
> **开工前必读**：`PRD.md` **§0.11** + 本文 + `HARNESS.md`。

---

## 1. 总要求

1. **对标 Anthropic Agent Harness 官方思路**实现运行时，不得把产品做成「单 prompt + 直接调 LLM」的黑盒。
2. 架构须体现 **Gather context → Take action → Verify → Repeat**（见 [Claude Agent SDK 工程文](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)）。
3. **每次 PRD 变更**后，开发侧须对照 `HARNESS.md` §13 清单做一致性检查，并在 PR / 提交说明中注明「Harness 审查：通过 / 例外及原因」。

---

## 2. 推荐目录结构（编码仓）

```
agent-demo-app/
├── agents/
│   └── registry.yaml      # 从需求仓 agents/registry.yaml 复制；list_* 数据源
├── skills/
│   └── {scene}/*.md       # Skill 工作流（对标 Cursor Skill）
├── src/
│   ├── harness/
│   │   ├── planner/       # ExecutionPlan JSON
│   │   ├── scenes/        # scene_chat | profile | plan | portfolio | fund
│   │   ├── infra/         # md_writer | db_read | db_write | fund_knowledge
│   │   ├── tools/         # Command 实现；CLI 可调用
│   │   ├── locks/         # workflow_locks 互斥
│   │   ├── context/       # §6 四层压缩 + reactive；每轮 LLM 前必跑
│   │   ├── prompt/        # s10 + s10a：blocks / normalize / assemble
│   │   ├── tasks/         # s12：任务图 + workflow_tasks 同步
│   │   ├── background/    # s13：后台 job + job_done
│   │   ├── runs/          # s18：分配 run_id、run 路径、定稿搬运
│   │   ├── hooks/         # s08 四事件
│   │   ├── verify/
│   │   └── loop.ts
│   ├── app/api/chat/
│   ├── app/api/conversations/   # CRUD · CH-FIRST-01 · C-08 evict
│   ├── app/api/artifacts/       # GET :id · PATCH :id（§5.3.10b）
│   ├── app/api/handoff/         # prepare · §5.10.1
│   ├── app/api/placeholder/
│   ├── app/api/fund-knowledge/  # 知识库管理页 API（§9.2）
│   ├── components/
│   │   └── report-markdown-preview/  # ReportMarkdownPreview 共用组件（PRD §1.3.4 · PREVIEW-01）
│   └── ...
├── scripts/fund-knowledge/  # CLI：explore | index | 转换管线（knowledge §9.2.0b）
├── supabase/migrations/
├── data/
│   ├── fund-knowledge/    # 单基金 vault + index.db（knowledge §9.2.0）
│   ├── reports/           # 报告 md **定稿**快照（与 PRD §3.2）
│   ├── runs/              # s18 Run Workspace：{conversation_id}/{run_id}/ 草稿、artifacts/、tool-results/
│   ├── tool-results/      # 可选全局兜底；L3 优先写 run 内 tool-results/
│   └── transcripts/       # L4 归档
└── docs/DEPLOY.md         # 亦可先用需求仓 docs/DEPLOY.md
```

**原则**：`app/api` 只做 HTTP/SSE；**所有 Agent 逻辑进 `harness/`**。

---

## 3. 实现硬约束

| # | 约束 | 来源 |
|---|------|------|
| 1 | 每条消息 **先 Planner**，再分支 | PRD [§5.6](./prd/05-chat-shared.md) |
| 2 | 跨场景 **禁止静默**转化：须 **先问 + 跳转卡**；**仅**用户点「前往」后才 `handoff/prepare` 打开/新建目标对话并 `handoff_autostart`；**禁止**口头「好的」alone、Planner 自动 PATCH 改类型 | HANDOFF-CONFIRM-01 · §5.6.3 |
| 2a | **CH-CONV-01**：已锁定对话 **禁止** PATCH 改 `conversation_type`；同线程不混场景 | [05-chat-shared §5.1.3b](./prd/05-chat-shared.md) |
| 2b | **CH-TAB-01**：已锁定且 Tab≠类型 → 换 `?c=` 或新建预览；**不** PATCH 当前对话类型 | [05-chat-shared §5.1.3c](./prd/05-chat-shared.md) |
| 3 | 写库须经 **Tool 提议 → Verify → 用户确认 → commit Tool** | HARNESS.md §4、§11 |
| 4 | Subagent **仅回传摘要 + artifact_refs** | HARNESS.md §5 |
| 5 | 联网走 **联网搜索槽位** §2.2.5，不硬编码单一厂商 | PRD §2.2.5 |
| 6 | 模型配置从 **设置页 / model_settings** 读取，不写死 Key | PRD §2.2 |
| 7 | 数据库从 **设置 → 数据库配置** 读取 | PRD §2.3 |
| 7a | **Tushare Token** 从 **设置 → 数据源** 读取；**设置页优先**于 env（SET-DS-02） | [02-settings-datasources.md](./prd/02-settings-datasources.md) §2.8 |
| 7b | **SET-DB-01**：`GET /api/settings/readiness` 驱动 Tab 阻断；chat 仅要推理+联网 | [02-settings.md](./prd/02-settings.md) §2.0.2 |
| 8 | Tool 调用与结果 **可日志追溯**（append-only） | HARNESS.md §6.6 |
| 9 | 流式 UI 须展示 Harness 阶段（理解 / 检索 / 校验） | PRD CH-02 |
| 10 | 合规 §0.7 注入 system；输出过 Evaluator 规则 | PRD §0.7 |
| 11 | Planner 输出 `ExecutionPlan`；任务级流式 | §0.12.4 |
| 12 | 写路径经 `infra_*` Agent；禁止场景 Handler 直写 SQL | §0.12.3 |
| 13 | `profile`/`plan`/`portfolio` 写锁互斥 | §0.12.5 |
| 14 | `/` Command 补全与 `registry.yaml` 同步 | §5.3.11、CH-27 |
| 15 | 联网回答写 `messages.citations` | CH-18 |
| 16 | 快/深模型按 `task_type` 路由 | §2.2.6 |
| 17 | **每轮 LLM 前**跑压缩管线 L3→L1→L2→(L4)；**L3 先于 L2** | HARNESS.md §6 |
| 18 | L4 / reactive 后 **§7 业务锚点重注入**（DB 快照，非猜历史） | HARNESS.md §7 |
| 19 | 大 `tool_result` / RAG 落盘当前 run：`data/runs/{conversation_id}/{run_id}/tool-results/`；messages 只留预览 | HARNESS §6.2、§8b |
| 20 | Transcript 归档 `data/transcripts/`；L4 前必写 | HARNESS.md §6.3 |
| 21 | **s18 Run Workspace**：每请求/定时任务新 `run_id`；草稿只写 `data/runs/`；定稿才 `data/reports/` | PRD §0.11.8 |
| 22 | **s10a**：`harness/prompt/` 分 system blocks / messages / reminders；禁止 RAG/OCR 进 blocks | HARNESS §8 |
| 23 | **s00b**：`loop.ts` 实现须对齐 HARNESS §8 生命周期图 | [s00b](https://learn.shareai.run/zh/docs/s00b-one-request-lifecycle/) |
| 24 | **s09 聊天记忆**：Preview 单栏 + `data/user-memory.md` 外部编辑 · **刷新写库**；Harness 只读 `user_memory` | [02-settings-memory §2.4](./prd/02-settings-memory.md) |
| 25 | **s12 任务图**：`workflow_tasks` 落盘；SSE `stage` 由任务节点驱动；**禁止**仅内存多步状态 | PRD §5.11、HARNESS §8c |
| 26 | **s13 后台**：慢任务 `harness/background/` + `job_done`；与 `workflow_locks` 兼容 | PRD §0.11.10、HARNESS §8d |
| 27 | **s10a Pipeline**：`normalize + assemble` 生成 `{ system, messages, tools }`；**禁止**把一切塞进 system block | PRD §0.11.11、HARNESS §8a |
| 28 | **s20 验收**：PR/联调须对照 HARNESS §8 生命周期图与 [s20](https://learn.shareai.run/zh/) | PRD §0.11.7、HAR-03 |
| 29 | **KB-01–03 / KB-03-SCREEN**：L0∥L1 硬事实并列；瀑布禁止跨层合并排序；库内 vs 全市场筛选分路径 | [knowledge §9.2.0g](./prd/09-fund-knowledge.md) |
| 30 | **CH-FIRST-01 / CH-TYPE-01 / CH-CONV-01 / CH-TAB-01 / HANDOFF-CONFIRM-01**：§5.1.3b–c、§5.3.10a、§5.6.3、§5.10.1 | [05-chat-shared](./prd/05-chat-shared.md) |
| 31 | **对话 REST + metadata**：§5.10.1；`has_unconfirmed` / `pending_report_draft` | [03-data-architecture §3.3.4](./prd/03-data-architecture.md) |
| 32 | 知识库上传 **仅** `/fund-knowledge` 管理页；聊天区不上传披露文件 | PRD §0.3、§9.2 |
| 33 | **MERMAID-01**：`package.json` 含 `@mermaid-js/mermaid-cli`；前端 `mermaid` 与 CLI **同版本**；`report_publish` 前 `mmdc` 校验 | PRD §1.3.3 |
| 34 | Agent / Skill 产出 Mermaid：**禁止** `mindmap` / `graph TD` / 样式类语法；树图用 `flowchart TB` + 引号标签 | PRD §1.3.3 |
| 35 | **CG-01**：`fund_knowledge_explore` 与 CLI `explore` **同源**；实现对标 `Pi-Agent/codegraph` ContextBuilder + budget | [knowledge §9.2.0d](./prd/09-fund-knowledge.md) |
| 36 | `scene_fund`：**禁止**链式 read 招募书 / vault grep；Gather 优先 1～3 次 explore | [knowledge §9.2.0d](./prd/09-fund-knowledge.md)、§9.1 |
| 37 | **FK-CITE**：`index` 须写 `knowledge_chunks` + FTS；explore / 基金报告 **必须** 带 `chunk_id` 出处 | [knowledge §9.2.0e](./prd/09-fund-knowledge.md) |
| 38 | 基金报告 **参考披露** 链接须深链到 `/fund-knowledge` 行号；与 CH-18 联网引用分开展示 | [knowledge §9.2.0e](./prd/09-fund-knowledge.md)、[04-my-reports](./prd/04-my-reports.md) |
| 39 | **FK-PDF-01**：PDF 先 PyMuPDF；**禁止**整本默认 Vision；OCR 回退仅无文字层页 | [knowledge §9.2.0c](./prd/09-fund-knowledge.md) |
| 40 | **FK-19 / WL-01**：`fund_watchlist` 空表时 seed 三只；首次 fund **我的自选** Tab **非空** | [watchlist §9.3.8](./prd/09-fund-watchlist.md)、[09-fund §9.0.1](./prd/09-fund.md) |
| 41 | **FK-20 / RPT-FUND-01**：fund 报告 `report_slug` + `{report_name}.md`；基金 Tab **查看/复制链接**；Tab 顶栏 **打开文件夹** | PRD §3.3.2、§4.1.1d |
| 42 | **FK-21 / PREVIEW-01**：**`ReportMarkdownPreview`** 唯一 Preview；我的报告 **Preview 单栏** + `/reports/view` 全屏 | PRD §1.3.4 |
| 43 | **RPT-LAYOUT-01 / RPT-DRAFT-01**：**四类**报告草稿（含 profile）**模式 B**；确认后才 `report_index`；定时持仓 **直发** | §1.2.5、§4.1.0 |
| 44 | **RPT-LINK-01**：四 Tab **复制链接**；`tab=profile\|plan\|portfolio\|fund`；聊天粘贴 → `report_read` | §4.1.2 |
| 45 | **RPT-PREVIEW-LINK-01**：待确认草稿 Preview 仅 **外链 + 已发布深链** 可点；`ReportMarkdownPreview` · `linkPolicy` | §4.1.0f · §1.3.4 |
| 45 | **FUND-INTENT-01 / FK-24**：`fund_qa` 当轮短答 **不写**草稿；`fund_full_report` / AI 解析才走完整报告 | §9.1.0 |
| 46 | **FK-18-ARCH / FK-18-EC / FK-25**：L0 → archetype **A～F**；回退 **D**；图表仅 **大类资产饼 / 前十横条 / 费率柱**（有数据才出 · **禁止 radar**）；第二/三章 **普通开篇段**（**禁止「本章回答」**）；`registry-portfolio` **仅**类型元数据 · **禁止 REG 假持仓**；**不做 CI mock L0** | [analysis §9.1.1b](./prd/09-fund-analysis.md)、[spec §6](./docs/samples/fund-analysis-report-spec.md)、[蓝图 §0](./docs/samples/fund-report-blueprints-A-F.md) |
| 47 | **DEMO-ABCDEF-01**：六只 A～F 各一（Hub §9.0.1）；六只 **均有 vault**；L2 为 **100 条通用 FAQ**（`fund_code=*` · 非单基金专属） | [09-fund §9.0.1](./prd/09-fund.md)、[knowledge §9.2.10](./prd/09-fund-knowledge.md) |
| 48 | **L2-SEED-01 / FK-26**：**禁止** Agent 运行时 UPSERT `fund_semantic_entries`；L3 不得持久化为 L2 | [knowledge §9.2.0f](./prd/09-fund-knowledge.md) |
| 49 | **L0-FALLBACK-01**：`fund_lookup` Tushare→AKShare 失败 → Harness **`web_search`** 补行情；`l0_degraded` 须标注；**不阻断**报告 | [analysis §9.1.8](./prd/09-fund-analysis.md) |
| 50 | **CG-01-XDOC**：**不做** 跨文档强制双 explore / Verify ≥2 对比 FK-CITE（P2） | [knowledge §9.2.0d](./prd/09-fund-knowledge.md) |
| 51 | **RPT-EDIT-01**：已发布 md **外部编辑 + 刷新**；不回写 DB | §4.1.1 |
| 52 | **RPT-NAV-05**：我的报告 **返回对话** 且对话已删 → **友好报错**（非 CH-FIRST-01） | §4.1.0c |
| 53 | **RPT-API-01**：`GET /api/reports` · `GET /api/reports/:id` · open-folder / open-file | §4.1.5 |

---

## 4. 禁止事项

- ❌ 已锁定对话 **PATCH** 改 `conversation_type`（须 CH-TAB-01 换 `?c=`）  
- ❌ 跨场景 **未经** 跳转卡「前往」自动新建对话或 `handoff_autostart`  
- ❌ 在 `chat` 路由内直接 `INSERT` 投资需求 / 持仓 / 方案  
- ❌ Subagent 全量上下文合并进主对话  
- ❌ 跳过用户确认卡片写库  
- ❌ 把 RAG 整篇招募书塞进 prompt（须检索 + 摘要）  
- ❌ 报告用外链图片或 `.xmind` 代替 Mermaid 图源；跳过 `mmdc` 直接 publish 含图表的报告  
- ❌ `scene_fund` 用多次 `read` 代替 `fund_knowledge_explore` 拼招募书上下文  
- ❌ 仅靠聊天历史恢复需求梳理/资产配置/持仓（压缩后须 §7 重注入）  
- ❌ 调换 L3/L2 顺序或跳过五场景压缩管线  
- ❌ Secrets 进前端 bundle  
- ❌ 多会话 / 定时与手动分析 **共用**同一 run 目录写草稿  
- ❌ 报告草稿直接写 `data/reports/`（须先 run 内草稿 → publish 定稿）  
- ❌ 阶段条与 `workflow_tasks` 双轨不同步  
- ❌ 慢报告仅绑前台 SSE、用户切 Tab 即丢任务  
- ❌ 本轮 `tool_result` / Hook 输出写入长期 system block  
- ❌ 为规划书 / 持仓 / 基金各写独立 Preview 组件（须 **`ReportMarkdownPreview`** + props，PREVIEW-01）  
- ❌ 待确认报告草稿写入 `report_index` 或 `data/reports/`（须 run 草稿 → 用户确认 → publish · RPT-PUB-01）  
- ❌ 定时持仓分析走聊天确认卡（须 **直发** · RPT-SCHED-01）  
- ❌ fund 场景 **仅凭基金代码** 自动写 `draft-report.md`（须判 **`fund_full_report`** · FUND-INTENT-01）  
- ❌ 联网 / Agent 运行时 **UPSERT** `fund_semantic_entries`（L2 仅 seed / 管理页 expert / CLI · L2-SEED-01）
- ❌ 基金解读正文写 **「本章回答：」**（须第二/三章 **普通开篇段** · FK-18-LAYOUT）
- ❌ 用 **registry 假持仓 / 假前十** 注入基金报告（前十须 **L0 live** · Tushare/AKShare）
- ❌ 为 CI **另开 mock L0 模式** 绕过外网（单测可用 fixture / `data/l0-cache` 快照 · 不增新开关）
- ❌ 在 **`messages.content_blocks`** 或 **`conversations.metadata`** 存 **propose 全量 JSON**（须 **`propose_artifacts` + 瘦 confirm_card** · ARTIFACT-01）
- ❌ `*_confirm` 从聊天历史 parse propose，而不读 **artifact 当前 payload**

---

## 5. 联调与自测

| 检查 | 方法 |
|------|------|
| Harness 循环 | 单测 `harness/loop`：mock Tools，断言 Verify 被调用 |
| 跨场景 Handoff | E2E：chat 触发需求梳理建议 → 同轮问句+跳转卡；**未点前往**不写库；点「前往」→ `handoff/prepare` + 目标对话 `handoff_autostart` |
| 工具失败 | 断网 / 错误 Key → 用户可见错误，无幻觉数据 |
| 合规 | 快照测试：禁词、免责声明存在 |
| 任务图 s12 | 刷新页面后阶段条与 `workflow_tasks` 一致 |
| 后台 s13 | mock 慢任务：切 Tab 后仍 `job_done` |
| Prompt 管道 s10a | 单测 `assemble`：block / message / reminder 边界 |
| s20 验收 | 能按 HARNESS §8 图口述各模块挂载点 |

---

## 6. 与需求仓协作

| 需求变更 | 编码侧动作 |
|----------|------------|
| PRD 新增业务能力 | 在 `harness/tools/` 增 Tool + Verify 规则 |
| PRD 改确认流 | 改 `verify/` + 前端确认组件 |
| PRD 改模型槽位 | 改 `model_settings` 读取层，**不改** Harness 编排结构 |

**本地联调默认模型栈（定稿）**：[`requirement/config/model-defaults.md`](./config/model-defaults.md) · 生成 env：`npm run env:bootstrap`

---

## 7. 资产配置模块验收（PRD §7 · PL-PLAN-READY）

> 编码仓联调 / PR 自检 · 对照 `skills/plan/plan_verify.yaml` 与 [`plan-propose-payload.examples.json`](./docs/samples/plan-propose-payload.examples.json)。

| # | 验收项 | 通过标准 |
|---|--------|----------|
| 1 | **L0 真全市场** | 第二步 **须** 调 `plan_screen_funds`；**禁止** Demo 6 只白名单作默认池（PL-PLAN-L0-FULL-01） |
| 2 | **联网阻断** | 第二步 `web_search` 失败 → **阻断**明细/规划书 · **不**降级为「仅知识库+需求 md」（PL-PLAN-NET-BLOCK-01） |
| 3 | **货币定投 D2** | 货币类 `dca_in_periodic=false` · 首期 100%（Hook D2 · PL-PLAN-DEPLOY-01） |
| 4 | **债基 note D4** | 债/混债 `fund_deploy[].note` **须**解释首期 vs 定投（PL-PLAN-DEPLOY-BOND-01） |
| 5 | **overlay merge** | `report_overlay_patch` → merge → `report_draft` 重生 **re-merge** → 发布清除（RPT-OVERLAY-01） |
| 6 | **场景选择器** | N≥2 须 UI 点选 `goal_constraint_id`；聊天指名与选中 **一致**（PL-PLAN-PICK-GOAL-01） |
| 7 | **两步 Hook** | step=1/2 各自 Hook1+Hook2 **=0** 才出确认卡 |
| 8 | **规划书 Verify** | ≥3 块 `echarts` · 与 spec §8 / sample 结构一致 |

---

## 8. 编码顺序（对齐 Learn Claude Code · ShareAI 章节号）

> 中文导读：<https://learn.shareai.run/zh/> · 本地：`D:\claudecode-project\learn-claude-code\`  
> **s03–s08 本地目录名与 ShareAI 不一致**，见 `HARNESS.md` 开篇映射表。

1. **s00b + s01**：`loop.ts` 骨架（QueryState → 写回闭环）  
2. **s02**：`harness/tools/*` + registry  
3. **s07 + s08**：permission + hooks（本地 `s03_permission` + `s04_hooks`）  
4. **s10 + s10a**：`harness/prompt/` blocks · normalize · assemble（[s10a 导读](https://learn.shareai.run/zh/docs/s10a-message-prompt-pipeline/)）  
5. **s06 + §7**：context 压缩 + DB 重注入（本地 `s08_context_compact`）  
6. **s04 + s05**：scene subagent + skill lazy load  
7. **s12**：`harness/tasks/` + `workflow_tasks`；阶段条对接  
8. **s13**：`harness/background/` + `job_done`  
9. **s18**：`harness/runs/` + `data/runs/`  
10. **s14**：`scheduled_jobs` 走同一 loop + 后台执行器  
11. **s11** · **s19** MCP  
12. **s20 验收**：对照 HARNESS §8 生命周期图自检  

> learn-claude-code 映射 **本期做/不做**，无 P0/P1 分期（HAR-03）。**s15–s17 不做**团队编排。

需求评审流程见 `README.md`；**Harness 审查**为评审的固定最后一项（`HARNESS.md` §13）。
