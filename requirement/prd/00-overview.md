> [← PRD 索引](../PRD.md) · **0. 产品定位**

## 0. 产品定位

### 模块说明

| 项 | 说明 |
|----|------|
| **做什么** | 三条主线（规划 / 持仓 / 基金解读）+ 副线自由问答；JTBD、MVP 边界 |
| **编码锚点** | 五 Tab `conversation_type` · 三类 `report_type` · 决项见 [appendix-d](./appendix-d-decisions.md) |

### 0.1 一句话定位

面向 **C 端投资者** 的基金理财顾问 Agent：在统一对话里完成 **可审计的多目标投资规划**、**持仓分析**、**单只基金深度解读**；辅以自由问答。输出结构化、可回溯的报告，不是黑盒荐基。

**演示视角**：对客叙事始终是 C 端自助产品；面试/demo 打透「过程可见 + 三类报告落盘」。技术亮点（阶段条、可审计链路）服务于「用户能看清 AI 怎么干活」。

#### 0.1a 用户工作与 JTBD（JTBD-01）

| 层级 | 用户要完成的进展 | Tab | Done |
|------|------------------|-----|------|
| **主线 ①** | 厘清人与多条目标投资约束 → 针对某一约束出可解释、仅公募范围内的配置方案 | 需求梳理 + 资产配置 | **《投资规划书》发布**（`report_type=plan` · §7.4） |
| **主线 ②** | 录入/更新持仓 → 诊断；有方案时对照偏离与再平衡 | 持仓分析 | **《持仓分析报告》发布**（`report_type=portfolio` · §8） |
| **主线 ③** | 单只公募深度解读（可不经完善投资需求） | 基金解读 / 自选「AI 解析」 | **《单只基金分析报告》发布**（`report_type=fund` · §9） |
| **副线** | 随时问理财问题；可带图 | 自由问答（`chat`） | **无统一报告**；复杂需求 **Handoff** 至主线 Tab |

**主线 ① Job Story**：当人生有多条理财目标、可投资金有限时，在 **清楚约束与现金流** 前提下得到 **可解释、可核对、仅中国公募基金** 的配置方案并留下规划书，以便 **有依据决策、事后能回溯当时为何这么配**。

- **需求梳理** 是主线 ① 的前置输入，**不是** 独立 Done；Done 以规划书为准。  
- **Planner 默认顺序** ①→②→③（§5.6.4）；用户可跳过（如只研究单基 → 主线 ③）。  
- **社会任务（最小）**：三类报告 md 可导出自行转发；本期无协作账号。  
- **不替代**：开户、下单；本产品做 **研究 · 规划 · 诊断 · 留痕**。

### 0.2 核心能力

| 能力 | 层级 | 输出 | Done |
|------|------|------|------|
| 需求梳理 | 主线 ① 前置 | `profile_versions` + `investment_goal_constraints` | 约束确认写库；规划 Done 见规划书 |
| 资产配置与规划书 | 主线 ① | `allocation_plans` + 规划书快照 | 规划书发布 |
| 持仓分析 | 主线 ② | 持仓分析报告快照 | 持仓报告发布 |
| 单只解读 | 主线 ③ | 单只基金分析报告快照 | 基金报告发布 |
| 模型聊天 | 副线 | 阶段式流式（§0.2.1） | 当轮答复；可跳转主线 |

#### 0.2.1 阶段式流式（对客 · 已定）

**不是**以逐字打字机为主。参考 Cursor 任务分析：先见 **阶段** 与 **正在做什么**，再见完整答复或确认卡。

| 层 | 展示 |
|----|------|
| 环节阶段 | 消息流内阶段条就地更新 |
| 工作过程 | 每阶段 1–2 句白话（非裸 ExecutionPlan JSON） |
| 推理摘要 | 可选折叠「过程说明」；不倾倒长链思维 |
| 最终输出 | 阶段结束后整块/分段出现；复杂任务出确认卡/报告链接 |

技术：SSE 推送 `stage` / `progress` / `content_block`；`token_delta` 可选且须在阶段条之后。详文 **§5.3.10**。

#### 0.2.2 目标投资约束 vs 资产配置两步（已定）

**目标投资约束** 存表 `investment_goal_constraints`（**不用** pool 命名）。`goal_constraint_id` = 某一组约束主键，供方案与报告外键引用——**不是**基金池 ID。

资产配置（`allocation_plans` · 绑 `goal_constraint_id`）推理范围 **仅中国公募基金**（§0.8）。分两步，每步 **联网 + 深度推理**（§2.2.6），须附原因说明：

| 步 | 输入 | 产出 | 用户动作 |
|----|------|------|----------|
| **1 · 大类** | 该组约束 + 客户信息层现金流 + 联网 | 货/债/权益等 **大类比例** + `allocation_rationale` | 确认卡 → `plan_step=1` |
| **2 · 明细** | 已确认大类 + 联网 + 行情（若有） | 各大类下 **具体公募**（`fund_code`）+ 每项 `recommendation_reason`；分批与再平衡频率 | 确认卡 → `plan_step=2` → 规划书草稿 → Verify → **模式 B** → 用户 **确认发布**（PL-03 · §4.1.0） |

第一步 **不** 产出 `fund_code`；第二步 **必须** 有可核验国内公募代码。规划书 md 与 `allocation_plans` 写库是两步：后者确认后写草稿，前者须用户点发布才进「我的报告」。详文 **§7**。

### 0.3 MVP 边界

**本期不做**

- 聊天区业务文件上传（PDF/Excel/Word）；基金 PDF 仅知识库页（§9.2）  
- 五 Tab **均可发截图**（须 Vision · §5.3.12–13）；已发布报告用「我的报告」**复制链接**贴聊天（§4.1.2）  
- PPT 报告、美国 WM 全套、复杂多租户等

**演示必打透**

| 亮点 | 说明 |
|------|------|
| 结构化可审计报告 | 三类报告 + Markdown / Preview（Mermaid + ECharts） |
| 多 Agent 可见过程 | Subagent + 聊天区阶段式展示（§0.2.1） |
| 三条主线 + 报告 Done | 各主线以对应报告为终点 |
| 持仓定时盘点 | 按月/周，取最近交易日 |
| 单基金知识库 + 解读 | 披露 PDF → md 索引；管理页上传 |
| 带图聊天 | 五 Tab 可截图；持仓 Tab 可走录入 |

**聊天/Global 本期不做**（核心流程保留）：会话内搜索、侧栏场景快捷新建、checkpoint 续做、历史置顶/场景筛选/清空全部、编辑再发/重新生成、ExecutionPlan JSON 对客展示、自选拖拽排序、独立 `.xmind`、聊天记忆双栏编辑、合规长版全文。  
**核心保留**：五 Tab、Planner、跳转卡、阶段流、`/` Command、停止、联网引用≤5、历史删改/时间分组、设置、知识库管理、报告三件套、定时持仓。

### 0.7 合规边界（G-07 · 已定）

全产品 **仅** 展示短版一句，**不** 展示长版全文、展开或抽屉：

> AI 生成内容，仅供参考，请审慎决策。

位置：聊天输入区（§5.3.7）、使用说明、三类报告 Preview/导出页脚、方案/投资需求确认卡。

### 0.4–0.10 索引（详文在他处）

| 主题 | 详文 |
|------|------|
| 五 Tab 发图、Vision | [05-chat-shared §5.3.12–13](./05-chat-shared.md) |
| 合规短版（G-07） | §0.7 |
| 产品数据范围 | §0.8 |
| 联网策略 | [02-settings-models §2.2.5](./02-settings-models.md) |
| 对话编排（Planner / Handoff） | [05-chat-shared §5.6](./05-chat-shared.md) · 名词 [GLOSSARY §2](./GLOSSARY.md) |
| Agent Harness | [HARNESS.md](../HARNESS.md) · PRD 变更须过 HARNESS §13 |
| 内置工具 | `mmdc`（必装）、ECharts、AKShare/Tushare、Kimi 联网 |
| 参考路径 | [appendix-c](./appendix-c-paths.md) |
| 跨平台开发 | §0.14 |

### 0.8 产品数据范围

| 能力 | 基金/数据范围 | 联网 |
|------|---------------|------|
| 自由问答 | 不限话题 | 全网络公开信息 |
| 需求梳理 | — | 不依赖基金库 |
| 资产配置 | **仅中国公募基金**；两步须含 `fund_code`（第二步） | **必须**；引用 ≤5（§5.3.8） |
| 持仓分析 | 持仓 **仅中国公募基金** | 可补行情资讯 |
| 基金解读 | **仅中国公募基金** | 知识库（[§9.2.0](./09-fund-knowledge.md)）+ 行情 + 可补舆情 |

**对客一句**（能力介绍、空状态）：投资需求梳理/资产配置/持仓/基金解读中的基金 **仅覆盖中国公募基金**；自由问答可结合 **公开网络信息** 交流更广泛问题。

### 0.11 Agent 体系摘要

| 层 | 定稿 |
|----|------|
| 对客 | 品牌「理财助手」；Pill 展示 `Agent \| {场景名}` |
| 对系统 | Planner + 场景 Handler（五 `conversation_type`）+ 基础设施 Agent + Tools；**非**单 prompt |

**能力模型**：场景 Tab → Skill（`skills/{scene}/*.md`）→ Command（Harness Tool · `/` 补全与 registry 同源）。

**注册表**（`agents/registry.yaml`）：场景 Handler `scene_*`；基础设施 `infra_md_writer` / `infra_db_*` / `infra_fund_knowledge_*`。Handler **经 Tool 层**访问 DB，不直写 SQL。

**Planner 输出**（ExecutionPlan）：`intent`（`simple_qa` | `scene_task` | `cross_scene_handoff`）、`target_scene`、`steps`、`requires_user_confirm`。跨场景须 **先问 + 跳转卡**；**仅**点「前往」才 handoff（HANDOFF-CONFIRM-01）。

**Skill/Command 编写**：对标 `reference-project/financial-services-plugins/`；先 Skill 再 Command/Agent；禁止跳过 Verify 直写库。编码目录见 **CODING.md**。

#### 0.11.5 PRD 变更审查

合并 PRD 改动前须过 **HARNESS §13**（循环、压缩、Tool、Verify、artifact、合规）。

### 0.12 注册表、ExecutionPlan、并行锁

#### 0.12.3 Agent 注册表（`agents/registry.yaml`）

| 类型 | Agent ID |
|------|----------|
| 场景 Handler | `scene_chat` `scene_profile` `scene_plan` `scene_portfolio` `scene_fund` |
| 基础设施 | `infra_md_writer` · `infra_db_read` · `infra_db_write` · `infra_fund_knowledge_read` · `infra_fund_knowledge_write` |

Planner 经 `list_agents` / `list_skills` / `list_commands` 查询；Handler 不绕过 Tool 直写 SQL。

#### 0.12.4 Planner 输出（ExecutionPlan）

每轮 JSON（可与阶段条并行）：`intent`（`simple_qa` | `scene_task` | `cross_scene_handoff`）、`target_scene`、`steps[]`（`skill` / `command` / `status`）、`requires_user_confirm`、`parallel_allowed`。跨场景时 `requires_user_confirm=true`，同轮出跳转卡（HANDOFF-CONFIRM-01）。

#### 0.12.5 并行锁（SH-08）

| 活跃写流程 | 可并行 |
|------------|--------|
| `chat` / `fund` | 全部 |
| `profile` / `plan` / `portfolio` | 仅 `chat`、`fund` |

**互斥组** `profile`·`plan`·`portfolio` 同一时刻仅一条写 stream；锁存 `workflow_locks`，stream 结束释放；**未点确认的确认卡不占锁**。

### 0.13 工作流增强优先级

| 能力 | 优先级 |
|------|--------|
| 任务级流式、结构化中间态（propose → confirm）、分阶段 artifact | P0 |
| 定时 human-loop（§4.2）、快/深模型分工（§2.2.6）、`/` Command | P0 |
| 工作流 checkpoint（`conversations.checkpoint`） | **本期不做**（C-12） |

### 0.14 开发与运行环境（跨平台 · 已定）

**主平台**：**Windows**（团队日常开发与 demo 录屏）。**须同时支持 macOS** 上的完整本地开发、验收与人工走查；Linux 与 macOS 共用 bash 脚本路径。

| 能力 | Windows | macOS |
|------|---------|-------|
| Node / npm | 18+（推荐 20+） | 同左 |
| Python | `python` / `py -3`；`python -m pip install …` | **`python3`**；`python3 -m pip install …` |
| 环境 bootstrap | `npm run env:bootstrap` → PowerShell | 同命令 → **bash** |
| 数据库迁移 | `npm run data:migrate` | 同左 |
| 验收测试 | `npm run test:gaps` / `test:acceptance` | 同左 |
| 本地打开文件/文件夹 | `cmd start` | **`open`（Finder）** |
| Mermaid 校验 CLI | `npx.cmd mmdc` | `npx mmdc` |

**npm 脚本约定**（编码仓 `automation/scripts/run-script.mjs`）：Windows 自动选 `.ps1`，macOS/Linux 自动选 `.sh`；**业务逻辑不得写死在单一 OS 的 shell 里**，共享步骤优先 Node/tsx CLI 或 Python（经 `run-migrate.mjs` / `run-python.mjs` 解析解释器）。

**路径与数据**：应用内一律 `path.join` / `data/` 相对路径；**禁止**在 TS 中硬编码 `D:\` 或 `\` 作为业务路径。PRD 附录路径示例可保留 Windows 盘符，实现须可移植。

**不在本期范围**：移动端 App、WSL 专属打包、Docker 一键镜像（可后续加，不阻塞 macOS 原生 `npm run dev`）。

**验证**：发版前须在 **Windows** 与 **macOS** 各至少跑通一次：`npm run data:init` → `npm run data:migrate` → `npm run dev` → `需求仓/docs/MANUAL-VERIFICATION.md` 推荐路线；自动化：`npm test` · `npm run test:gaps` · `npm run verify:system`。
