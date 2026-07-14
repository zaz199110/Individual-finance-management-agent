> [← PRD 索引](../PRD.md) · **2. 设置（总览）**

## 2. 设置（总览）

### 模块说明

全局配置（模型、数据库、行情数据源、聊天记忆），不绑定单一聊天场景。侧栏 **设置**（§1.2.3）。**推理+联网**检测通过 → 可用自由问答；**数据库**通过 → 可用需求梳理/资产配置/持仓/基金（SET-DB-01 · §2.0.2）。

### 2.0 五块对照

| 块 | 用户一句话 | 入口 | Done 是什么 | 详细 PRD |
|----|------------|------|-------------|----------|
| **① 模型** | 「配好对话、联网、看图、深度报告、语义检索用的模型」 | 设置 → **模型** `/settings/models` | 推理 + 联网 **检测通过** | [**02-settings-models.md**](./02-settings-models.md) · §2.2 |
| **② 数据库** | 「连我自己的 Supabase，数据在我这」 | 设置 → **我的数据** `/settings/database`（**BYOK 模式**；本地 Demo 见 [database §2.3.0](./02-settings-database.md#230-本地-demo-模式与-byok-共用一套代码)） | **检测连接**通过 | [**02-settings-database.md**](./02-settings-database.md) · §2.3 |
| **③ 数据源** | 「配 Tushare，拉基金净值/交易日历」 | 设置 → **数据源** `/settings/datasources` | Tushare **推荐**检测通过；AKShare 连通可选 | [**02-settings-datasources.md**](./02-settings-datasources.md) · §2.8 |
| **④ 聊天记忆** | 「告诉助手我喜欢怎么回答」 | 设置 → **聊天记忆** `/settings/memory` | 保存成功 | [**02-settings-memory.md**](./02-settings-memory.md) · §2.4 |
| **⑤ 通用** | 「语言、涨跌颜色（只读）」 | 设置 → **通用** `/settings/general` | 无需操作 | 本节 §2.1 |

```
侧栏「设置」/settings
├── 通用          §2.1
├── 数据库配置    §2.3  → 02-settings-database.md
├── 数据源        §2.8  → 02-settings-datasources.md
├── 模型          §2.2  → 02-settings-models.md
└── 聊天记忆      §2.4  → 02-settings-memory.md
```

| 规则 | 说明 |
|------|------|
| **双模式** | `SUPABASE_URL` 为本地 → Demo 模式（无「我的数据」设置）；为 `*.supabase.co` → BYOK 设置页 |
| **BYOK** | 模型 Key、Supabase、Tushare Token 均在设置页（G-05）；维护者可用 `secrets.env` 联调 |
| **保存 ≠ 检测** | 模型各槽位、Tushare 须 **分别** 点检测；保存不自动探测 |
| **对话最小集** | **推理 + 联网** 检测通过 → **自由问答**可用（SET-DB-01） |
| **业务 Tab** | **数据库** 检测通过 → 才可用 **需求梳理 / 方案 / 持仓 / 基金** |
| **L0 行情** | Tushare **推荐**；无 Token 走 AKShare → 联网兜底；**不单独阻断** Tab（§2.8.5） |
| **与业务分离** | 需求梳理/资产配置/持仓 **不在**设置里编辑 |

### 2.0.1 跨块决项索引

| ID | 块 | 摘要 | 位置 |
|----|-----|------|------|
| G-01 | ① | 深度推理默认「与推理相同」 | [models §2.2.6](./02-settings-models.md) |
| G-04 | ④ | 聊天记忆初始为空 + 页顶说明 | [memory §2.4](./02-settings-memory.md) |
| G-05 | ② | 密钥设置页加密存库为主路径 | [database §2.3.2](./02-settings-database.md) |
| G-03 | ② | pgvector 与主库同一 Supabase 项目 | [database §2.3.1](./02-settings-database.md) |
| SET-EMB-01 | ① | 第五槽位「文本嵌入」 | [models §2.2.7](./02-settings-models.md) |
| SET-DS-01 | ③ | **数据源**独立页；Tushare Token + AKShare 连通检测 | [datasources §2.8](./02-settings-datasources.md) |
| SET-DS-02 | ③ | 设置页 Token **优先**于 env | [datasources §2.8.9](./02-settings-datasources.md) |
| SET-DB-01 | 全局 | 推理+联网通过可 **自由问答**；DB 通过才开 **需求梳理/资产配置/持仓/基金** | §2.0.2 |
| SET-FIRST-01 | 全局 | 推理/联网未就绪 → 引导设置 | §2.0.2 |
| HAR-02 | ④ | 聊天记忆 vs 业务 DB 分工 | [memory §2.4.2](./02-settings-memory.md) |

### 2.0.2 首次进入与分场景阻断（SET-FIRST-01 · SET-DB-01 · P0）

| 条件 | 自由问答 Tab（`chat`） | 需求梳理 / 方案 / 持仓 / 基金 Tab |
|------|------------------------|-------------------------------------|
| **推理或联网** 未检测通过 | **禁用**输入；横幅 +「前往 **设置 → 模型**」 | **同上**（全部不可用） |
| **推理 + 联网** 已通过 · **DB 未通过** | **可用**（可发消息、联网简答） | **禁用**；Tab 可点但输入 disabled；横幅：「请先完成 **设置 → 数据库配置** 并通过检测，再使用投资规划、持仓分析与基金解读。」 |
| **DB** 已通过 · **Tushare 未配 / L0 失败** | **可用** | **可用**；基金/持仓数字可能 `l0_degraded`，见 §2.8.5 |
| **全部就绪** | 正常 | 正常 |

**横幅规则**：多条条件同时不满足时 **合并一条**（模型优先于 DB）；提供 **「前往设置」** 深链至对应子页。

**切换 Tab 时**：若当前 Tab 被阻断，placeholder 改为对客引导文案（**SET-DB-01** · 见下表），**禁止**静默失败。

| Tab | DB 未通过 · 占位符（对客） |
|-----|---------------------------|
| `profile` | 请先完成「设置 → 数据库配置」并通过检测，再填写需求梳理。 |
| `plan` | 请先连接数据库后再生成资产配置。 |
| `portfolio` | 请先连接数据库后再录入或分析持仓。 |
| `fund` | 请先连接数据库后再使用基金解读与自选。 |
| `chat` | **不受影响**；仍用 §5.3.3 正常 placeholder |

**本期不做**：多步 onboarding 向导、设置导入/导出（UX-01 范围外）。

### 2.0.3 设置壳布局（SET-UI-01 · P0）

| 项 | 规格 |
|----|------|
| **入口** | 侧栏全局区 **「设置」** → 进入 **`/settings`**，默认重定向 **`/settings/models`** 或上次子页 |
| **布局** | 左侧 **设置子导航**（竖排，与 §2.0 树顺序一致）+ 右侧 **子页内容区** |
| **子导航顺序** | 通用 → 数据库配置 → **数据源** → 模型 → 聊天记忆 |
| **聊天记忆** | 点击子导航进入 **`/settings/memory`**（独立子页路由，仍属设置壳内） |
| **保存** | 模型 / 数据库 / 数据源：各子页 **页底「保存」**；**聊天记忆**无页底保存 → **编辑 + 刷新**（§2.4） |
| **深链** | 横幅「前往设置」须带 query 或 path，如 `/settings/models`、`/settings/database` |

编码：`src/app/settings/layout.tsx` 承载子导航；子页见 CODING.md。

### 2.1 设置页结构 · 通用（⑤）

路径：**设置 → 通用**（`/settings/general`）

| 分组 | 内容 |
|------|------|
| **通用** | 语言（**简体中文**，置灰不可改）；行情颜色 **绿涨红跌**（A 股习惯，置灰；说明见 **使用说明** §5.3.9 · G-06） |

模型 / 数据库 / **数据源** / 聊天记忆分组见上表 **2.0** 与子文档。

### 2.5 密钥存放原则

- 需求仓：`requirement/config/secrets.env`（不提交 Git）  
- 编码仓：`{APP_ROOT}/.env.local` 仅开发期可选；生产/开源用户以 **设置页加密存储** 为主  
- 模板：`requirement/config/env.template`  
- 维护者默认值建议：`requirement/config/model-defaults.md`  
- 禁止将真实 Key 写入 PRD、`需求仓/research/*.md`

### 2.6 本仓库 vs 编码仓库

| 仓库 | 职责 |
|------|------|
| **`D:\CursorProjects\agent-demo\`**（需求仓） | `requirement/`、`需求仓/research/`、`seed/`、`agents/registry.yaml` |
| **`{APP_ROOT}`**（编码仓） | `src/harness/`、`supabase/`、`scripts/`、`data/` |

### 2.7 联调与部署验收（设置域）

> 部署总览：[docs/DEPLOY.md](../../docs/DEPLOY.md) **§5.5**；基金/chat 验收见同文档其它节。

#### 2.7.1 验收步骤（勾选）

| # | 块 | 操作 | 预期 |
|---|-----|------|------|
| 1 | ① | 设置 → 模型：填推理三项 → **保存** → **检测可用性** | 绿色「已通过检测」；探针 `PROBE_OK` |
| 2 | ① | 联网搜索：独立或「与推理相同」→ 检测 | 通过；失败时见 §2.2.4 对客文案 |
| 3 | ① | 修改推理 model 名 → 状态回退 | 「尚未检测」或「配置已变更，请重新检测」 |
| 4 | ① | 深度 / Vision / 嵌入（按需）分别检测 | 各槽位独立状态；嵌入失败不阻断 chat，阻断 L2 |
| 5 | ② | 设置 → 数据库：填 URL + Anon → 检测连接 | 「数据库连接正常」 |
| 5b | ② | migration + seed 后 | `fund_watchlist` 3 行等业务表可读写 |
| 6 | ② | DB 未通过 · 模型已通过 | **chat** 可发消息；**profile/plan/portfolio/fund** 输入 disabled + 占位符（SET-DB-01） |
| 7 | ③ | 设置 → 数据源：Tushare Token → 检测 | 通过；见 [§2.8.9](./02-settings-datasources.md) |
| 8 | ④ | 设置 → 聊天记忆：外部编辑保存后点 **刷新** | Preview 更新且 `user_memory` 持久（HAR-02 · §2.4.2） |
| 9 | 全局 | 推理/联网未通过 | 全部 Tab 输入 disabled |

#### 2.7.2 API 速查（编码）

| API | 说明 |
|-----|------|
| `POST /api/settings/models/test` | body `{ slot }` · §2.2.4 |
| `POST /api/settings/database/test` | Anon + 可选 Service Role |
| `GET/PATCH /api/settings/models` | 五槽位 CRUD |
| `GET/PATCH /api/settings/database` | Supabase 连接项 |
| `GET/PATCH /api/settings/memory` | `user_memory` · 详见 [memory §2.4.2](./02-settings-memory.md) |
| `POST /api/settings/memory/actions/open-file` | 打开 `data/user-memory.md` |
| `POST /api/settings/memory/actions/refresh` | 读盘 → 写库 → 返回最新内容 |
| `GET/PATCH /api/settings/datasources` | Tushare Token 等 · §2.8 |
| `POST /api/settings/datasources/test` | `{ provider: 'tushare' \| 'akshare' }` |
| `GET /api/settings/readiness` | 返回 `{ models, database, datasources }`；供 Tab 阻断与横幅 |

---

**子文档**

1. [02-settings-models.md](./02-settings-models.md) — 模型五槽位（§2.2）  
2. [02-settings-database.md](./02-settings-database.md) — Supabase BYOK（§2.3）  
3. [02-settings-datasources.md](./02-settings-datasources.md) — 数据源 L0（§2.8）  
4. [02-settings-memory.md](./02-settings-memory.md) — 聊天记忆（§2.4）
