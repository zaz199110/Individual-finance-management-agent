> [← 设置总览](./02-settings.md) · **2.3 数据库配置**

## 2.3 数据库配置（Supabase BYOK）

### 模块说明

用户自带 Supabase（BYOK）；检测通过后解锁需求梳理/资产配置/持仓/基金 Tab（SET-DB-01）。Hub 对照 → [§2.0](./02-settings.md) ②。

路径：**设置 → 我的数据**（`/settings/database`）— **仅 BYOK 模式**（见 §2.3.0）。

面向 GitHub 开源：**不要求用户使用我们的 Supabase**，而是自带实例。下列连接项**全部**在本页填写与保存；开源用户**无需**手改 `.env`（维护者联调可用 `secrets.env` · §2.5）。

### 2.3.0 本地 Demo 模式（与 BYOK 共用一套代码）

| 项 | 规则 |
|----|------|
| **触发** | `.env.local` 中 `SUPABASE_URL` 主机为 `127.0.0.1` 或 `localhost`（`isDatabaseManagedByLocalEnv()`） |
| **设置 UI** | **不展示**「我的数据」导航；访问 `/settings/database` 重定向至模型页 |
| **凭证来源** | **仅** `.env.local` + `npm run supabase:sync-settings`；启动时 bootstrap + 自动探活 |
| **未就绪** | 横幅提示启动 Docker / `npx supabase start`，**不**引导用户手填 URL |
| **查表** | 本地 Studio · [SUPABASE-STUDIO-GUIDE.md](../../docs/SUPABASE-STUDIO-GUIDE.md) |
| **与 BYOK 关系** | 同一 `getSupabase()` / 同一 `supabase/migrations/`；仅 UI 与配置入口分支 |

> Demo 验收路径见 [需求仓/docs/MANUAL-VERIFICATION.md](../../需求仓/docs/MANUAL-VERIFICATION.md) §一；README **路径 A / B** 对照。

### 2.3.1 设置页字段一览（BYOK）

> **不能只填某一个 Token**。主库至少需要 **项目 URL + Anon Key**；定时任务等还需 **Service Role Key**；CLI 跑 migration 时另填 **数据库密码**。

**分组 A — 主数据库（项目 1 · 关系型 + pgvector）**

| 中文含义 | 字段名称 | 字段类型 | 字段说明 |
|----------|----------|----------|----------|
| 项目 URL | `supabase_url` | text | 必填 · `https://xxxx.supabase.co` |
| 匿名密钥 | `anon_key` | text | 必填 · 前端与一般读写 API |
| 服务角色密钥 | `service_role_key` | text? | 推荐 · 定时任务 · 仅服务端 |
| 数据库密码 | `db_password` | text? | 可选 · CLI migration 用 |

> **无独立向量库分组（G-03）**：设置页仅 **主数据库** 一组；**须**在同一 Supabase 项目启用 **pgvector**（[knowledge §9.2.0f](./09-fund-knowledge.md)）；官方披露本地 vault + `index.db` 见 [knowledge §9.2.0a](./09-fund-knowledge.md)。

**UI 要求**

- 密钥类输入框：保存后掩码 `••••••`，旁附「更改」  
- 页底：**保存** + **检测连接**（主库）  
- 页顶链出 `{APP_ROOT}/docs/DEPLOY.md` 与 [SUPABASE-GUIDE.md](../config/SUPABASE-GUIDE.md)

**检测逻辑**：校验 URL 格式 → Anon Key 调 `rest/v1` 健康检查 → Service Role 可选二次检测 → 可选检测 `vector` 扩展是否可用（失败时黄色提示「语义检索需启用 pgvector」）。

**对客反馈**

| 结果 | 文案 |
|------|------|
| 成功 | 数据库连接正常。 |
| 失败 | 无法连接数据库，请检查项目 URL 与密钥是否正确。 |

### 2.3.2 部署阶段

| 阶段 | 做法 |
|------|------|
| **本地 Demo** | Docker + `npx supabase start` + `.env.local` 指向 `127.0.0.1:54321` + `npm run supabase:sync-settings`；**无**设置页 BYOK |
| **自研联调** | 维护者用 `requirement/config/secrets.env` 本地跑通 |
| **开源交付** | `{APP_ROOT}/supabase/migrations/*.sql` + seed 脚本 + README 路径 B |
| **用户启用（BYOK）** | **设置 → 我的数据** 填写 §2.3.1 → 检测通过 → 跑 seed |
| **兜底** | `seed/export.json` 或控制台导入 |

**鉴权策略（MVP）**：不做多用户登录；每个部署实例 = 一个使用者。

**存储（G-05）**：开源用户以**设置页加密配置表**为主路径（`app_settings` 或等价表，服务端加密落库）；密钥字段 UI 掩码。维护者开发期可用 `{APP_ROOT}/.env.local`（见 CODING.md），**不**要求终端用户改 env。

> **L0 行情（Tushare / AKShare）** → **设置 → 数据源**，见 [02-settings-datasources.md](./02-settings-datasources.md) §2.8。
