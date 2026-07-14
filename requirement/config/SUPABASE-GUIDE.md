# Supabase 连通指南

> **适用阶段**：编码仓尚未建好，或刚建好、要先验证数据库能连上。  
> **密钥存放**：`requirement/config/secrets.env`（本机，不提交 Git）

---

## 一、你要准备什么

本产品只需要 **一个 Supabase 项目**，同时承担：

| 用途 | 存哪 |
|------|------|
| 对话、投资需求、持仓、报告索引、自选 | Postgres 关系表 |
| 基金语义子库（常见问题 / 专家观点向量） | 同一项目里的 **pgvector** 扩展 |

**不需要**单独再开一个向量数据库。

---

## 二、在 Supabase 控制台创建项目（约 5 分钟）

1. 打开 [https://supabase.com/dashboard](https://supabase.com/dashboard)，登录
2. **New project** → 选区域（国内访问建议选离自己近的，如 Singapore / Tokyo）
3. 设置 **Database Password**（务必记下来，后面拼连接串要用）
4. 等待项目状态变为 **Active**

### 2.1 拿到四个关键值

进入 **Project Settings → API**：

| 设置页 / env 字段 | 控制台位置 | 示例形态 |
|-------------------|-----------|----------|
| `SUPABASE_URL` | Project URL | `https://abcdefgh.supabase.co` |
| `SUPABASE_ANON_KEY` | anon public | `eyJhbGciOi...` |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role | `eyJhbGciOi...`（**仅服务端**，不要给前端） |

进入 **Project Settings → Database → Connection string → URI**：

| 字段 | 说明 |
|------|------|
| `DATABASE_URL` | 选 **URI**，把 `[YOUR-PASSWORD]` 换成你的数据库密码 |

**密码含特殊字符时必须 URL 编码**，例如：

| 字符 | 编码 |
|------|------|
| `@` | `%40` |
| `#` | `%23` |
| `$` | `%24` |

连接串形态（二选一）：

| 方式 | 适用 | 连接串来源 |
|------|------|------------|
| **Session pooler（推荐）** | 国内家庭/公司网、只有 IPv4 | 控制台 **Connect → Session pooler** |
| Direct 直连 | 本机支持 IPv6，或买了 IPv4 add-on | **Connect → Direct connection** |

```text
# Direct（很多网络会 DNS/连不上，不推荐国内首选）
postgresql://postgres:你的密码@db.xxxxx.supabase.co:5432/postgres

# Session pooler（推荐）— 用户名常带项目 ref，以控制台为准
postgresql://postgres.xxxxx:你的密码@aws-0-区域.pooler.supabase.com:5432/postgres
```

> **你当前这类报错**：REST `OK`，但 Postgres `getaddrinfo failed` / 解析到 IPv6 —— 几乎总是 **直连主机走 IPv6**。把 `DATABASE_URL` 换成控制台里的 **Session pooler** 整行即可。

---

## 三、把密钥写到本机

### 3.1 首次：从模板复制

```powershell
Copy-Item "D:\CursorProjects\agent-demo\requirement\config\env.template" `
          "D:\CursorProjects\agent-demo\requirement\config\secrets.env"
```

用编辑器打开 `secrets.env`，填入上一步四个值。

### 3.2 编码仓（将来）

```powershell
Copy-Item "D:\CursorProjects\agent-demo\requirement\config\secrets.env" `
          "D:\CursorProjects\agent-demo-app\.env.local"
```

---

## 四、启用 pgvector（语义子库必做）

在 Supabase 控制台打开 **SQL Editor**，执行：

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

看到 `Success` 即可。  
（跑 migration 时也会再执行一次，重复执行无害。）

---

## 五、建表 + 灌演示种子

### 方式 A：控制台手动（最直观）

**SQL Editor** 里按顺序执行本仓库三个文件：

1. `seed/migrations/001_fund_watchlist.sql`
2. `seed/migrations/002_fund_semantic_entries.sql`
3. `seed/fund_watchlist.sql`（空表时插入 019305 / 017704 / 206007）

### 方式 B：本机脚本（推荐）

```powershell
cd D:\CursorProjects\agent-demo\seed

# 依赖（只需一次）
uv pip install -r requirements.txt
# 或：pip install -r requirements.txt

# 从 secrets.env 加载 DATABASE_URL 并检测
python scripts/check_supabase.py

# 建表 + 自选 seed + 语义 seed（无 embedding 接口时用伪向量）
python scripts/check_supabase.py --apply-migrations
python scripts/apply_watchlist.py
python scripts/apply_semantic.py --mock-embedding
```

也可以一条流水线（跳过 PDF 下载）：

```powershell
$env:DATABASE_URL = "postgresql://postgres:密码@db.xxx.supabase.co:5432/postgres"
python scripts/run_all.py --skip-download --mock-embedding
```

---

## 六、验证「真的连通了」

### 6.1 脚本检测

```powershell
cd D:\CursorProjects\agent-demo\seed
python scripts/check_supabase.py
```

期望输出包含：

- `REST API: OK`
- `Postgres: OK`
- `pgvector: OK`
- `fund_watchlist: 3 rows`（跑过 seed 后）

### 6.2 控制台目测

**Table Editor** 里应看到：

| 表 | 预期 |
|----|------|
| `fund_watchlist` | 3 行（019305 / 017704 / 206007） |
| `fund_semantic_entries` | 11 行（仅 019305，8 FAQ + 3 expert） |

### 6.3 SQL 快查

```sql
SELECT fund_code, fund_name, added_at FROM fund_watchlist ORDER BY added_at;
SELECT entry_type, COUNT(*) FROM fund_semantic_entries GROUP BY entry_type;
```

---

## 七、常见问题

| 现象 | 处理 |
|------|------|
| `connection refused` / 超时 | 检查项目是否 Active；密码是否正确；公司网络是否拦 `*.supabase.co` |
| `password authentication failed` | 重置 Database Password（Settings → Database），更新 `DATABASE_URL` |
| `extension "vector" does not exist` | 在 SQL Editor 执行 `CREATE EXTENSION vector;` |
| `ivfflat index` 报错且无数据 | 先 `apply_semantic.py` 写入向量，或暂时注释 migration 里的 ivfflat 索引 |
| `fund_watchlist` 仍是 0 行 | 表非空时 seed 会跳过；清空表后再跑 `fund_watchlist.sql`，或手动 INSERT |
| REST OK、Postgres 失败 | `DATABASE_URL` 密码未编码或填错；应用 **Database** 页的 URI，不是 Pooler 的（初学阶段用直连 URI 最简单） |

---

## 八、和产品的对应关系

| 产品能力 | 连上 Supabase 后 |
|----------|------------------|
| 基金 Tab · 我的自选 | 读 `fund_watchlist` |
| 基金解读 · 语义检索（L2） | 读 `fund_semantic_entries`（pgvector） |
| 基金知识库 · 披露检索（L1） | **仍走本地** `data/fund-knowledge/index.db`，不在 Supabase |

披露库本地搭建见 [`seed/README.md`](../../seed/README.md)。

---

## 九、安全提醒

- `service_role` 密钥权限极高，**不要**提交 Git、不要放前端
- `secrets.env` 已在 `.gitignore` 排除
- 每个部署者用自己的 Supabase 项目（产品不做多租户登录）
