> [← PRD 索引](../PRD.md) · **名词解释**

# 名词解释

读 PRD 遇生词 **先查本页**。定义 **只维护在此**；正文括号链过来即可。决项 ID 全表 → [appendix-d](./appendix-d-decisions.md)。

---

## 索引

## 1. 产品场景

### 五场景 Tab / 五个 `conversation_type`

底部 Tab 对应的五种对话模式，字段值与 Tab 一一对应：

| 对客 Tab | 字段值 | 一句话 |
|----------|--------|--------|
| 自由问答 | `chat` | 随便问理财问题；不写业务库 |
| 需求梳理 | `profile` | 梳理投资需求（客户信息层 + 多条目标投资约束） |
| 资产配置 | `plan` | 针对某一约束出资产配置与规划书 |
| 持仓分析 | `portfolio` | 录入持仓、诊断、再平衡 |
| 基金解读 | `fund` | 单只公募基金深度解读 |

**一线程一场景（CH-CONV-01）**：一条对话锁定后只承载一种场景，不在同一条历史里混多种业务消息。

### 主线 vs 副线

| 层级 | 用户要完成的事 | 对应 Tab | 任务完成（Done） |
|------|----------------|----------|------------------|
| **主线 ①** | 可审计的多目标投资规划 | 需求梳理 + 资产配置 | 《投资规划书》生成 |
| **主线 ②** | 持仓分析 | 持仓 | 《持仓分析报告》生成 |
| **主线 ③** | 单只基金深度研究 | 基金 | 《单只基金分析报告》生成 |
| **副线** | 随时问懂的理财助手 | 自由问答 | 当轮有效答复；复杂需求走 **Handoff** |

### JTBD（Jobs To Be Done · 用户要完成的工作）

产品用「用户要完成的进展」来排优先级，而不是按功能清单堆特性。详见 [00-overview §0.1b](./00-overview.md)。

### Done / 任务完成

用户可见的「这件事做完了」：

- 三条主线：对应类型的 **报告已发布** 到「我的报告」
- 副线自由问答：**没有**统一报告 Done，以当轮回答有效为准
- 需求梳理本身 **不是** 独立 Done，它是主线 ① 的前置输入

### 生效 Tab（effective Tab）

界面当前按哪个场景展示 placeholder、`/` 命令、空状态：

- 对话 **未锁定**（`type_locked=false`）：读 `metadata.active_tab`（用户点 Tab 预览，默认 `chat`）
- 对话 **已锁定**（`type_locked=true`）：读 `conversation_type`（与首句或 Handoff 一致）

### 类型锁定（CH-TYPE-01 · `type_locked`）

| 状态 | 含义 |
|------|------|
| 未锁定 | 新建对话占位为自由问答；切 Tab 只改 UI 预览，不改库里的场景类型 |
| 已锁定 | **首条用户消息** 或 **Handoff 点「前往」** 后，`conversation_type` 固定，不可在同对话内 PATCH 改成别的场景 |

---

## 2. 对话编排

### Planner（规划器）

每条用户消息的 **第一步**：理解用户想干什么，输出结构化计划 `ExecutionPlan`（JSON，不对用户展示）。  
再决定走简单问答、本场景正式流程，还是建议跨场景跳转。

**三类意图（`ExecutionPlan.intent`）**：

| 意图 | 中文 | 行为 |
|------|------|------|
| `simple_qa` | **简单问答** | 概念、闲聊、单点事实；本对话答完；**不写库、不出长报告** |
| `scene_task` | **本 Tab 主任务** | 当前场景的正式流程（需求梳理 propose、方案两步、持仓录入、基金完整报告等） |
| `cross_scene_handoff` | **跨场景建议** | 推测用户需要别的 Tab；**先问 + 跳转卡**；仅点「前往」才交接 |

**硬规则**：短问 **永远不** 误启场景流程——不管用户在哪个 Tab。

### Handoff（跨场景交接）

从 **当前对话** 引导用户到 **另一条目标场景对话**，并在目标对话里 **自动开跑** 正式流程（`scene_task`）。

**不是**：口头说「好的」就切 Tab；也不是在当前对话里静默写业务库。

**标准三步（HANDOFF-CONFIRM-01）**：

1. **先问**：助手用询问语气说明推测（例：「要跳转到需求梳理吗？也可以继续在这里聊。」）
2. **出跳转卡**：同轮展示 `handoff_card`（「前往 · xxx」+「暂不，继续当前对话」）
3. **才转化**：**仅**用户点击「**前往**」后：
   - `POST /api/handoff/prepare` 解析或新建目标对话
   - 前端跳转 `?c={目标对话 id}`
   - `trigger=handoff_autostart` 锁定类型 + 开跑句 + 阶段条

**自由问答 Tab 的职责**：只做 `simple_qa` + handoff（不进四业务的写库流程）。

**相关接口/字段**：

| 名称 | 含义 |
|------|------|
| `handoff_card` | 消息里的跳转卡片内容块 |
| `handoff_summary` | 点「前往」时注入目标 run 的摘要（≤500 字） |
| `handoff_autostart` | 在 **目标** 对话上触发的 stream 参数，表示 Handoff 后自动开跑 |
| `handoff_ready` | 服务端推送事件，含 `target_conversation_id` 供前端校正路由 |

**用户可不点卡**：继续发新消息 → 卡片灰化，不 handoff，按新消息重新理解。

### ExecutionPlan（执行计划）

Planner 每轮输出的 JSON，含 `intent`、`target_scene`、`steps[]` 等。  
**用户看不到 JSON**；界面只展示阶段条上的白话（C-07）。

### 阶段式流式（C-07）

**不是** ChatGPT 式逐字打字机为主。用户先看到：

1. **阶段条**（正在理解 / 正在检索…）
2. **工作过程**（1–2 句白话）
3. 可选折叠「过程说明」
4. 最后整块出现答复、确认卡或报告入口

技术：SSE 事件 `stage` / `progress` / `content_block` 等。

### SSE（Server-Sent Events · 服务端推送）

浏览器与后端的长连接，用于 **阶段条、内容块、Handoff 就绪** 等实时更新，而不是等整段回答生成完才返回。

### content_block（内容块）

助手消息里结构化的一块 UI，例如：

| `type` | 是什么 |
|--------|--------|
| `handoff_card` | 跨场景跳转卡 |
| `confirm_card` | 需求梳理/资产配置/持仓/报告等待用户确认的卡 |
| 正文块 | 普通 Markdown 答复 |

### Command（斜杠命令 · `/`）

用户在输入框输入 `/` 唤起的 **原子操作**列表（如 `/web_search`）。  
与 `agents/registry.yaml`、使用说明页 **同源**；不同 Tab 可见的子集不同（chat Tab **没有**写库类 Command）。

### `?c=`（对话 URL 参数）

当前打开哪条历史对话。无 `?c=` 时走 **CH-FIRST-01**：最近一条或新建。

---

## 3. Agent 与 Harness

### Harness（智能体运行框架）

整条 Agent 链路的总称：**不是**一个超长提示词，而是 **Planner + 场景 Handler + 工具 + 校验 + 产物** 的循环。  
详文 → [HARNESS.md](../HARNESS.md)。

**核心循环**：Gather（Gather 上下文）→ Act（执行）→ Verify（校验）→ Repeat。

### 场景 Handler（Scene Handler · `scene_*`）

负责 **用户可见** 某一 Tab 工作流的 Agent，共五个：

| ID | 场景 |
|----|------|
| `scene_chat` | 自由问答 |
| `scene_profile` | 需求梳理 |
| `scene_plan` | 资产配置 |
| `scene_portfolio` | 持仓分析 |
| `scene_fund` | 基金解读 |

方案 A（E-03 · **已定**）：五个都算 Handler；其中 `scene_chat` **只做** `simple_qa` + handoff。

### 基础设施 Agent（`infra_*`）

用户 **不直接感知** 的后台角色：写报告文件、读写字库、基金知识库检索等。  
场景 Handler **通过 Command/Tool 调用**，不绕过工具层直接写 SQL。

| 示例 ID | 职责 |
|---------|------|
| `infra_md_writer` | 写本地报告 Markdown + 更新报告索引 |
| `infra_db_read` / `infra_db_write` | 读/写 Supabase 业务表（写仅在用户 confirm 之后） |
| `infra_fund_knowledge_read` | 单基金知识库检索 |

### Skill（技能）

多步骤工作流说明文件（`SKILL.md`），如「需求梳理」「生成规划书」。  
Handler 按 Skill 编排，**禁止**用超长 prompt 替代 Skill。

### Tool / Command（工具 / 命令）

Harness 可调用的 **原子能力**（联网、读报告、profile propose等）。  
Command 是 Tool 在聊天里的命名；可单独联调。

### Subagent（子智能体）

独立上下文里跑子任务，**只回传摘要**给主循环，避免上下文撑爆。

### Verify（校验）

写库或发布前的 **规则检查**（schema、合规、引用是否存在、报告骨架是否齐全等）。  
**Evaluator 规则优先于** 模型自评。

### propose → confirm → write（提议 → 确认 → 写入）

业务写路径的标准节奏：

1. **propose**：Agent 生成建议（问卷答案、持仓变更、方案表…），展示 **确认卡**
2. 用户 **confirm**（点确认或改后再确认）
3. **infra_db_write** 等 **才** 写入数据库

**禁止**跳过 Verify 或用户确认直接写库。

### Run / run_id（一次运行）

一次完整的 Agent 执行实例。草稿报告路径：  
`data/runs/{conversation_id}/{run_id}/draft-report.md`（HAR-01 · Run Workspace）。

### workflow_tasks（任务图）

Planner 步骤同步落库的任务表，驱动 **阶段条** 展示（s12 · HAR-03）。

### workflow_locks（写流程互斥锁 · SH-08）

`profile` / `plan` / `portfolio` 三个场景 **同一时刻只允许一条写流程 stream**。  
**注意**：侧栏橙点（`has_unconfirmed`）**不是**写锁；未点确认的卡片不占锁。

### 上下文压缩（Compact · L1–L4）

对话太长时，在 **每次** 调大模型前按层裁剪/摘要历史；L4 后须从数据库 **重注入业务锚点**（`profile_version_id`、报告 id 等）。详文 → HARNESS §6–§7。

### registry.yaml（注册表）

`agents/registry.yaml`：五场景 Command、`/` 补全、使用说明页的 **单一数据源**（REG-01）。

---

## 4. 报告与布局

### 三类 / 四类报告

「我的报告」页四个 Tab，对应 `report_type`：

| Tab | `report_type` | 本地目录 |
|-----|---------------|----------|
| 需求梳理 | `profile` | `data/reports/profile/` |
| 投资规划 | `plan` | `data/reports/plan/` |
| 持仓分析 | `portfolio` | `data/reports/portfolio/` |
| 基金解读 | `fund` | `data/reports/fund/` |

### 模式 A / 模式 B（RPT-LAYOUT-01）

| 模式 | 何时 | 主区布局 |
|------|------|----------|
| **模式 A** | 无待确认 **报告** 草稿 | 聊天居中（或 profile 等纯对话） |
| **模式 B** | plan/portfolio/fund（及 profile 若有）有 **报告草稿** | **左：报告 Preview · 右：聊天列** |

需求梳理/资产配置/持仓的 **业务确认卡** 在消息流（瘦卡 + `artifact_id`）；**报告确认发布卡** 在模式 B 的 **右侧聊天列**（RPT-CARD-01）。  
**对客原则**（P-04）：卡片只展示 **中文含义 + 结论**（或表格 **对客列名**），不暴露字段名、库表、内部分组；通则 → [05-chat-shared §5.3.10b](./05-chat-shared.md)。

### 业务确认卡 vs 报告草稿（ARTIFACT-01）

| | **业务确认卡 · Propose Artifact** | **报告草稿** |
|---|-----------------------------------|--------------|
| **确认什么** | 结构化数据（需求梳理/资产配置/持仓表） | Markdown 报告全文 |
| **存储** | `propose_artifacts` + `runs/…/artifacts/{id}.json` | `runs/…/draft-report.md` |
| **消息里** | 瘦 `confirm_card`（`artifact_id` + `summary_zh`） | 报告 **确认发布卡** + `pending_report_draft` |
| **点确认后** | 写 **业务表**（各模块 §字段规格） | **publish** → `report_index` + `data/reports/` |
| **模式 B** | **不**因业务卡 alone 进入 | 有 pending 报告草稿时进入 |

典型链路（方案）：大类 artifact → confirm → DB → 明细 artifact → confirm → DB → **规划书 md 草稿** → 报告发布卡。

### Propose Artifact（指针化 · ARTIFACT-01）

**propose 大 JSON 不进 messages**；真源在表 + 文件：

| 组件 | 作用 |
|------|------|
| **`propose_artifacts`** | 索引：`id`、`kind`、`status`、`summary_zh`、`payload_path` |
| **JSON 文件** | `data/runs/{conv}/{run}/artifacts/{id}.json` 全量 payload |
| **瘦 `confirm_card`** | 消息里只有 `artifact_id` + ≤120 字摘要 + 按钮态 |
| **`artifact_read`** | LLM 按需读 payload；压缩后 **禁止** 从历史 message 复读全表 |
| **`GET /api/artifacts/:id`** | 前端 **只读**渲染确认卡 |

用户 **confirm** 后：业务真源在 **Supabase 业务表**；artifact 标记 `confirmed`。  
详文 → [05-chat-shared §5.3.10b / §5.11.5](./05-chat-shared.md)。

### 报告草稿 vs 已发布

| 阶段 | 存哪 | `report_index` 表 | 用户在哪看 |
|------|------|-------------------|------------|
| **待确认草稿** | `data/runs/.../draft-report.md` | **无** | 场景内模式 B Preview |
| **已发布** | `data/reports/{type}/…` | **有** | 「我的报告」 |

### 确认发布（RPT-PUB-01）

用户点报告 **「确认发布」** 后，才写入 `report_index` 并出现在「我的报告」。  
**Verify 通过 ≠ 自动发布**（定时持仓分析为例外：Verify 后直接发布 · RPT-SCHED-01）。

### `has_unconfirmed`（待确认 · 侧栏橙点 · SH-04）

对话 metadata 布尔值：**有没有** 待用户确认的内容（报告草稿卡、需求梳理/资产配置/持仓确认卡）。  
用于侧栏 **橙点** 和删对话时的加强确认；**不**存具体字段内容。

### `pending_report_draft`

metadata 里指向 **报告 Markdown 草稿** 的索引（类型、run_id 等）；与 `has_unconfirmed` 配合。

### `pending_artifact_ids`

metadata 里可选的 **pending propose artifact** 的 uuid 列表；**不**存 payload。与 `propose_artifacts.status=pending` 同步。

### ReportMarkdownPreview（报告预览组件 · PREVIEW-01）

全产品共用的 Markdown 预览（Mermaid 图、ECharts 等）；用于我的报告、模式 B、设置里的聊天记忆等。

### report_read（读已发布报告）

用户把「我的报告」**复制链接** 贴进聊天时，Planner 识别后调用；**只读**已发布 md，不新建草稿。

### fund_qa vs fund_full_report（FUND-INTENT-01）

| 意图 | 用户要什么 | 出报告吗 |
|------|------------|----------|
| `fund_qa` | 费率、业绩等 **简答** | **否** |
| `fund_full_report` | 完整解读 / 「AI 解析」 | **是** → 草稿 → 确认发布 |

**提到基金代码 ≠ 自动出长报告**。

---

## 5. 需求梳理与方案

### 客户信息层

客户基本情况与现金流快照（收入、资产、家庭、月可投资等），存于 `profile_versions.basic_info`。  
**对客**阶段条与 placeholder 写 **客户信息**；PRD 对内统称 **客户信息层**（不用 ~~人层~~）。

### 投资需求

按投资目标场景整理的一组约束与金额，及对应的《投资需求报告》；存于 `investment_goal_constraints` + `report_index`（`report_type=profile`）。  
**对客**统称 **投资需求**（不用 ~~客户画像~~、~~投资画像~~）。

### G-B 三层 / 需求梳理

**客户信息层**（收入、资产、家庭等）+ **多条目标投资约束** + 分模板问卷。  
表：`profile_versions`、`investment_goal_constraints`。

**完善的一组**（计入资产配置 Tab **N** · **下游唯一可选**）：PH-PROFILE-ENC-01 — `is_active=true` + 约束已写库 + 最新已发布投资需求报告的 `profile_version_id` 与 `goal_constraint_revision_id` 分别等于当前客户信息层与当前修订。详见 [§6.0.1](./06-profile.md#601-完善的投资需求n-的定义--p0)。

**待续接 M**：已写库约束中 **不满足** 上式的活跃组数 · [§6.0.2](./06-profile.md#602-未完善组--续接-628rpt-profile-05--p0)。

### 目标投资约束（`investment_goal_constraints`）

**一组**理财目标的条件与金额（期限、风险、投入方式等），**不含**具体基金代码。  
外键：`goal_constraint_id`。  
**MVP（PH-PROFILE-GT-01）**：每种场景类型（`goal_type`）**最多 1 个**活跃组；不同类型可并存（如教育 + 养老）。二孩教育 **一组内合并**，见 [§6.2.5](./06-profile.md#625-education--子女教育q-goal-ed)。  
**修改约束（PH-PROFILE-GV-02 · G2）**：每次 confirm **INSERT 修订快照** + **UPDATE 主表**；`goal_constraint_id` **不变**；回滚/发布对齐靠 **`goal_constraint_revisions`** 与 `report_index.goal_constraint_revision_id`，**不**从报告 md 反解析。

**易混**：不要用「产品池 / pool」——已定废弃 pool 命名。

### 资产配置两步（PL-06）

针对 **某一** `goal_constraint_id`：

| 步 | 产出 | 用户动作 |
|----|------|----------|
| **1 · 大类** | 货基/债基/权益等 **比例** + 设计原因 | 确认 → 写库 `plan_step=1` |
| **2 · 明细** | 各大类下 **具体公募基金** `fund_code` + 推荐原因 | 确认 → 写库 `plan_step=2` → **规划书草稿** |

第一步 **不出** 基金代码；第二步 **必须出** 国内公募代码。  
**写库** 与 **规划书发布** 是两步：后者须用户 **确认发布**。

### `is_current`（当前方案 · PL-02）

每个 `goal_constraint_id` 仅一条 **当前** 生效的方案（`plan_step=2`）。

---

## 6. 基金与知识库

### 单基金知识库

按 **基金代码** 隔离的本地披露文件 + 索引；管理页上传 PDF 等。  
**聊天区不上传** 基金 PDF（FK-PDF-01：PDF 在 **知识库管理页** 为一等格式）。

### KB-01 / KB-02 / KB-03（知识库决项）

| ID | 是什么 |
|----|--------|
| **KB-01** | **官方披露**：本地 Markdown + **全文检索（FTS）** + explore 探索 + 块级引用 |
| **KB-02** | **语义子库**：单基金 **FAQ 约 15～30 条**（A 档 019305 **30 条 seed**）→ **Supabase 向量库（pgvector）**；专家观点 **仅** vault + L1 |
| **KB-03** | **来源优先级瀑布**：L0 → L1 → L2 → L3，**禁止跨层 merge 后统一排序** |
| **KB-03-VALID-01** | 各层 **有效结果** 判定：L0 按 intent 字段组；L1/L2/L3 层内阈值；L3 仅在缺口/舆情 intent 时触发 |
| **EMB-FILTER-01** | **文本嵌入主用途**：L1/L2/L3 **层内** recall→embedding 重排；**非**披露全文向量库；**设置可关** |

### L0 / L1 / L2 / L3（四层来源）

| 层 | 含义 | 示例 |
|----|------|------|
| **L0** | 结构化 **行情/基础数据** | Tushare、AKShare（`fund_lookup`） |
| **L1** | **官方披露** 文本块 | 招募书、概要、定期报告（FTS） |
| **L2** | **语义子库（小 FAQ）** | 口语问法拆解（pgvector 索引 FAQ）→ 引导 L1；层内筛选走 **EMB-FILTER-01** |
| **L3** | **联网兜底** | 公开网络检索；L0–L2 无效或不足时 **加强** |

**L0-FALLBACK-01**：L0 挂了不阻断报告，用 L3 补行情并标注来源。

### FTS（Full-Text Search · 全文检索）

在披露文本块上做 **关键词匹配**（SQLite FTS5），不是向量相似度。

### explore / `fund_knowledge_explore`（CG-01）

一次调用返回 **情报卡片**：按文件/章节分组的有界片段 + `chunk_id`，优先于链式读文件。

### FK-CITE（披露引用块）

报告里的 **参考披露** 须能追溯到知识库 **块 id**（哪份文件、哪一节、哪几行），保证可审计。

### archetype（报告骨架变体 · FK-18-ARCH）

基金完整报告根据 L0 数据在 **A～F** 模板间选型，决定第四章等章节结构；默认回退 **D**。

### DEMO-ABC-01（演示三只基金）

| 代码 | 梯度 | 用途 |
|------|------|------|
| 019305 | A 档满配 | 知识库 + 语义库 + 引用满配 |
| 017704 | B 档 | 部分能力 |
| 206007 | C 档 | 故意不建库，测降级文案 |

### 自选（watchlist）

用户关注的基金列表；默认 seed 三只（WL-01）。「AI 解析」会切到基金对话并注入消息再跑 Harness（WL-03）。

---

## 7. 设置与数据

### SET-DB-01（数据库阻断）

| 检测通过 | 可用能力 |
|----------|----------|
| 仅推理 + 联网 | **自由问答** Tab |
| + 数据库 | **需求梳理 / 资产配置 / 持仓 / 基金** 四业务 |

### BYOK（Bring Your Own Key · 自备密钥）

用户在设置页配置自己的模型、联网、数据库等密钥（G-05：加密存库为主路径）。

### Supabase / pgvector

主业务库与 **L2 FAQ 语义向量** 存同一 Supabase 项目；**不做**独立 Milvus/Chroma（G-03）。  
**pgvector** 主要用于 **FAQ 小库索引**；运行时 **L1 披露仍走 FTS**，跨层筛选靠 **EMB-FILTER-01**（与 pgvector 分工不同）。

### SET-EMB-01 / 文本嵌入槽位

第五模型槽位 **embedding**。**主职责** = 基金解析时 L1/L2/L3 已召回候选的 **层内语义重排**；**子职责** = L2 FAQ 写入 pgvector。用户可在 **设置 → 模型 → 文本嵌入** **关闭**「启用基金解析语义筛选」→ 降级为关键词/FTS，**不阻断**聊天。

### 聊天记忆（`user_memory` · HAR-02）

仅存 **沟通偏好** 类短记忆；**投资事实** 走业务表，不进聊天记忆。

---

## 8. 决项 ID 索引

完整表格 → [appendix-d-decisions.md](./appendix-d-decisions.md)。此处按主题 **速查**。

### 对话与 Handoff

| ID | 一句话 |
|----|--------|
| CH-TYPE-01 | 首句或 Handoff「前往」才锁定场景类型 |
| CH-CONV-01 | 一条对话一场景 |
| CH-TAB-01 | 已锁定且 Tab 不对 → 无历史静默新建；有历史确认新建或侧栏自选 |
| HANDOFF-CONFIRM-01 | 跨场景先问+出卡；仅点「前往」；可不点继续聊 |
| **ARTIFACT-01** | 业务确认卡 propose 指针化；payload 进 artifact |
| PLANNER-ROUTER-01 | 五 Tab 均有 Planner 三分流 |
| SHELL-NAV-01 | 切 Tab/历史不拦截；橙点看 `has_unconfirmed` |

### 报告

| ID | 一句话 |
|----|--------|
| RPT-DRAFT-01 | 草稿绑对话；每对话 1 份 |
| RPT-PUB-01 | 确认发布才进「我的报告」 |
| RPT-LINK-01 | 复制链接回聊天 → `report_read` |
| RPT-SCHED-01 | 定时持仓 Verify 后直接发布 |

### 基金与知识库

| ID | 一句话 |
|----|--------|
| FUND-INTENT-01 | 提到代码 ≠ 出长报告 |
| FK-PDF-01 | 披露 PDF 在知识库页必支持 |
| **EMB-FILTER-01** | L1/L2/L3 层内 embedding 重排；设置可关 |
| **KB-03-VALID-01** | 瀑布各层有效结果 + L3 触发规则 |
| CG-01-XDOC | 本期不做跨文档强制对比 |

### Harness

| ID | 一句话 |
|----|--------|
| HAR-01 | Run 工作区 `data/runs/` |
| HAR-02 | 聊天记忆本期做；事实走 DB |
| HAR-03 | 任务图 + 后台任务本期做 |

---

## 9. 易混对照

| 容易混 | 实际区别 |
|--------|----------|
| **Handoff** vs **切 Tab** | 切 Tab 在未锁定时只改 UI 预览；Handoff 是 **点「前往」** 后打开 **另一条对话** 并自动开跑 |
| **Handoff** vs **口头「好的」** | 只有 **点卡片「前往」** 才算 Handoff |
| **业务确认卡** vs **报告草稿** | 前者 confirm → **DB 表**；后者 publish → **md + 我的报告** |
| **propose artifact** vs **报告 draft** | 前者 JSON 在 `artifacts/{id}.json`；后者 md 在 `draft-report.md` |
| **`simple_qa`** vs **`scene_task`** | 前者本对话答完不写库；后者走正式业务流程 |
| **`cross_scene_handoff`** vs **Handoff** | 前者是 Planner **意图**；后者是用户点「前往」后的 **整套产品行为** |
| **`has_unconfirmed`** vs **写锁** | 橙点 = 有待确认 UI；写锁 = `workflow_locks` 里正在跑的写流程 |
| **模式 B** vs **确认卡** | 模式 B 是 **布局**（左报告右聊天）；确认卡是 **消息流里的交互块** |
| **草稿** vs **已发布** | 草稿在 `data/runs/`、无 `report_index`；已发布在 `data/reports/` |
| **目标投资约束** vs **方案明细** | 约束 = 目标条件 **无基金**；方案第二步才有 `fund_code` |
| **L1 披露** vs **L2 语义库** | L1 = 官方 PDF 转文本 + FTS（含 expert_opinion md）；L2 = 口语 FAQ 小库（pgvector 索引） |
| **EMB-FILTER** vs **L2 pgvector** | pgvector = FAQ **索引/问法拆解**；embedding 槽位 **主做** L1/L2/L3 **层内重排**，可在设置关闭 |
| **五场景** vs **四业务场景** | 五场景 **含** 自由问答（`scene_chat`）；四业务 = 需求梳理/资产配置/持仓/基金 · **SCENE-HANDLER-01** |
| **`active_tab`** vs **`conversation_type`** | 未锁定时 UI 看前者；锁定后以 **后者** 为准 |

---

## 10. 缩写与外部词

| 词 | 解释 |
|----|------|
| **PRD** | 产品需求文档 |
| **MVP** | 最小可行产品（本期范围） |
| **JTBD** | 用户要完成的工作（见 §1） |
| **SSE** | 服务端推送（见 §2） |
| **FTS** | 全文检索（见 §6） |
| **REST** | HTTP 接口风格（`/api/...`） |
| **JSON** | 结构化数据格式；ExecutionPlan 等 |
| **UUID** | 通用唯一 id（对话、报告等） |
| **ECharts** | 报告内图表库 |
| **Mermaid** | 报告内流程图语法（须 mermaid-cli 校验 · MERMAID-01） |
| **Tushare / AKShare** | 国内基金/行情数据接口 |
| **Vision** | 图片理解能力（`vision_parse` · VISION-ALL-01） |

---

*文档维护：新增专有名词时在本文件增一条；PRD 正文只保留一行链接，不复制长定义。*
