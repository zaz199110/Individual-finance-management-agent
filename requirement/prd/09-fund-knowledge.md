> [← 基金域总览](./09-fund.md) · **9.2 基金知识库维护**

## 9.2 基金知识库维护

### 模块说明

| 项 | 说明 |
|----|------|
| **做什么** | 上传披露材料 → md → 切块 + FTS 索引；L2 语义 FAQ（seed/CLI）；块级维护 |
| **入口** | 侧栏 **基金知识库** → `/fund-knowledge`（PC 客户端 · UX-PC-01） |
| **完成标志** | 上传或刷新后 **索引已同步**（或明确失败原因 + 重建引导） |
| **不做** | 聊天里上传 PDF（§0.3）；解析写报告（→ §9.1）；App 内删整份文档；拖拽上传；覆盖上传 |
| **编码锚点** | §9.2.0 · FK-01～FK-27 · 嵌入槽 §2.2.7 |

Hub 对照 → [§9.0](./09-fund.md)。**存储架构与 KB-03** → 本节 **§9.2.0**（本文件权威，不另开 data-architecture 章节）。

**与自选的关系**：`fund_watchlist` 仅为「方便做 AI 解析的收藏夹」；知识库基金列表 = **vault 已有目录** ∪ 上传时新建，**不**依赖是否在自选。

---

### 9.2.0 存储架构与检索（技术规格 · 本模块权威）

> **决项索引**：KB-01（披露 FTS）· KB-02（语义 pgvector）· KB-03（四层瀑布）· FK-CITE · CG-01-MVP → [appendix-d](./appendix-d-decisions.md)。  
> **实现母版**：`{APP_ROOT}/src/harness/infra/fund_knowledge/` · CLI `scripts/fund-knowledge/`  
> **UI 与运维**（上传页、Preview、REST）→ 下文 §9.2.1 起。

#### 9.2.0a 根目录与文件夹（KB-01）

| 项 | 规格 |
|----|------|
| **根目录** | `{APP_ROOT}/data/fund-knowledge/`（管理页只读展示绝对路径） |
| **单基金目录** | `{fund_code}-{fund_name_en}` · 例 `206007-Penghua-Consumer-Select` |
| **文件类型子目录** | 英文 `doc_type`（下表）；每只基金预建全部类型含 `other` |
| **搜索索引** | `{APP_ROOT}/data/fund-knowledge/index.db`（SQLite + FTS5） |
| **原始文件** | 可选 `raw/{doc_type}/` 保留上传原件 |

| 对客中文 | 目录名 `doc_type` | 典型材料 |
|----------|-------------------|----------|
| 招募说明书 | `prospectus` | 招募书、合同、产品概要 · **PDF** |
| 季报 | `quarterly_report` | 季度报告 · PDF |
| 半年报 | `semiannual_report` | 半年度报告 · PDF |
| 年报 | `annual_report` | 年度报告 · PDF |
| 专家观点 | `expert_opinion` | 研报摘录 · PDF/MD |
| 其他 | `other` | 未归类 |

#### 9.2.0b 检索接口与 CLI

| Harness Tool | 用途 |
|--------------|------|
| `fund_knowledge_explore` | 披露 · FTS 情报卡片 |
| `fund_knowledge_semantic_search` | 语义 FAQ · pgvector（§9.2.0f） |
| `fund_lookup` | L0 行情（§9.1.8，非 vault） |

```bash
fund-knowledge explore --fund 019305 --query "投资范围与费率"
fund-knowledge index --all
fund-knowledge index --fund 206007
fund-knowledge semantic index --fund 019305
```

输出预算：单基金 explore 硬顶 **≤ ~24K 字符**；探索次数建议 1～3 次，大 vault 最多 5 次。

#### 9.2.0c 上传转换管线（FK-PDF-01）

| 格式 | 转换 | Vision |
|------|------|--------|
| PDF（有文字层） | PyMuPDF 逐页 | 否 |
| PDF（扫描页） | 该页 OCR 回退 | 是（仅回退页） |
| DOC/DOCX、MD、TXT、表格、图片 | 各等价转换 | 图片/OCR 回退时用 Vision 槽 |

步骤：管理页选基金+类型+文件 → 转 md + frontmatter → 增量索引（§9.2.5）。**禁止**在聊天区上传披露 PDF（§0.3）。

#### 9.2.0d 上下文工程（CG-01-MVP）

对标 CodeGraph explore：**一次 `fund_knowledge_explore` 优先**于链式读整文件；FTS + doc_type 加权 + 同文件共现；低置信度返回 `LOW_CONFIDENCE`。  
**本期不做**：跨文档对比 playbook（CG-01-XDOC · P2）、关系图谱（CG-01-Full）。

**自适应输出预算（按单基金 md 文件数）**

| 单基金文件数 | `maxOutputChars` | `defaultMaxFiles` | `maxCharsPerFile` |
|--------------|------------------|-------------------|-------------------|
| < 8 | 13K | 4 | 3.8K |
| < 20 | 18K | 5 | 3.8K |
| ≥ 20 | 24K | 8 | 6.5K |

- 硬顶 24K：避免 tool-result 被外化后再 Read  
- 单块默认 ≤ ~1500 字符  
- 探索次数：建议 1～3 次，大 vault 最多 5 次  

**反模式（须写入 Skill）**：链式 read 整份招募书；vault 目录 grep；同一主题多次 explore 不收窄 query。

#### 9.2.0e 块索引与 FK-CITE（SQLite `index.db`）

**表 `knowledge_chunks`**

| 中文含义 | 字段名称 | 字段类型 | 字段长度 | 是否必填 | 字段校验 | 值的相关说明 |
|----------|----------|----------|----------|----------|----------|--------------|
| 块主键 | `chunk_id` | text PK | — | 是 | — | 如 `fk_{fund_code}_{hash}_{line_start}` |
| 基金代码 | `fund_code` | text | 6 位 | 是 | — | 与 vault 目录一致 |
| 文档类型 | `doc_type` | text | — | 是 | §9.2.0a | 文件夹英文名 |
| 文件路径 | `file_path` | text | — | 是 | — | 相对 `data/fund-knowledge/` |
| 章节标题 | `heading` | text | — | 是 | — | `##` / `###` 文本 |
| 标题层级 | `heading_level` | int | — | 是 | 2/3… | — |
| 起始行号 | `line_start` | int | — | 是 | 1-based | md 源码 |
| 结束行号 | `line_end` | int | — | 是 | ≥ start | md 源码 |
| 文件内容哈希 | `file_content_hash` | text | — | 是 | — | 增量重建检测 |
| 索引时间 | `indexed_at` | text | — | 是 | ISO8601 | — |

**表 `maintenance_log`**

| 中文含义 | 字段名称 | 字段类型 | 是否必填 | 值的相关说明 |
|----------|----------|----------|----------|--------------|
| 日志主键 | `id` | integer PK | 是 | AUTOINCREMENT |
| 操作类型 | `type` | text | 是 | `upload` / `refresh_reindex` / `manual_reindex` / `chunk_delete` |
| 基金代码 | `fund_code` | text? | 否 | — |
| 文件路径 | `file_path` | text? | 否 | 相对 vault |
| 执行状态 | `status` | text | 是 | `success` / `failed` / `partial` |
| 块数量 | `chunk_count` | int? | 否 | — |
| 错误信息 | `error_message` | text? | 否 | 失败时 |
| 创建时间 | `created_at` | text | 是 | ISO8601 |

报告引用：正文脚注 + 末尾「参考披露」；`查看原文` → `/fund-knowledge?fund=&path=&line=`（§9.2.9a.7）。阶段条展示中文章节名，**非**裸 chunk_id。

#### 9.2.0f 语义子库（KB-02 · Supabase pgvector）

**表 `fund_semantic_entries`**

| 中文含义 | 字段名称 | 字段类型 | 字段长度 | 是否必填 | 字段校验 | 值的相关说明 |
|----------|----------|----------|----------|----------|----------|--------------|
| 主键 | `id` | uuid PK | uuid | 系统 | — | — |
| 基金代码 | `fund_code` | text? | — | 否 | — | FAQ 全局可为 `*` |
| 条目类型 | `entry_type` | text | — | 是 | 本期仅 `faq` | — |
| 标题/问法 | `title` | text | — | 是 | — | 口语问法摘要 |
| 正文 | `body` | text | — | 是 | 改后重算 embedding | 引导查 L1，非披露数字 |
| 向量 | `embedding` | vector(n) | — | 是 | 与嵌入槽一致 | pgvector |
| 来源路径 | `source_file_path` | text? | — | 否 | — | 相对 vault |
| 关联披露块 | `chunk_id` | text? | — | 否 | — | 可选 FK-CITE |
| 扩展元数据 | `metadata` | jsonb? | — | 否 | — | `suggested_doc_types` 等 |
| 更新时间 | `updated_at` | timestamptz | — | 是 | — | — |

MVP **100 条通用 FAQ**（`fund_code=*` · `seed/fund_semantic_entries.json`）；**任意基金**口语 intent 共用；专家观点 **不进** L2。运行时 Tool **只读**；禁止 Agent 自动 UPSERT L2（L2-SEED-01 · §9.2.10）。

#### 9.2.0g 知识来源优先级（KB-03 · 瀑布检索）

| 层级 | 来源 | 典型用途 | 引用形态 |
|------|------|----------|----------|
| **L0** | Tushare / AKShare | 净值、回撤、持仓、规模 | 工具结果 + **截止交易日** |
| **L1** | vault + `fund_knowledge_explore` | 费率、范围、风险揭示、定期报告 | **FK-CITE** |
| **L2** | `fund_knowledge_semantic_search` | 口语 intent（稳不稳、贵不贵）→ 引导 L1 | 「参考说明」 |
| **L3** | 联网（§2.2.5） | 舆情、新闻、宏观 | 外链 ≤5（CH-18） |

**冲突规则**

| 冲突 | 裁决 |
|------|------|
| L1 vs L3 | **以 L1 为准**；L3 仅作背景/舆情，分开标注 |
| L2 vs L1 | **以 L1 为准**；L2 引导查哪些披露主题 |
| L0 vs L3 | **以 L0 为准** |
| L0 vs L1 | **并列、分工**：L0=动态数字；L1=披露条款；可同时采用，**不混脚注** |

**瀑布原则**：先分题型 → 按层瀑布；同层满足即停；**禁止**四层结果合并后统一排序。

| 题型 | 首选层 |
|------|--------|
| 净值/回撤/持仓/规模 | L0 |
| 费率/范围/风险/披露正文 | L1 |
| 口语/观点 | 可先 L2，再收敛 L1 |
| L0–L2 均无有效结果 / 时效性 / 无 vault | 加强 L3 |

**基金筛选分场景（KB-03-SCREEN）**

| 场景 | 路径 |
|------|------|
| **A · 库内**（已有 vault） | L0∥L1 并列 → L2 → L3 |
| **B · 全市场**（§7 第二步） | L0+L3 **全市场初筛** → 入选后 **有 vault 才** L1 深度核验 · **vault 无优先推荐权**（**PL-PLAN-KB-NO-PRIORITY-01**） |

**§7 选基补充（PL-PLAN-KB-NO-PRIORITY-01）**：知识库 **不是** 推荐名单；**禁止** 仅从 vault 已有目录挑基金。候选须经 **L0 全市场 + L3 公开资讯** 初筛；库内材料 **仅** 用于入选后的 L1 核验与 FK-CITE。

**「有效结果」判定（KB-03-VALID-01 · 编码常量）**

| 层级 | 视为有效 |
|------|----------|
| **L0** | `fund_lookup` 返回非空且含 **本题 intent 所需字段组**（净值题：`nav`+日期；业绩题：收益/回撤；持仓题：`top_holdings`） |
| **L1** | 非 `LOW_CONFIDENCE` 且 ≥1 块带 `chunk_id`；启用 embedding 时 top-1 `embed_score ≥ 0.35`，否则关键词分 ≥ 2 |
| **L2** | top-1 超阈值（embedding **≥ 0.40** / 关键词 **≥ 3**）；命中后 **须收敛 L1**（带 `suggested_doc_types` / keywords） |
| **L3** | ≥1 条可解析 citation；启用 embedding 时 top-1 **≥ 0.30** |

**L3 触发（KB-03-L3-01）**

| 条件 | 行为 |
|------|------|
| 首选层 ∈ {L0,L1,L2} 且该层已有效 | **不调 L3**（除非用户显式要资讯/舆情） |
| 无 vault（C 档） | 跳过 L1；L0 有效则停，否则 L3 |
| 口语题 | L2 有效 → 收敛 L1；L2+L1 均无效 → L3 |
| 时效/新闻 intent | **直接 L3**（可与 L0 并列，脚注分开） |

**层内 embedding 重排（EMB-FILTER-01）**：L1 FTS recall 20→top 5 · L2 FAQ recall 10→top 3 · L3 联网 recall 8→top 5；**禁止跨层 merge sort**。用户可在 **设置 → 模型 → 文本嵌入** **关闭**语义筛选，降级为关键词/FTS。

---

### 9.2.1 页面结构

**布局 · `/fund-knowledge`**

```
┌─ 侧栏 260px ───┬─ 主区 · 基金知识库 ─────────────────────────────────────────────────────┐
│ [+ 新对话]      │  [ ← 返回对话 ]   基金知识库   [文档结构说明]     [上传]  [维护日志]      │
│ 历史对话…       │  根目录 …/data/fund-knowledge/  [在资源管理器中打开]   index.db …（只读） │
│ ── 全局 ──     │  ──────────────┬──────────────┬─────────────────────────────────────────  │
│ ● 基金知识库   │  左栏 · 源文档树 │ 中栏 · 块目录  │  主区 · Preview（ReportMarkdownPreview） │
│  使用说明      │  019305-…      │  chunk_id    │  [编辑] [刷新] [块多选删除]                │
│  设置          │   ├ 产品概要 🟢  │   + 章节标题  │  [更新搜索索引]                           │
│                │   ├ 招募说明书   │  …           │  只读单栏 · FK-CITE 深链滚至对应行         │
│                │   └ 定期报告 🟠  │              │                                           │
└────────────────┴──────────────┴──────────────┴───────────────────────────────────────────┘
```

> **侧栏**：本页线框 **只展示与知识库相关的全局入口**（§1.2.3 完整五项见 [01-global-design §1.2.3](./01-global-design.md)）；进本页 **不拦截** pending（SH-03）；**「基金知识库」高亮**。  
> **树节点状态**：🟢 已同步 · 🟠 待刷新 · 🔴 索引失败（§9.2.5）。  
> **三栏关系**：选 md → 中栏列出该文件全部块；点块 → Preview 定位；FK-CITE 深链 `?fund=&path=&line=` 直达 Preview 行号。

**导航（与全局页一致 · FK-NAV-01）**

| 规则 ID | 规则 |
|---------|------|
| **FK-NAV-01** | **侧栏常驻**；进本页 **不拦截** pending（SH-03）；侧栏 **「基金知识库」高亮** |
| **FK-NAV-02** | 从对话进入时 URL 携带 **`?c={conversation_id}`**（及可选 `fund` / `path` / `line` 深链参数） |
| **FK-NAV-03** | URL 带 `?c=` 时顶栏显示 **「← 返回对话」** → 回到 `/?c={id}`，恢复离开前 Tab / 模式 A 或 B |
| **FK-NAV-04** | URL **无** `?c=`（侧栏直达、报告「查看原文」深链等）→ **不显示**「返回对话」 |
| **FK-NAV-05** | 点「返回对话」时若 **`?c=` 对应对话已删除** → 同 [04-my-reports §4.1.0c RPT-NAV-05](./04-my-reports.md) **友好报错** |
| **FK-NAV-06** | 切换侧栏其它全局项 → **保留** URL 中的 `?c=`（若存在）；完整侧栏菜单见 §1.2.3 |

**页内区域**

| 区域 | 规格 |
|------|------|
| **页头** | 标题「基金知识库」；**「文档结构说明」**（§9.2.8）；源文档根 `data/fund-knowledge/` 只读可复制 + **「在资源管理器中打开」**；`index.db` 路径只读可复制（**不可**手改） |
| **左栏 · 源文档树** | `fund_code`（+ 中文简称）→ `doc_type` → md；节点 **索引状态**（§9.2.5） |
| **中栏 · 块目录** | 选中 md 后展示该文件全部块（**`chunk_id` 与 UI 一致**，见 §9.2.0e）；点击块 → 主区 Preview 定位 |
| **主区 · Preview** | **`ReportMarkdownPreview` 单栏只读**（FK-UI-01 · 对齐 RPT-EDIT-01）；**编辑**（系统默认文本编辑器 · 如记事本）、**刷新**、**块多选删除**（§9.2.6） |
| **主区工具** | **「更新搜索索引」**（§9.2.4 · 与树/Preview 同区） |
| **独立入口** | **「维护日志」**（§9.2.7）；**上传**（§9.2.3 · 文件选择器多选） |

> **本期不做**：App 内 Markdown 源码双栏、页底「保存」、拖拽上传、产品内「删整份文档 / 覆盖上传」。

---

### 9.2.2 浏览与 Preview

| 项 | 规格 |
|----|------|
| **源文档树** | 展示全部已建目录（含空 `doc_type` 文件夹）；`doc_type` 对客中文 + 英文目录名 |
| **块目录** | 与 `index.db` 中该文件 chunks 同步；每行 = **`chunk_id`** + 章节标题（`heading`） |
| **Preview** | 点击 md 或块 → 加载 Preview；FK-CITE 深链滚至对应行 |
| **编辑 md** | **编辑** → `shell.openPath` 打开 md；改完后须点 **刷新**（§9.2.5） |
| **索引库** | **禁止**用户在资源管理器手改 `index.db`；块级删改 **仅** 在 Preview 区 **块多选删除**（§9.2.6） |

---

### 9.2.3 上传材料

| 项 | 规格 |
|----|------|
| **选择基金** | 手动输入 `fund_code` 或单选已有（带出 **代码 + 中文简称**）；可新建 vault（§9.2.3a） |
| **类型** | 单选 `doc_type`（§9.2.0a 六类 + `other`） |
| **文件** | 文件选择器 **多选**（**同批须同一基金 + 同一 `doc_type`**）；**不做**拖拽 |
| **格式** | **本期全做**：PDF（推荐）、DOC/DOCX、MD、TXT、XLSX/XLS/CSV、PNG/JPG/WebP（§9.2.0c · **FK-FMT-01**）；**不做** HTML/HTM（P2） |
| **去重** | 同路径 `content_hash` 未变 → 跳过转换与索引，提示「内容未变化」 |
| **覆盖** | **不做**产品内覆盖上传；同名冲突 → 文件名加时间戳后缀 |
| **转换** | 自动转 md（§9.2.0c）；保留 `raw/{doc_type}/` 原件 |
| **索引** | 每个文件转换成功 → **自动增量索引**（§9.2.5） |
| **成功** | **弹层摘要**（非单独 Preview 页）：解析页数、块数、`chunk_id` 列表或区间、原件/正文路径、「在树中定位」 |
| **失败** | 一句原因；保留 `raw/`；维护日志记 `upload` · `failed` |
| **进行中** | 同范围若 **手动重建索引** 进行中 → **禁止**该范围上传（§9.2.4） |

**对客提示**：「官网下载的 PDF 概要/招募书/季报可直接上传；表格类材料可传 Excel/CSV；扫描件或图片走 OCR。」

#### 9.2.3a 新建 vault 目录名（FK-VAULT-01 · P0）

| 项 | 规格 |
|----|------|
| **触发** | 上传时 `fund_code` 对应 vault **尚不存在** |
| **简称来源** | 服务端 **`fund_lookup`**（[analysis §9.1.8](./09-fund-analysis.md)）拉 **中文简称**；上传弹层可选手填 **简称覆盖**（仅影响展示，不强制改 slug） |
| **slug 规则** | `fund_name_en` = 简称转 **拉丁 slug**（去空格、保留字母数字连字符；例 `摩根标普500(QDII)C` → `Morgan-SnP500-QDII-C`） |
| **目录名** | `{fund_code}-{fund_name_en}/`；预建 §9.2.0a **六类 + `other` + `raw/`** 空目录 |
| **lookup 失败** | 仍允许上传：slug 兜底 `{fund_code}-Fund`；Toast「未查到行情简称，目录名已用兜底规则」 |
| **已有 vault** | **不**重命名；上传写入既有目录 |

---

### 9.2.4 更新搜索索引（手动 · 兜底）

与 **上传 / 刷新** 触发的自动索引 **同源**（CLI `fund-knowledge index`）。

| 项 | 规格 |
|----|------|
| **入口** | 主区工具 **「更新搜索索引」**（与源文档树 / Preview **同区**；与 **维护日志** 分开） |
| **弹层** | 范围 **单选**：**全局**（全部基金 · 展示约 N 个 md）/ **单只基金**（`fund_code` + 中文简称；含 vault 有目录但未入自选的基金） |
| **行为** | 扫描所选范围 md → 按 `content_hash` **增量**重建（未变跳过；变则删旧 chunk 重切；文件已删则清 orphan chunk） |
| **进行中** | 全局重建 → 禁止一切上传；单基金重建 → 禁止该基金上传 |
| **结果** | Toast：「扫描 X 个文件，重建 Y 个，跳过 Z 个未变化」；维护日志 `manual_reindex` |
| **L2 FAQ** | **不**与此按钮绑定；FAQ 仅 seed / CLI `semantic index`（§9.2.0f） |

---

### 9.2.5 索引同步与树状态（FK-SYNC-01）

**漂移扫描（进入页）**

- **每次进入** `/fund-knowledge`：轻量对比磁盘 md `content_hash` 与 `index.db` → **仅更新树状态**，**不**自动全量重建。

**自动索引触发**

| 事件 | 行为 |
|------|------|
| **上传成功** | 该文件增量索引 |
| **Preview · 刷新** | 读盘 → 更新 Preview → hash 变则增量索引；不变则只刷新 |
| **块多选删除** | 改 md + 增量索引（§9.2.6） |
| **手动「更新搜索索引」** | 所选范围扫描增量重建 |

**树节点 · 索引状态**

| 状态 | 含义 | 展示 |
|------|------|------|
| **已同步** | 磁盘 hash = 索引 hash | 绿 / 「已索引」 |
| **待刷新** | 磁盘 hash ≠ 索引（含记事本已改未点刷新、**资源管理器改 vault 源文件**） | 橙 / 「待刷新」 |
| **索引失败** | 最近一次索引任务失败 | 红 / 「索引失败」 |

**刷新 + 索引失败**

1. Preview **仍显示**最新 md（读盘成功）  
2. Toast 失败原因；树标 **索引失败**  
3. 对客引导：**「重建该基金索引」** → 打开 §9.2.4 弹层并 **预选当前基金**

**体外改 vault（源 md / raw）**

- 用户在资源管理器删改 **源文档** → 回客户端见 **待刷新** → 点 **更新搜索索引**（建议预选该基金）修复。  
- **禁止**手改 `index.db`；索引块删改 **只能** 在客户端 Preview **块多选删除**。

---

### 9.2.6 块多选删除（FK-CHUNK-DEL-01）

| 项 | 规格 |
|----|------|
| **入口** | 选中 md → 块目录多选 + Preview 区确认 |
| **行为** | **物理删除** md 中对应 `##` / `###` 章节；更新 frontmatter `updated_at`；**不**留 HTML 占位 |
| **索引** | 保存后 **自动增量索引**；`chunk_id` 按 §9.2.0e 规则重算 |
| **日志** | 维护日志 `chunk_delete`，记 `chunk_id` 列表 |
| **报告引用** | 已发布报告若脚注 `chunk_id` 已不存在 → Verify 标「索引待更新 / 出处已失效」 |

---

### 9.2.7 维护日志（FK-LOG-01）

独立按钮 **「维护日志」**（与「更新搜索索引」分开）。

**落盘**：`index.db` 内表 **`maintenance_log`**（与 `knowledge_chunks` 同库 · 表结构 §9.2.0e）；**禁止**单独 JSON 文件。

| type | 触发 |
|------|------|
| `upload` | 上传成功 / 失败（批量带 `count`） |
| `refresh_reindex` | Preview **刷新**且触发索引 |
| `manual_reindex` | 手动「更新搜索索引」 |
| `chunk_delete` | 块多选删除 |

**大盘摘要（弹层顶栏）**：当前维护基金数、文档数、块（chunk）总数（由 `knowledge_chunks` + vault 扫描聚合）。

**列表字段**：时间、基金、文件名 / 操作、`doc_type`、状态、块数 / 涉及 `chunk_id`、错误原因、耗时。

---

### 9.2.8 文档结构说明（对客 · FK-HELP-01）

页头按钮 **「文档结构说明」** → 侧滑或弹层，须包含：

1. 单基金文件夹结构（`{fund_code}-{name_en}/` → 六类子目录 + `raw/`）  
2. **六类文档类型**对照（中文 ↔ 目录名 ↔ 典型材料 · §9.2.0a）  
3. 上传后 **原件** 与 **正文 md** 分别在哪  
4. **块（chunk）** 是什么：按章节切分；每块有唯一 **`chunk_id`**；报告可点回原文  
5. **搜索索引**（`index.db`）做什么、**为何不要手改**；改 md 请 **刷新** 或 **更新搜索索引**  
6. **两种删改方式**：源 md 用记事本 / 资源管理器；块用 Preview **多选删除**  
7. 与 **自选** 无关：知识库管材料，自选管收藏  

文案避免 L0/L1/FTS/pgvector 等内部代号。

---

### 9.2.9 API / CLI

**HTTP 索引**：详文 **§9.2.9a（FK-API-01）**；路径前缀 `/api/fund-knowledge/`。

**CLI**：

```bash
fund-knowledge explore --fund 019305 --query "投资范围与费率"
fund-knowledge index --all
fund-knowledge index --fund 019305
fund-knowledge semantic index --fund 019305   # 仅 FAQ · seed/运维
```

**FK-CITE 深链**：`/fund-knowledge?fund={code}&path={file}&line={line}`

---

### 9.2.9a REST 与桌面能力（FK-API-01 · P0）

> **索引**：REST 总表见 [05-chat-shared §5.10.1](./05-chat-shared.md)；本节为 **基金知识库管理页** 专用契约。  
> **运行环境**：`{APP_ROOT}` 本地磁盘 + 桌面壳；**非**纯浏览器读用户本机路径。  
> **与 CLI 同源**：`index` / `explore` / 转换管线须与管理页 API **共用** `src/harness/infra/fund_knowledge/` 实现。

#### 9.2.9a.1 元信息与源文档树

**`GET /api/fund-knowledge/meta`**

**Response `200`**

```json
{
  "vault_root": "D:\\…\\data\\fund-knowledge",
  "index_db_path": "D:\\…\\data\\fund-knowledge\\index.db",
  "vault_root_exists": true,
  "index_db_exists": true
}
```

---

**`GET /api/fund-knowledge/tree`**

| Query | 说明 |
|-------|------|
| `include_empty_doc_types` | 默认 `true` — 含无 md 的空类型文件夹 |

**Response `200`**

```json
{
  "funds": [
    {
      "fund_code": "019305",
      "fund_name": "摩根标普500指数(QDII)人民币C",
      "vault_dir": "019305-Morgan-SnP500-QDII-C",
      "doc_types": [
        {
          "doc_type": "prospectus",
          "label_zh": "招募说明书",
          "files": [
            {
              "path": "019305-Morgan-SnP500-QDII-C/prospectus/product-summary-202606.md",
              "filename": "product-summary-202606.md",
              "index_status": "synced",
              "content_hash": "sha256:…",
              "chunk_count": 12,
              "updated_at": "2026-06-12T10:00:00+08:00"
            }
          ]
        }
      ]
    }
  ],
  "summary": { "fund_count": 2, "file_count": 8, "chunk_count": 96 }
}
```

| 中文含义 | 字段名称 | 字段类型 | 字段说明 |
|----------|----------|----------|----------|
| 索引状态 | `index_status` | string | `synced` \| `pending_refresh` \| `index_failed` |
| 汇总统计 | `summary` | object | 维护日志弹层顶栏同源 |

**错误**

| HTTP | code | 何时 |
|------|------|------|
| 500 | `ERR-FK-VAULT-READ` | vault 根目录不可读 |

---

**`GET /api/fund-knowledge/drift-scan`**

进页轻量扫描：对比磁盘 `content_hash` 与 `index.db`，**不**重建索引。

**Response `200`**：`{ "scanned_files": 8, "pending_refresh": 1, "index_failed": 0, "tree": { …同 tree 结构… } }`

#### 9.2.9a.2 文件内容与块目录

**`GET /api/fund-knowledge/file`**

| Query | 必填 | 说明 |
|-------|------|------|
| `path` | ✅ | 相对 `data/fund-knowledge/` 的 md 路径 |

**Response `200`**

```json
{
  "path": "019305-Morgan-SnP500-QDII-C/prospectus/product-summary-202606.md",
  "fund_code": "019305",
  "doc_type": "prospectus",
  "markdown": "# …",
  "content_hash": "sha256:…",
  "file_exists": true,
  "index_status": "synced"
}
```

| 中文含义 | 字段名称 | 字段类型 | 字段说明 |
|----------|----------|----------|----------|
| Markdown 正文 | `markdown` | string | UTF-8 读盘 · Preview 渲染 |
| 文件是否存在 | `file_exists` | boolean | `false` 时省略 `markdown` · HTTP 仍 200 |

**错误**

| HTTP | code | 何时 |
|------|------|------|
| 400 | `ERR-FK-PATH-INVALID` | 路径逃逸 vault 根或非 `.md` |
| 404 | `ERR-FK-FILE-NOT-FOUND` | 文件不存在 |

> **Preview 刷新**：前端 **不**单独 `POST`；点 **刷新** → 再次 `GET …/file?path=`（可加 `_t=` 防缓存）；服务端 hash 变则触发增量索引并写 `maintenance_log` · `refresh_reindex`。

---

**`GET /api/fund-knowledge/chunks`**

| Query | 必填 | 说明 |
|-------|------|------|
| `path` | ✅ | 相对 vault 的 md 路径 |

**Response `200`**

```json
{
  "path": "…",
  "chunks": [
    {
      "chunk_id": "fk_019305_abc120",
      "heading": "管理费率",
      "heading_level": 2,
      "line_start": 120,
      "line_end": 145
    }
  ]
}
```

#### 9.2.9a.3 上传

**`POST /api/fund-knowledge/upload`**

**Content-Type**：`multipart/form-data`

| Field | 必填 | 说明 |
|-------|------|------|
| `fund_code` | ✅ | 6 位代码 |
| `doc_type` | ✅ | §9.2.0a 枚举 |
| `files[]` | ✅ | 1～20 个；**同批同一基金 + 同一 doc_type** |
| `fund_name_override` | — | 可选；覆盖 lookup 简称（仅展示 / slug 辅助） |

**Response `200`（批量）**

```json
{
  "results": [
    {
      "source_filename": "产品资料概要.pdf",
      "status": "success",
      "md_path": "019305-Morgan-SnP500-QDII-C/prospectus/product-summary-202606.md",
      "raw_path": "019305-Morgan-SnP500-QDII-C/raw/prospectus/产品资料概要.pdf",
      "page_count": 12,
      "chunk_count": 8,
      "chunk_ids": ["fk_019305_…", "…"],
      "vault_created": false,
      "conversion_method": "text"
    }
  ],
  "summary": { "success": 2, "failed": 0, "skipped_unchanged": 0 }
}
```

| 中文含义 | 字段名称 | 字段类型 | 字段说明 |
|----------|----------|----------|----------|
| 处理状态 | `status` | string | `success` \| `failed` \| `skipped_unchanged` |
| 是否新建 vault | `vault_created` | boolean | 本次是否新建基金目录 §9.2.3a |
| 转换方式 | `conversion_method` | string | `text` \| `ocr` \| `mixed` §9.2.0c |

**错误**

| HTTP | code | 何时 |
|------|------|------|
| 400 | `ERR-FK-UPLOAD-INVALID` | 缺字段 / 混 doc_type / 超 20 文件 |
| 400 | `ERR-FK-FORMAT-UNSUPPORTED` | 非 FK-FMT-01 允许后缀 |
| 409 | `ERR-FK-INDEX-BUSY` | 同范围手动重建索引进行中（§9.2.4） |
| 422 | `ERR-FK-CONVERT-FAILED` | 转换失败（单文件在 `results[].error`） |

#### 9.2.9a.4 索引与块删除

**`POST /api/fund-knowledge/index`**

| Body | 说明 |
|------|------|
| `{ "scope": "all" }` | 全局重建 |
| `{ "scope": "fund", "fund_code": "019305" }` | 单基金 |

**Response `200`**：`{ "scanned": 8, "rebuilt": 2, "skipped": 6, "duration_ms": 1200 }`

**错误**

| HTTP | code | 何时 |
|------|------|------|
| 409 | `ERR-FK-INDEX-BUSY` | 已有 index 任务进行中 |
| 409 | `ERR-FK-UPLOAD-BLOCKED` | 全局 index 时禁止并发上传（对客统一文案） |

---

**`DELETE /api/fund-knowledge/chunks`**

| Body | 说明 |
|------|------|
| `{ "path": "…md", "chunk_ids": ["fk_…", "…"] }` | 物理删 md 章节 + 自动增量索引（§9.2.6） |

**Response `200`**：`{ "deleted_chunk_ids": ["…"], "new_chunk_count": 10, "content_hash": "sha256:…" }`

**错误**

| HTTP | code | 何时 |
|------|------|------|
| 400 | `ERR-FK-CHUNK-NOT-FOUND` | `chunk_id` 不在该文件 |
| 409 | `ERR-FK-INDEX-BUSY` | 索引任务进行中 |

#### 9.2.9a.5 维护日志

**`GET /api/fund-knowledge/maintenance-log`**

| Query | 默认 | 说明 |
|-------|------|------|
| `limit` | 50 | 最大 200 |
| `offset` | 0 | |
| `fund_code` | — | 可选筛选 |

**Response `200`**

```json
{
  "summary": { "fund_count": 2, "file_count": 8, "chunk_count": 96 },
  "items": [
    {
      "id": 42,
      "type": "upload",
      "fund_code": "019305",
      "file_path": "…/product-summary-202606.md",
      "doc_type": "prospectus",
      "status": "success",
      "chunk_count": 8,
      "chunk_ids": ["fk_…"],
      "error_message": null,
      "duration_ms": 3400,
      "created_at": "2026-06-12T10:00:00+08:00"
    }
  ],
  "total": 42
}
```

#### 9.2.9a.6 桌面动作（本地壳 · P0）

> 纯 Web 无 `{APP_ROOT}` → **`ERR-DESKTOP-UNAVAILABLE`**（501）。

**`POST /api/fund-knowledge/actions/open-folder`**

| Body | 行为 |
|------|------|
| `{ "target": "vault_root" }` | 打开 `data/fund-knowledge/` |
| `{ "target": "fund", "fund_code": "019305" }` | 打开该基金 vault 目录 |

**Response `200`**：`{ "opened_path": "D:\\…" }`

---

**`POST /api/fund-knowledge/actions/open-file`**

| Body | 行为 |
|------|------|
| `{ "path": "…md" }` | 系统默认程序打开 md（**编辑**按钮） |

**错误**

| HTTP | code | 何时 |
|------|------|------|
| 404 | `ERR-FK-FILE-NOT-FOUND` | 路径不存在 |
| 501 | `ERR-DESKTOP-UNAVAILABLE` | 非桌面壳 |

**编码仓 IPC 名（建议 · 与 HTTP 二选一或并存）**

| IPC channel | 等价 HTTP |
|-------------|-----------|
| `fund-knowledge:open-folder` | `POST …/actions/open-folder` |
| `fund-knowledge:open-file` | `POST …/actions/open-file` |

#### 9.2.9a.7 深链落地

进入 `/fund-knowledge?fund=019305&path=…&line=120&c=…` 时：

1. `GET /api/fund-knowledge/tree`（或 drift-scan）→ 展开对应基金 / 选中 md  
2. `GET /api/fund-knowledge/file?path=` + `GET …/chunks?path=`  
3. Preview 滚至 `line`（1-based）

**返回对话**：同 FK-NAV-03～05 · `GET /api/conversations/:c?messages_limit=0`。

---

### 9.2.10 种子与演示（L2-SEED-01 / L2-SEED-02）

> **A～F 六只总表（唯一）** → [Hub §9.0.1](./09-fund.md)。

**种子文件**：

- `seed/fund-knowledge/` + `index`：019305、017704、110020、206007、519772、518880  
- `seed/fund_semantic_entries.json`（`fund_code=*`）+ `python seed/scripts/apply_semantic.py`：**通用 FAQ 100 条**  
- 生成/更新 JSON：`node seed/scripts/build_global_semantic.mjs`

**L2-SEED-01**：运行时 Agent **禁止** INSERT/UPSERT L2；联网 **不得** 自动入库 FAQ。

**L2-SEED-02**：FAQ **不得**绑定单基金代码（标题/正文避免 `019305` 等硬编码）；`match_fund_semantic_entries` 匹配 `fund_code='*'` 与当前基金代码并联。

---

### 9.2.11 功能清单（FK-01～FK-27 · 知识库 subset）

| ID | 功能 | 本期 |
|----|------|------|
| FK-01 | 侧栏全局入口 | 做 |
| FK-02 | 源文档树 + 块目录 + 索引状态 | 做 |
| FK-03 | 文档结构说明 | 做 |
| FK-04 | Preview 单栏 + 外部编辑 + 刷新 | 做 |
| FK-05 | 上传（多选 · 同基金同类型） | 做 |
| FK-06 | 上传成功弹层摘要 | 做 |
| FK-07 | 自动索引（上传/刷新/删块） | 做 |
| FK-08 | 手动更新索引（全局/单基金） | 做 |
| FK-09 | 漂移扫描（进页 · 待刷新） | 做 |
| FK-10 | 块多选删除 | 做 |
| FK-11 | 维护日志（`maintenance_log` 表） | 做 |
| FK-12 | CLI explore / index | 做 |
| FK-13～FK-17 | explore Tool、块索引、FK-CITE、PDF、semantic FAQ、KB-03 | 做 |
| FK-API-01 | REST §9.2.9a + 桌面 open-folder / open-file | 做 |
| FK-FMT-01 | 上传格式含表格 + 图片 OCR（§9.2.0c） | 做 |
| FK-VAULT-01 | 新建 vault：`fund_lookup` + slug（§9.2.3a） | 做 |
| FK-LOG-01 | 维护日志落 `index.db` · `maintenance_log` | 做 |
| FK-14 | CG-01-XDOC | **不做**（P2） |
| FK-18～FK-27 | 归属 §9.1 解析 | 见 [analysis](./09-fund-analysis.md) |

---

[← 返回基金域总览](./09-fund.md)
