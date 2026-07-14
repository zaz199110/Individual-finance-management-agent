> [← 设置总览](./02-settings.md) · **2.4 聊天记忆**

## 2.4 聊天记忆（沟通偏好）

### 模块说明

| 项 | 说明 |
|----|------|
| **做什么** | 存 **沟通偏好**（非投资数据）；外部编辑 md + **刷新**写库 |
| **入口** | 设置 → **聊天记忆** `/settings/memory` |
| **不做** | 需求梳理/资产配置/持仓内容；App 内双栏编辑（MEM-UI-01） |
| **编码锚点** | `user_memory` · HAR-02 · G-04 |

路径：**侧栏 → 设置 → 聊天记忆**（`/settings/memory`）

| 项 | 说明 |
|----|------|
| **初始内容** | **空文档**（G-04） |
| **页顶对客说明** | 「聊天记忆用来告诉助手**您喜欢怎样的回答方式**…**不会**保存年龄、收入、持仓、方案或基金选择。」（全文 §2.4.1） |
| **边界说明** | 投资相关信息由需求梳理/资产配置/持仓等业务模块管理，**不**写入聊天记忆 |
| **展现** | **仅 Preview 单栏**（`ReportMarkdownPreview` · §1.3.4）；**不做**双栏（MEM-UI-01） |
| **编辑** | 工具条 **编辑** → 系统默认程序打开本地 md（§2.4.2） |
| **保存** | 工具条 **刷新** → 读盘 → 写入 `user_memory`（§2.4.2）；**无**页底保存 |
| **使用** | 每次 LLM 请求在 system prompt 追加摘要（HAR-02） |

投资相关结构化数据 → **业务表**，不写入聊天记忆。

### 2.4.1 页面布局与工具条（MEM-UI-01 · P0）

```
┌─ 设置壳 ─────────────────────────────────────────────────────────┐
│  聊天记忆（页顶说明 + 边界提示）                                  │
│  ─────────────────────────────────────────────────────────────  │
│  📁 data/user-memory.md                    [ 编辑 ] [ 刷新 ]      │
│  ─────────────────────────────────────────────────────────────  │
│  ReportMarkdownPreview（渲染后的偏好说明 · 只读）                 │
└─────────────────────────────────────────────────────────────────┘
```

| 控件 | 行为 |
|------|------|
| **信息条** | 展示编辑用文件路径 **`data/user-memory.md`**（相对 `{APP_ROOT}` 的对客展示即可） |
| **编辑** | 见 §2.4.2 · `open-file`；首次可 Toast：「将用系统默认程序打开本地文件，保存后请点刷新」 |
| **刷新** | 见 §2.4.2 · 读盘 → PATCH DB → 重渲染 Preview；Toast **「聊天记忆已更新」** |
| **空内容** | DB 与文件均为空时，Preview 展示占位：「暂无聊天记忆。点击 **编辑** 编写您的沟通偏好。」 |

> **与我的报告差异**：聊天记忆 **刷新会写库**（Harness 读 `user_memory`）；报告刷新 **只读盘、不回写 DB**（§4.1.1 · RPT-EDIT-01）。

### 2.4.2 REST 与桌面能力（MEM-API-01 · P0）

> 总表索引：[02-settings.md §2.7.2](./02-settings.md)。桌面壳与 [04-my-reports §4.1.5c](./04-my-reports.md) 相同错误码约定。

**本地编辑文件（定稿）**

| 项 | 规格 |
|----|------|
| **路径** | `{APP_ROOT}/data/user-memory.md` |
| **运行时真源** | **`user_memory.content_md`**（DB）；Harness **只读 DB** |
| **同步** | **编辑前**：若文件不存在或 DB `updated_at` 新于文件 mtime → **先**把 DB 内容写入文件；**刷新时**：读文件 UTF-8 → PATCH DB |

**`GET /api/settings/memory`**

| Response `200` |
|----------------|
| `{ "content_md": "…", "updated_at": "…", "file_path": "data/user-memory.md", "file_exists": true }` |

| 中文含义 | 字段名称 | 字段类型 | 字段说明 |
|----------|----------|----------|----------|
| 记忆正文 | `content_md` | string | 当前 DB 全文；空 = 尚无记忆 |
| 文件是否存在 | `file_exists` | boolean | 磁盘是否有 `user-memory.md` |

**`PATCH /api/settings/memory`**

| Body | `{ "content_md": "…" }` |
|------|-------------------------|
| **用途** | **刷新**流程内部调用；也可供脚本导入 |
| **Response** | `{ "content_md", "updated_at" }` |

**`POST /api/settings/memory/actions/open-file`**

| 步骤 | 行为 |
|------|------|
| 1 | 按上表 **编辑前同步** 写入 `data/user-memory.md`（空则写空文件或 0 字节） |
| 2 | 系统默认程序打开该 md |
| **Response `200`** | `{ "opened_path": "…\\data\\user-memory.md" }` |

**`POST /api/settings/memory/actions/refresh`**

| 步骤 | 行为 |
|------|------|
| 1 | 读 `{APP_ROOT}/data/user-memory.md` |
| 2 | `PATCH` 等价写入 `user_memory.content_md` |
| 3 | 返回最新内容与 `updated_at` 供 Preview 重渲染 |
| **Response `200`** | `{ "content_md", "updated_at" }` |

| 错误 | code | 何时 |
|------|------|------|
| 404 | `ERR-MEM-FILE-MISSING` | 刷新时文件不存在（未点过编辑且从未落盘 → 引导先 **编辑**） |
| 501 | `ERR-DESKTOP-UNAVAILABLE` | 非桌面壳 |
| 500 | `ERR-DESKTOP-OPEN-FAILED` | 打开失败 |

**IPC 建议名**：`memory:open-file` · `memory:refresh`（与 HTTP 等价）

### 2.4.3 字段规格 · `user_memory`

| 中文含义 | 字段名称 | 字段类型 | 字段长度 | 是否必填 | 字段校验 | 值的相关说明 |
|----------|----------|----------|----------|----------|----------|--------------|
| 主键 | `id` | uuid PK | uuid | 系统 | 单用户单行 | — |
| 记忆正文 | `content_md` | text | ≤32KB 建议 | 否 | 禁止投资事实 HAR-02 | Harness system |
| 更新时间 | `updated_at` | timestamptz | — | 系统 | refresh 时更新 | 同步 `user-memory.md` |

### 2.4.4 与 Harness 分工

| 层 | 内容 | 来源 |
|----|------|------|
| **聊天记忆** | 语气、格式偏好 | `user_memory.content_md` · §2.4（**非**直接读盘） |
| **业务锚点** | profile、约束、持仓、allocation_plans | Supabase 只读快照 · HARNESS §7 |

**禁止**：把年龄、收入、基金代码、持仓明细写入 `user_memory`。
