> [← PRD 索引](../PRD.md) · **附录 D：已拍板决项**

## 附录 D：自由问答 + 全局 · 已确认决项（2026-06）

| ID | 决项 | PRD |
|----|------|-----|
| G-02 | Rerank **本期不做**；**KB-03 瀑布 + 层内加权** 替代全局 Rerank | §2.2.1、[knowledge §9.2.0g](./09-fund-knowledge.md) |
| G-03 | 语义向量存 **主库 Supabase pgvector**；**无**独立向量库分组 | §2.3.1、[knowledge §9.2.0f](./09-fund-knowledge.md) |
| KB-01 | **官方披露**本地 vault + FTS + explore + FK-CITE；管理页 + CLI | [knowledge §9.2.0](./09-fund-knowledge.md) |
| KB-02 | **语义子库** **100 条通用 FAQ**（`fund_code=*`）→ pgvector；**非**单基金专属；expert 仅 vault+L1 | [knowledge §9.2.0f](./09-fund-knowledge.md) |
| KB-03 | **L0∥L1 硬事实并列** → L2 → L3 瀑布；**禁止跨层合并排序**；L0–L2 无效时加强 L3；**KB-03-SCREEN** 库内 vs 全市场 | [knowledge §9.2.0g](./09-fund-knowledge.md) |
| KB-03-SCREEN | **库内**：L0∥L1 → L2 → L3；**全市场**：L0+L3 初筛，**有 vault 才 L1 核验** | [knowledge §9.2.0g](./09-fund-knowledge.md)、§7.2 |
| CG-01 | MVP = chunks + FTS + explore + FK-CITE；**CG-01-XDOC / Full** → P2 | [knowledge §9.2.0d](./09-fund-knowledge.md) |
| CG-01-XDOC | **本期不做** 跨文档双 explore + 强制对比段 | [knowledge §9.2.0d](./09-fund-knowledge.md) |
| L0-FALLBACK-01 | L0 失败 → **联网**补行情；不阻断报告 | [analysis §9.1.8](./09-fund-analysis.md)、[knowledge §9.2.0g](./09-fund-knowledge.md) |
| UX-PC-01 | **仅 PC**；不做移动布局 | §1.2.5 |
| FK-CITE | 块级索引 + 报告 **参考披露** + 管理页深链；FTS 找块、chunk 表给出处 | [knowledge §9.2.0e](./09-fund-knowledge.md)、§9.1、§4.1 |
| FK-CITE-NOVAULT-01 | **enrich 失败或未触发** · `has_vault=false`：硬事实走 L0+L3；**参考来源说明** · FK-CITE **0 条** · 外网 **延伸阅读** | [analysis §9.1.5](./09-fund-analysis.md)、spec §5.4 |
| FK-ENRICH-01 | **完整报告** · lookup 后 **知识库预热**：无 vault 或披露未覆盖近 12 个月 → seed 同步 ∥ 联网摘要 md → **FTS 索引** → 再 gather；**不写 L2**；失败不阻断 · L3 兜底 | [analysis §9.1.6](./09-fund-analysis.md)、[knowledge §9.2.5](./09-fund-knowledge.md) |
| FK-PDF-01 | **官方披露以 PDF 为一等格式**；PyMuPDF 文本层优先；扫描页 Vision OCR 回退 | [knowledge §9.2.0c](./09-fund-knowledge.md) |
| FK-UI-01 | 基金知识库 **Preview 单栏** + 外部编辑 + 刷新；**无**双栏/页底保存；对齐 RPT-EDIT-01 | [09-fund-knowledge §9.2](./09-fund-knowledge.md)、§1.3.1 |
| FK-SYNC-01 | 上传/刷新/删块 **自动增量索引**；进页 **漂移扫描** 仅打「待刷新」；手动 index 全局/单基金 | [09-fund-knowledge §9.2.4–9.2.5](./09-fund-knowledge.md) |
| FK-CHUNK-DEL-01 | 块 **多选删除** → 物理删 md 章节 + 自动索引；**禁止**手改 index.db | [09-fund-knowledge §9.2.6](./09-fund-knowledge.md) |
| FK-HELP-01 | 页头 **文档结构说明**（对客 · 六类目录/块/索引/两种删改） | [09-fund-knowledge §9.2.8](./09-fund-knowledge.md) |
| FK-API-01 | 知识库管理页 **REST §9.2.9a** + 桌面 open-folder / open-file | [09-fund-knowledge §9.2.9a](./09-fund-knowledge.md) |
| FK-LOG-01 | 维护日志表 **`maintenance_log`** 在 `index.db` | [knowledge §9.2.0e](./09-fund-knowledge.md)、§9.2.7 |
| FK-VAULT-01 | 新建 vault：**fund_lookup** + slug；失败兜底 `{code}-Fund` | [09-fund-knowledge §9.2.3a](./09-fund-knowledge.md) |
| FK-FMT-01 | 上传 **含** XLSX/XLS/CSV、PNG/JPG/WebP；**不含** HTML | [knowledge §9.2.0c](./09-fund-knowledge.md)、§9.2.3 |
| MERMAID-01 | 流程图 **只** Mermaid fenced 块；**必装 mermaid-cli**；最兼容 `flowchart` 子集；publish 前 `mmdc` 校验 | §0.6、§1.3.3 |
| G-04 | **聊天记忆**初始为空 + 页顶对客说明 | §2.4 |
| MEM-UI-01 | 聊天记忆 **Preview 单栏**；**编辑 / 刷新**；**无**双栏、**无**页底保存 | [02-settings-memory §2.4.1](./02-settings-memory.md) |
| MEM-API-01 | `open-file` + `refresh`；刷新 **写** `user_memory` | §2.4.2 |
| G-06 | **绿涨红跌**；在使用说明中解释 | §5.3.9、§1.1 |
| G-09 | 侧栏「**使用说明**」→ **弹出说明页**（含合规短版） | §5.3.9 |
| C-03 | 联网引用 → **最多 5 条** | §5.3.8 |
| C-05 | Command 命名 **中英混用**（表待 §6–§9）；**`/ ` 补全展示** 同格式 | §5.3.9、§5.3.11 |
| C-07 | **阶段式流式**（环节+过程+推理摘要）；非逐字打字机；无 ExecutionPlan JSON UI | §0.2.1、§5.3.10 |
| C-08 | 300 条满 → **POST 新建时**删最旧 1 条 + `evicted_oldest` Toast | §5.8.1 |
| C-09 | 历史 **场景筛选** | **本期不做**（CH-09）；仅 Kimi 式 **时间分组**列表 |
| CH-NEW-01 | **+ 新对话** 立即 POST；`type_locked=false` · UI 默认自由问答 | [05-chat-shared §5.1.3](./05-chat-shared.md) |
| CH-TYPE-01 | **首句 / Handoff 前往** 锁定 `conversation_type`；Handoff 自动开跑+阶段条 | [05-chat-shared §5.1.3b](./05-chat-shared.md) |
| CH-FIRST-01 | 首屏无 `?c=` → 最近历史或 POST 新建 | [05-chat-shared §5.1.3](./05-chat-shared.md) |
| SH-04 | 侧栏 **橙点** = `has_unconfirmed`；Tooltip「有待确认的内容」 | [05-chat-shared §5.1.2](./05-chat-shared.md) |
| CH-DEL-01 | **仅逐条删除**；`has_unconfirmed` 时 **加强**二次确认；**不做**清空全部 | [05-chat-shared §5.8.3 / §5.14.2](./05-chat-shared.md) |
| CH-CONV-01 | **一线程一场景**；Handoff 打开目标对话；侧栏场景副标题；**无**气泡 pill | [05-chat-shared §5.1.3b–c / §5.3.14 / §5.6.3](./05-chat-shared.md) |
| CH-TAB-01 | 已锁定对话 · Tab≠当前类型 → 换 `?c=` 或新建预览 | [05-chat-shared §5.1.3c](./05-chat-shared.md) |
| VISION-ALL-01 | **五 Tab** 聊天发图 + `vision_parse`（Vision 槽位就绪） | §0.4 · [05-chat-shared §5.3.13](./05-chat-shared.md) |
| EMPTY-UI-01 | 空态 / 骨架 / 加载失败 / 404 对话 | [05-chat-shared §5.3.16](./05-chat-shared.md) |
| C-11 | 跳转卡 → **注入摘要**；**HANDOFF-CONFIRM-01** | §5.6.3 |
| HANDOFF-CONFIRM-01 | 跨场景 **先问 + 出卡**；**仅**点「前往」转化；**可不点**继续聊 | [05-chat-shared §5.6.3](./05-chat-shared.md) |
| **ARTIFACT-01** | 业务确认卡 **propose 指针化**：payload → `propose_artifacts` + run JSON；message 仅 `artifact_id` + 摘要；confirm 后真源在业务表 | [05-chat-shared §5.3.10b / §5.11.5](./05-chat-shared.md) |
| API-HANDOFF-01 | `POST /api/handoff/prepare` 解析目标对话；stream `handoff_autostart` + `handoff_ready` | [05-chat-shared §5.10.1](./05-chat-shared.md) |
| G-01 | 深度推理默认「**与推理相同**」开启 | §2.2.6 |
| G-05 | 密钥**设置页加密存库**为主路径 | §2.3、[02-settings-database.md](./02-settings-database.md) |
| SET-EMB-01 | **第五槽位**文本嵌入；L2 semantic 依赖 | [02-settings-models.md](./02-settings-models.md) §2.2.7 |
| SET-DS-01 | **设置 → 数据源**；Tushare Token + AKShare 检测 | [02-settings-datasources.md](./02-settings-datasources.md) §2.8 |
| SET-DS-02 | 设置页 Token **优先**于 env | 同上 §2.8.9 |
| SET-DB-01 | 推理+联网通过 → **chat**；DB 通过 → **需求梳理/资产配置/持仓/基金** | [02-settings.md](./02-settings.md) §2.0.2 |
| SET-UI-01 | 设置壳：左子导航（通用/DB/数据源/模型/记忆）+ 各子页独立保存 | 同上 §2.0.3 |
| SET-FIRST-01 | 推理/联网未检测通过 → 横幅 + 禁用输入 | 同上 |
| G-07 | 合规 **仅短版一句**；**不展示长版**；不做展开/抽屉 | §0.7、§5.3.7、§5.3.9 |
| G-08 | **不做**侧栏场景快捷新建 | §0.3.1 |
| C-12 | checkpoint **本期不做** | §0.3.1、§5.11 |
| C-13 | 聊天框 **`/` Command 补全** P0；与 `registry.yaml`、使用说明同源 | §5.3.11、CH-27 |
| PREVIEW-01 | **`ReportMarkdownPreview` 共用 Preview 组件**（**页面独立**：我的报告 **四 Tab** 页 / 设置·聊天记忆 / 知识库管理）；开发预览见 `preview-report.html` | §1.3.4、FK-21 |
| RPT-HEADING-NUM-01 | 报告 Preview **五级标题自动编号**（`##`→1 … `######`→1.1.1.1.1）；正文 **禁止** 手写「一、」「4.1」 | §1.3.4.2、`report-heading-numbers.css` |
| RPT-FORMAT-01 | 四类报告 **统一 md 版式**：章间 `---`、章首 **本章回答**、表格/blockquote/CSS、`report-format-spec.md` | §1.3.4.3 |
| RPT-FUND-01 | 单只基金 **`report_slug`** = `{fund_code}-{YYYYMMDDHHmmss}`；**文件名**优先 `{report_name}.md`（§4.1.0d） | [04-my-reports §4.1.7](./04-my-reports.md)、§4.1.1d |
| RPT-LINK-01 | **四 Tab** 行内 **复制链接**；深链 `tab=profile\|plan\|portfolio\|fund`；聊天粘贴 → `report_read` | [04-my-reports §4.1.2](./04-my-reports.md) |
| RPT-LIST-01 | 四 Tab 操作列：**查看 / 复制链接**；**不做**列表下载 | [04-my-reports §4.1.1](./04-my-reports.md) |
| RPT-FOLDER-01 | 四 Tab 顶栏 **打开文件夹** → 本类 `data/reports/{type}/` 根目录 | §4.1.1 |
| RPT-EDIT-01 | 已发布 md **外部编辑 + 刷新**；**不回写 DB、不 Verify** | §4.1.1 |
| RPT-NAV-01 | 侧栏常驻；`?c=` 时 **返回对话**；对话已删 → **友好报错**（非 CH-FIRST-01） | §4.1.0c |
| RPT-PROFILE-01 | 每投资目标可有多条已发布历史；列表 **「当前」** = **PH-PROFILE-ENC-01 对齐行**（非单纯 `generated_at` 最新） | §4.1.0d · [§6.0.1](./06-profile.md#601-完善的投资需求n-的定义--p0) |
| RPT-NAME-01 | 报告名称 `-` 分隔；文件名默认 `{report_name}.md` | §4.1.0d |
| RPT-API-01 | 我的报告 REST + 桌面 open-folder / open-file；刷新 = 重 GET `:id` | [04-my-reports §4.1.5](./04-my-reports.md) |
| RPT-FULLSCREEN-01 | Preview **始终** 显示「全屏查看」；容器 **&lt;520px** 时主色 CTA + 工具条 sticky | §4.1.6f |
| RPT-DL-01 | **不做**列表「下载」 | §4.1.1 |
| RPT-LAYOUT-01 | plan/portfolio/fund **有草稿**：主区=报告 Preview、右=聊天；**无草稿**：聊天居中 | §1.2.5 |
| RPT-DRAFT-01 | 待确认草稿在 **run**、绑 **对话**；删对话即删；每对话 **1 份**；覆盖前二次确认 | §4.1.0 |
| SHELL-NAV-01 | **切 Tab / 新建 / 切历史** 不拦截；角标看 **`has_unconfirmed`**；写冲突看 **SH-08** | [05-chat-shared §5.1.2](./05-chat-shared.md) |
| PLANNER-ROUTER-01 | **五 Tab** Planner：**短问** / **本 Tab 主任务** / **跨 Tab 建议**（**HANDOFF-CONFIRM-01** · 仅点「前往」） | [05-chat-shared §5.6.2](./05-chat-shared.md) |
| RPT-PUB-01 | **确认发布** 后才 `report_index` / 「我的报告」；规划书=方案写库 **后再** 发布 md | §4.1.0、§7.4 |
| RPT-SCHED-01 | **定时持仓** Verify 后 **直接发布**；无草稿确认卡 | §4.2、§8.4 |
| FUND-INTENT-01 | fund **提到代码 ≠ 出报告**；`fund_qa` 当轮短答；`fund_full_report` /「AI 解析」→ §9.1.2 | §9.1.0 |
| FK-18-07 | **本期不做** profile/plan/自选联动 · 第四章 **通用引导 + 决策参考清单** | spec §8 |
| FK-18-BP-01 | **2026-06-22 superseded**：图表/导语以 [`fund-report-blueprints-A-F.md`](../docs/samples/fund-report-blueprints-A-F.md) 为准；**FK-18-EC / RADAR / SUPP 本期不做** | 蓝图 §0 |
| FK-18-EC | ~~ECharts：雷达+≥6~~ → **ch1 大类资产饼 + 前十横条 · ch4 费率柱 · 有数据才出 · 无总块数 cap · 禁止 radar** | 蓝图 §4 · spec §6 |
| FK-18-RADAR | ~~六维雷达~~ → **本期不做** | 蓝图 §0 |
| FK-18-LAYOUT | **阅读指引** · 产品身份/关键指标 · 第二/三章 **开篇段**（**基金禁止「本章回答」**）· 决策清单 | spec §3 |
| FK-18-VIS | ECharts **视觉统一**（标题/网格/圆角/配色 · spec §6.3） | spec §6.3 |
| FK-18-ARCH | **一套骨架** + L0 → **A～F** archetype；回退 **D**；变体管 **第一章前十标题** 与风险/费用话术；**C 型无 L0 前十 → 省略投向与重仓** | §9.1.1b · spec §7 |
| FK-18-HOLD | **第一章**前十大随 `holdings_kind`：**股/债/子基金/存单**；**仅 L0 live**（Tushare/AKShare）；禁止 REG 假持仓 | spec §4.1 · §7 |
| FK-18-SUPP | ~~历史分红 · 换手率 · 持有人结构~~ → **本期不做**；L0 经 Tushare/AKShare + `l0-cache` | 蓝图 §0 |
| FK-18-SUPP-NORATING-01 | 基金解读 **不展示** 第三方星数；`fund_ratings` 仅预留 | spec §4（lookup 预留字段） |
| FK-18-SYN | **三句话 + 第二/三章开篇段**（compose LLM · TPL fallback）；个人匹配走 **适合我吗**；对客 **RPT-SYN-COPY-01** | spec §5 |
| RPT-SYN-COPY-01 | 基金报告正文 **禁止**「AI 分析」等对客字样；全文最末：*以上内容由系统根据公开信息整理，仅供参考…* | spec §5 · sample |
| FK-18-FLOW | 对客四段：**① 产品介绍 → ② 赚不赚钱 → ③ 长期持有 → ④ 适合我吗** | spec §3 |
| RPT-FUND-TPL | 基金解读 md **章节模板** · **`echarts` 有数据才出**（ch1 **饼+横条** · ch4 **费率柱** · **禁止 radar** · 无总块数 cap）· **禁止「本章回答」** · Skill → `skills/fund/report.template.zh.md`；Preview → §1.3.4 | §9.1.1 · §9.1.9 · FK-18-EC |
| DEMO-ABCDEF-01 | 演示六只 **A～F 类型各一** | [09-fund §9.0.1](./09-fund.md) |
| L2-SEED-01 | L2 **seed/CLI/运维脚本** 入库；运行时 **只查不写**；L3 **不入** L2 库 | [knowledge §9.2.0f / §9.2.10](./09-fund-knowledge.md)、§9.1.3 |
| WL-02 | 自选列表 **`added_at` DESC**（新加在上） | §9.3.1 |
| WL-03 | **AI 解析**：切「对话」Tab + **注入用户消息**再跑 Harness | §9.3.2 |
| WL-04 | **报告发布后**不在自选 → **加入自选建议卡**（用户确认才写库） | §9.3.2b |
| FK-LOOKUP-01 | **`fund_lookup` L0 契约** + 服务端 `report_archetype` | [analysis §9.1.8](./09-fund-analysis.md) |
| RPT-CARD-01 | **四报告**统一 **确认发布卡**（聊天列 · 非 Preview 内） | §4.1.0a |
| WL-01 | **默认已添加自选** 6 只（A～F 各一）；migration/seed 幂等；删光才空状态 | [watchlist §9.3.8](./09-fund-watchlist.md) |
| PRD-SPLIT-09 | 基金域 PRD 拆 **解析 / 自选 / 知识库** 三文件 + [09-fund.md](./09-fund.md) 总览 | §9.0 |
| REG-01 | **`agents/registry.yaml`** 为 **五场景** Command / 使用说明 / `/` 补全 **单一数据源**（`commands[].scenes`） | `agents/registry.yaml` · [shared §5.3.9a](./05-chat-shared.md) |
| UX-01 | **本期不做**项汇总：会话内搜索、侧栏快捷新建、checkpoint、聊天增强裁剪、自选拖拽、Preview 所见即所得、XMind/mindmap 等 | §0.3.1、§1.3、[watchlist §9.3.8](./09-fund-watchlist.md) |
| SCH-01 | 定时持仓分析：**自然日**调度 + 行情取 **`as_of_trade_date`（最近交易日）**；日历 Tushare/AKShare 公开数据 | §4.2.1 |
| SCH-02 | **不做**定时页「立即执行」；临时分析走 **持仓分析 Tab** 手动触发 | §4.2.1、§8 |
| SCH-03 | 定时持仓分析 **执行时刻可配置**（**系统本地时区** · **00:00–23:59** · **默认 09:00**）；编辑弹窗配置，存 `run_at_time` | §4.2 |
| SCH-04 | 侧栏与页标题 **「定时持仓分析」**；**状态卡片 + 任务日志**（无配置列表表） | §4.2.0a、§4.2.0e |
| SCH-05 | 每月 **1–31 日**；短月 **当月最后一日**；每周 **周一～周日** 可多选 | §4.2.0c |
| SCH-06 | **`scheduled_jobs` migration seed 1 行**；每次触发 **新建 portfolio 对话** + 后台 Harness + **直发报告** | [scheduled §4.2.6](./04-scheduled-tasks.md)、§4.2.2 |
| SCH-07 | **触发** = 本地时区本地日历；**`as_of_trade_date`** = 触发瞬间 **北京时间日历日** + `trading_calendar` | §4.2.1a |
| SCH-08 | **错过不补跑**；**任务日志**表 `scheduled_job_runs` 展示触发/状态/报告链接/失败·跳过原因 | §4.2.0e、[scheduled §4.2.6](./04-scheduled-tasks.md) |
| SCH-09 | **手动优先**；**同日已有 manual 持仓报告** → 定时 **skipped**；清空持仓 **`holdings_confirm` 同事务关定时** | §4.2.3、[scheduled §4.2.6](./04-scheduled-tasks.md) |
| SCH-10 | **录入持仓** = POST **新对话** → `/?c={id}` · portfolio | §4.2.0f |
| SCH-11 | **`trading_calendar` 表**；进定时页 **缺当前年则拉 Tushare/AKShare**；**禁止 LLM 猜日历**；seed **`trading_calendar_2026.sql`** | [scheduled §4.2.6](./04-scheduled-tasks.md)、§4.2.1 |
| SCH-12 | 定时对话标题 **`定时持仓分析 · {YYYY-MM-DD}`**；**连续 3 次 failed** → 自动关定时 + Toast | §4.2.2 |
| SCH-13 | **SSE≈SZSE 休市日** · 仅存 SSE；QDII 市值 **≥30%** 时报告页眉追加披露节奏说明（不换日历） | §4.2.1、§8.4.1 |
| SCH-14 | s14 **60 秒轮询**；**App 进程存活**才触发（可托盘后台）；关 App 不补跑 | §4.2.6 |
| SCH-15 | **Verify**=机器校验 · 定时 **跳过**人工确认卡；Verify 失败→`failed`；若链路需人工→`skipped` | §4.2.2b |
| SCH-16 | 页顶/编辑弹窗对客：**须保持应用运行** · 关闭不补跑 · 可手动持仓分析 | §4.2.0a |
| PORT-02 | 持仓报告概要：**QDII 占比 ≥30%** 追加 QDII 披露节奏说明句（SCH-13） | §8.4.1 |
| PORT-01 | 持仓报告 **7 节骨架**（§8.4.1）；有/无目标方案控制偏离与再平衡节 | §8.3、§8.4.1 |
| P-JSONB-01 | jsonb **细字段**编码迭代；顶层表 + 版本化规则以 PRD 为准；**全模块 PRD 出齐后**统一查漏 | §6、§7、mythinking |
| P-01 | **G-B 三层**：客户信息层 + **目标投资约束** + 分模板问卷 + 客户信息层/约束/跨约束 Hook | §6.0–6.4 |
| P-02 | 客户信息层问卷首行姓名；`marital_status` 为现状 | §6.1、§6.3 |
| P-12 | **税后收入**；贷款两字段；**不采公积金**；月可投公式 §6.1.1 | §6.1.1 |
| P-03 | 分模板预置资产 + 约束内 Hook（含 `deploy_mode`）+ 跨约束 Hook | §6.1–§6.2 主流程 |
| G-B | **人 + 目标投资约束**（非产品池）；方案绑 `goal_constraint_id` | §3.3、§6、§7.1 |
| PL-01 | **方案审视双 Hook**（冲突=0、漏洞=0）后方可确认写库 | §7.3 |
| PL-02 | `is_current`：**每 `goal_constraint_id` 一条**（仅 `plan_step=2`） | §7.1.1、§7.2 |
| PL-03 | 方案第二步写库 → **规划书草稿** → 用户 **确认发布** 后进「我的报告」（§7.4 · RPT-PUB-01） | §7.2、§7.4 |
| PL-04 | 跨约束 `principal` / `monthly` 合计超客户信息层上限：**容差 0** | §6.2.2、§7.3 |
| PL-05 | 约束 `is_active=false`：历史方案/报告 **只读** | §6.6、§7.5 |
| PL-06 | **`investment_goal_constraints`=目标投资约束（非产品池）**；方案 **仅公募基金**；**第一步** 仅 md→大类 · **第二步** 公开资讯+KB→明细+规划书 | §0.2.2、§7 |
| PL-PLAN-STEP-INPUT-01 | 分步输入绑定：md→大类；公开资讯+KB→明细/规划书 | §7.1.3 |
| PL-PLAN-KB-NO-PRIORITY-01 | §7 第二步：vault **无优先推荐权**；L0+L3 全市场初筛 → 入选后 L1 核验 | §7.1.3 · [§9.2.0g](./09-fund-knowledge.md) |
| PL-STAGE-PLAN-01 | §7 `workflow_tasks` **一级平铺** 任务图 · §7.11 | §7.11 · `plan_workflow_tasks.zh.yaml` |
| PL-STAGE-PROFILE-01 | §6 任务图 · 对客 **客户信息/投资需求** · **一级平铺** · `reasoning_summary` 口语补充 · §6.15 | §6.15 · `profile_workflow_tasks.zh.yaml` |
| PL-STAGE-FUND-01 | §9.1 任务图 · **fund_qa 两节点** + **fund_full_report 一级平铺** · 对客 **投资需求**（非「投资画像」）· §9.1.10 | §9.1.10 · `fund_workflow_tasks.zh.yaml` |
| PL-PLAN-PROFILE-MD-01 | §7 Gather **直接注入** PH-PROFILE-ENC-01 对齐的《投资需求报告》**md 全文**；**禁止** 压缩成字段摘要再送大模型；Hook 仍对主表 | §7.1.2 · [§4.1.0e RPT-PROFILE-02](./04-my-reports.md#410e-投资需求--当前版本rpt-profile-0103--p0) |
| PL-PLAN-NO-HOLDINGS-01 | §7 **设计时** 不读、不考虑持仓；与持仓衔接在 §8 | §7 模块说明 |
| PORT-NO-PLAN-DESIGN-01 | §8 **不** 生成大类/选基方案；只读持仓并对照 §7 `allocation_plans` | §8 模块说明 |
| P-06 | `financial_assets` **仅金融资产**，不含房产、不含公积金 | §6.1.1 |
| P-07 | `city_tier` **本期不采**（原选填已取消） | §6.1.1 |
| P-04 | 确认卡 **只读核对** + 确认/放弃；**修订一律聊天**（说明或再贴问卷）→ 新 propose 取代旧卡；**不做**卡上 inline 编辑；**对客** = 中文含义 + 结论（[shared §5.3.10b](./05-chat-shared.md) · `skills/shared/confirm_card.mock.zh.md`） | §6.1.4、§6.2.2、§7.4、[shared §5.3.10b](./05-chat-shared.md) |
| P-11 | 已有客户信息层/约束 **只问变更** | §6.4、§6.5 |
| RPT-PROFILE-04 | **完善** = 约束写库 + 投资需求报告 **确认发布**；放弃草稿 **默认不回滚** · **`has_unconfirmed` 仍 true**（选继续完成）· 删对话清绑定态 · 下游仅可选完善组 | [§6.0.1](./06-profile.md#601-完善的投资需求n-的定义--p0) · §6.2.8 |
| PH-PROFILE-UNDO-01 | 写库前 **保持上一版** · 首次=放弃 · 修改=discard 不写库 | [§6.0.4](./06-profile.md#604-写库前保持上一版ph-profile-undo-01--p0) |
| PH-PROFILE-UNDO-02 | 报告放弃草稿后同轮追问 · 续接或整包回滚 | [§6.2.8](./06-profile.md#628-写库--投资需求报告草稿--确认发布rpt-profile-b--p0-必做) |
| PH-PROFILE-UNDO-03 | **取消本次新建** = 停用 · **保留**同轮客户信息层 · 不假装还原 | §6.2.8 |
| PH-PROFILE-ROUTE-01 | 「重新做某场景」先问 **恢复 / 重新填** | [§6.2.1](./06-profile.md#621-选场景q-goal-pick) |
| PH-PROFILE-UNDO-04 | UNDO-02 **整包回滚** · 无分层按钮 | §6.2.8 |
| PH-PROFILE-ENC-01 | N/M 判定 · `Rep` 与 P + R* 一致 | [§6.0.1](./06-profile.md#601-完善的投资需求n-的定义--p0) |
| PH-PROFILE-RESTORE-01 | 恢复停用 **须用户确认发布投资需求报告** 后才进 N | [§6.6.2](./06-profile.md#662-恢复is_activetrue--ph-profile-restore-01) |
| PH-PROFILE-DELTA-01 | §6.5 **默认对话增量** | [§6.5.2](./06-profile.md#652-问卷怎么采--ph-profile-delta-01) |
| PL-PROFILE-PLAN-A | 资产配置 Tab 无旧需求续做 · 未完善不进 N | [§6.0.1](./06-profile.md#601-完善的投资需求n-的定义--p0) · §7.9 |
| RPT-PROFILE-05 | 续接 §6.2.8：**placeholder 提示 + 用户发话开跑** · **一次一组** · **禁止** silent 自动草稿 · **M** 库推导 | [§6.0.2](./06-profile.md#602-未完善组--续接-628rpt-profile-05--p0) |
| PH-PROFILE-RESTART-01 | **重新开始**：待确认 abandoned → 问 1 基本情况 / 2 选场景 → §6.1/§6.2 全量；不看草稿/发布史 | [§6.0.3](./06-profile.md#603-对话内重新开始ph-profile-restart-01--p0) |
| PH-PROFILE-PV-01 | §6.4 confirm：**批量 UPDATE** 活跃约束 `profile_version_id` → 新客户信息层 id | [§6.4.5](./06-profile.md#645-写库与下游) · §6.12.3 |
| PH-PROFILE-RPT-Q-01 | **审视待确认修改场景 ID 名单**：客户信息层/约束层变更均并入 · 每 id 触发 1 份报告 · 第 i/K 份 | [§6.2.8](./06-profile.md#628-写库--投资需求报告草稿--确认发布rpt-profile-b--p0-必做) |
| PH-PROFILE-GT-01 | MVP：每 `goal_type` 最多 1 活跃组；教育二孩一组内合并 | [§6.2.1](./06-profile.md#621-选场景q-goal-pick) · §6.2.5 |
| PH-PROFILE-GV-02 | 约束修改 **G2**：主表 UPDATE + **`goal_constraint_revisions` 快照**（= 确认卡 payload）· id 不变 · 发布绑 `goal_constraint_revision_id` · UNDO-02 从修订还原 | [§6.5.5](./06-profile.md#655-写库与下游ph-profile-gv-02--g2) · §6.12.6 |
| PH-01 | 五场景 **动态 placeholder**（§5.3.4）+ 四业务 Tab **空状态**（§6.11 / §7.9 / §8.8 / §9.1.0c）；`plan` 按 N 三分支；`portfolio` 按持仓两分支 | §5.3.2–§5.3.4、§5.3.16、§5.14 |
| HAR-01 | **s18 Run Workspace 本期做**；**不做 Git worktree**；`data/runs/{conversation}/{run_id}/` 草稿 → `data/reports/` 定稿 | §0.11.8、HARNESS §8b |
| HAR-02 | **s09 聊天记忆本期做**（§2.4）；仅沟通偏好；投资事实走 DB §7，不进 `user_memory` | §0.11.7、§2.4、HARNESS §7.3、§8 |
| HAR-03 | **s12 任务图 + s13 后台本期做**；阶段条=任务图 UI；s15–17 不做团队编排；**s20 编码验收**；§0.11.7 **做/不做**无 P0/P1 | §0.11.7–§0.11.12、HARNESS §8–§8d |
| HAR-04 | 任务图 **仅** Supabase **`workflow_tasks`**（与 `workflow_locks` 同库）；**不做** `data/tasks/*.json` | §5.11 |
| RPT-PROFILE-B | **需求梳理**待确认报告草稿 **本期做模式 B**（左 Preview · 右聊天 · 确认发布卡） | §1.2.5、§4.1.0、§6 |
| RPT-PROFILE-TPL | 投资需求报告 **开篇三块 + 七章** · 客户信息层完整 · 事实整理 + **需求理解** · **可选 0～2 图**（PROFILE-VISUAL-01）· Mock → `skills/profile/report.template.zh.md` · Spec → `profile-investment-requirements-report-spec.md` | §6.2.8 |
| PROFILE-THREE-SENT-01 | **三句话**：统一规则骨架 + **相对数据**（占比/年数/自洽标签等）+ **少量 LLM 仅润色**；**需求速览** 仍纯填表 · Spec §3.1 | §6.2.8 · `profile-investment-requirements-report-spec.md` §3.1 |
| PROFILE-LLM-QA-01 | 投资需求 **LLM 块**（三句话/§6）须 **格式清晰 + C 端友好 + 简洁**；`report-llm-quality` 规则质检 + refine 回退 + Verify | §6.2.8 · spec §3.1 · `report-refine.ts` |
| RPT-PLAN-TPL | 投资规划书 **章节 md 模板** · 含 echarts（全报告 ≥3）· Spec → `plan-allocation-report-spec.md` · Mock → `plan-allocation-report-sample.md` · Skill → `skills/plan/report.template.zh.md` | §7.4.1 · PL-REPORT-EC |
| RPT-PLAN-CLEAN-01 | 规划书对客 md **从 `#` 标题直接开始** · **禁止** 文首 Spec/PRD/Agent/`goal_type` 等开发块 | §7.4.1 · spec §6 · Verify #9 |
| RPT-PREVIEW-LINK-01 | **待确认草稿 Preview**：仅 **外部链接** + **已发布报告深链** 可点击；其余链 **不可点** · `linkPolicy='draft'` | §4.1.0f · §1.3.4 |
| RPT-CHAT-ROUTE-01 | 模式 B **确认前 chat** 三分流：报告-only / 改库本 Tab / 改库跨 Tab；Planner 信号 + 含糊先问 | §4.1.0g · §7.8.2 |
| RPT-OVERLAY-01 | **报告-only 增量** `report_overlay` · 绑对话 · 重生报告 **re-merge** · 不进模板 | §4.1.0h · §5.11.2 |
| RPT-OVERLAY-LEN | overlay 块 **>800 字** 须保留全文 + 生成 **≤220 字** `summary`（仅 Agent/摘要用） | §4.1.0h |
| PL-PLAN-SECTOR-01 | 大类确认后 **类内行业/风格** 可对话修订（第二步）；规划书 §四须说明结构；**未指定行业** → 资讯看好则 **≤1 卫星**，否则 **宽基分散** | §7.4.2 |
| PL-PLAN-DEPLOY-01 | 分批建仓 **分基金** · **货币固定** 首期 100% 不进定投 · §五 表 | §7.4.3 |
| PL-PLAN-DIALOG-01 | **第一步** 讨论偏少（0～2 轮）；**第二步** 明细为主讨论、**多轮修订正常**；`plan.s2.wait` 须留讨论空间 | §7.8 · §7.4 · §7.11 |
| PL-PLAN-ROUTE | 规划 **s2.wait / rpt.wait 分流**：明细卡改库 · 报告卡 overlay + 改库回明细/大类 | §7.8.2 · §4.1.0g |
| PL-PLAN-PREF-S2-01 | **行业/主题/选基偏好不做需求前置** · **仅第二步** 对话采集；§6 `category_preference` 本期不采 | §7.1.4 · §6.12.4 |
| PL-PLAN-L0-FULL-01 | 第二步 **L0 真全市场** 初筛 · 样例基金 **非** 默认池 | §7.1.5 |
| PL-PLAN-NET-BLOCK-01 | 第一、二步 **无联网则阻断** · **不** 降级 | §7.1.5 · §7.2 |
| PL-PLAN-S1-NET-01 | **第一步须联网** · `allocation_citations`（≤3）落库 · 失败阻断 | §7.1.3 · blueprint §3 |
| PL-PLAN-RISK-INDEX-01 | §六 **代理指数** 3Y+5Y 区间 · L0→拉数→联网→缺数不写 · **无查表** | blueprint §6 · spec §4.6 |
| PL-PLAN-QDII-01 | QDII **默认允许** · md/用户禁则剔除 | blueprint §4.1 |
| PL-PLAN-NO-COMMODITY-01 | **不推荐/不入池** 商品类基金 | blueprint §0 |
| PL-PLAN-RATIONALE-REFINE-01 | `allocation_rationale` **confirm 前润色一次** · 规划书纯填槽 | blueprint §3 |
| PL-PLAN-REASON-REFINE-01 | `recommendation_reason` **结构化 → LLM 润色** | blueprint §4 |
| PL-PLAN-HOOK-RETRY-01 | Hook 失败 **≤3 轮** LLM 重提议 · 仍失败出矛盾清单 | §7.2 · blueprint §3 |
| PL-PLAN-SCREEN-01 | `plan_screen_funds` 软过滤：股 **2亿/3年** · 债 **1亿/2年** · 货 **5000万/1年** · Top40 | blueprint §4.1 |
| PL-PLAN-BLUEPRINT-01 | 五 **goal_type** 共用骨架 · 槽位/seed 见 `plan-allocation-report-blueprint.md` | blueprint §1 |
| PL-PLAN-PICK-GOAL-01 | **N≥2** **场景选择器** 点选 `goal_constraint_id` | §7.1.5 · §7.9 |
| PL-PLAN-REBAL-JSON-01 | `rebalance_rule` 结构化：阈值 **5%** + `adjust_method` · 可对话改 | §7.4.3 |
| PL-PLAN-DEPLOY-BOND-01 | 债基按 **类型+环境+期限** 定首期/定投 · **`note`+Hook D4** · 用户可对话改 | §7.4.3 |
| PL-PLAN-OVERLAY-01 | 规划书 **report_overlay** · **§7 MVP**：存/merge/发布/重生 re-merge · **含** 长文摘要（800/220） | §7.1.5a · §4.1.0h |
| PORT-PANEL-01 | **当前持仓面板** 真源 = `holdings_versions.is_current`；首次录入 · 再次展示确认/调仓 | §8.1 |
| PORT-SNAPSHOT-01 | 持仓 **快照制**；同基不同买入日多行；`paid_amount`；卖出删行 | §8.2 · §8.9.2 |
| PORT-CHANGE-SUMMARY-01 | 每版 `holdings_versions` **必存** `change_summary`（jsonb）+ 可选 `previous_version_id` | §8.2.1 · §8.9.1 |
| PORT-PANEL-UI-01 | **已定**：模式 A `对话\|当前持仓`；模式 B `报告预览\|当前持仓`（同 fund 自选 Tab 范式） | §8.1.1 · §1.2.5 |
| PORT-RETURN-01 | 再次进入：**展示 + 一句询问**；不强制点「持仓仍准确」；分析说「重新分析」 | §8.1.2 |
| PORT-VISION-01 | 截图常缺买入日/支付金额 · **追问补齐** 后方可写库 | §8.1.3 |
| PORT-VISION-02 | 截图市值 **仅核对**；**必须**单独问清买入支付金额 | §8.1.3 |
| PORT-INPUT-01 | 持仓录入 **三种方式**：手输 / 持仓页截图 / 对账单截图（后两者 Vision 合并） | §8.1.3 |
| PORT-NO-FILE-01 | **不做** 聊天区 PDF/Excel/Word 解析；识图缺字段 → **对话补**；要表格 → 引导 **截图或打字** | §8.1.3 · §0.3 |
| PORT-VISION-BATCH-01 | 持仓 Tab 单次最多 **20 张** 图；推荐对账单截图 | §8.1.3a |
| PORT-SHARES-01 | 份额默认 = 支付金额 ÷ 买入日净值 · **确认卡展示可改** | §8.1.4 |
| PORT-PLAN-PUB-01 | 对照方案 **仅认已发布** 规划书；未确认草稿 **视为不存在** · 三选一话术 | §8.3.1 |
| PORT-NO-PLAN-WRITE-01 | **不** 反写资产配置方案 · 引导复制报告链至 §7 更新 | §8.3.3 |
| PORT-NAME-01 | 变体 A `持仓分析报告-{YYYYMMDD}` · B `{场景名}-持仓分析报告-{YYYYMMDD}`；列表展示 **完整 report_name** | §8.4.1 · §4.1.0d |
| PORT-COMPOSE-01 | 持仓报告 **TPL + compose LLM**（对齐基金）：三句话 · 章导语 · §四 分基 · §七 补句；TPL fallback | 蓝图 §3 · spec §7.2 |
| PORT-L0-GATHER-01 | `holdings_nav_gather` · **每次 gather force refresh** L0；单基失败「暂无行情」继续 | §8.3.5b · 蓝图 §4 |
| PORT-SCHED-VARIANT-01 | 定时：**仅 1 份**已发布方案 → **自动变体 B**；否则 A | §8.3.2 |
| RPT-PORT-FORMAT-01 | 持仓报告 **禁止「本章回答」**；正文章 **普通开篇段** + TPL 表/图 | 蓝图 §0 · spec §1 |
| PORT-RETURN-02 | 持有收益 **元 + % 双列**；含现金分红；清仓收益随份额带走不在表 | §8.3.5 · §8.3.5a |
| PORT-RETURN-DIV-01 | 分红自 Tushare [`fund_div`](https://tushare.pro/document/2?doc_id=120) / AKShare；份额以用户确认为准 | §8.3.5b |
| PORT-RETURN-ESTIMATE-01 | 持有收益为 **测算**；须对客说明；用户可对话补充分红/份额后改算 | §8.3.5c |
| PORT-ALLOC-COMPARE-01 | 对照方案：**买入支付金额** 算大类占比/偏离；**禁止** 用市值与方案比对 | §8.3.6 · spec §4.3 |
| PORT-HOLDINGS-IN-REPORT-01 | 报告正文 **必含 §一 当前持仓明细表**（绑定 `holdings_version_id` 快照）；不可仅汇总无明细 | §8.4.2a · spec §4.0 |
| RPT-PLAN-NAME-02 | plan 报告名 `{场景名}-资产配置方案-{YYYYMMDD}`；**不用**「投资规划」 | §4.1.0d · plan sample |
| PORT-VISUAL-01 | 持仓报告 **少而精**：A **2** 图（收益条+结构环）· B **3** 图（+方案对比柱）；表精确、图亮眼；**禁止** 成本柱/树图/雷达/仪表凑数 | spec §6 · sample |
| PORT-CATEGORY-MAP-01 | §三 展示大类可含 QDII/FOF/商品；§五 **折回** 股债货；混合按 L0 股票仓位拆分 | §8.3.7 |
| PORT-RISK-01 | §七 **轻量规则**（单基≥30%、前三≥60% 等）+ 模型补充 | §8.3.9 |
| PORT-NO-ANALYSIS-CARD-01 | **无** 分析结论卡；持仓确认 → 问方案 → 报告草稿 | §8.3.10 |
| PORT-STAGE-01 | 任务图 **A 录入 / B 准备 / C 报告** · yaml → `portfolio_workflow_tasks.zh.yaml` | §8.11 |
| PORT-FUND-NOTES-01 | §四 要点 **L0 + 可选 1 句 L1** | §8.3.8 |
| RPT-PORT-TPL | 持仓分析报告 **变体 A/B** · 蓝图 → `portfolio-report-blueprint.md` · Skill → `report.template.zh.md` · Spec → `portfolio-analysis-report-spec.md` | §8.4.2 · §8.10 · PORT-01 |
| SCENE-HANDLER-01 | Harness **五场景 Handler**（`scene_chat` + 四业务）；`scene_chat` **仅** `simple_qa` + handoff | §0.12.3、§5.6.2 |
| JTBD-01 | **一号用户**：演示/面试优先、叙事为 C 端投资者；**主线**=可审计多目标规划+持仓+单基；**副线**=自由问答；**Done**=三类报告生成 | §0.1a、§0.1b |
