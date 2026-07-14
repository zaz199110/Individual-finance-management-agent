# 部署与联调指南

> **编码仓**：`{APP_ROOT}` = `D:\CursorProjects\agent-demo-app\`（待建或已建）  
> **需求与种子仓**：`D:\CursorProjects\agent-demo\`（本仓库 · PRD + `seed/` + `agents/registry.yaml`）  
> **Supabase 密钥**：`requirement/config/secrets.env`（见 [SUPABASE-GUIDE.md](../requirement/config/SUPABASE-GUIDE.md)）

---

## 1. 总览（首次部署顺序）

```text
1. 创建 Supabase 项目 → 填 secrets.env
2. 初始化编码仓（npm install、migrations）
3. 复制 agents/registry.yaml → 编码仓
4. 运行 seed 流水线（自选 + vault + FTS + L2）
5. 设置页配置模型 / 数据库 → 检测通过
6. 按 §5 验收：**§5.0 聊天壳** + 基金域（DEMO-ABC）+ **§5.4 自由问答** + **§5.5 设置**
7. mermaid-cli smoke（§6）
```

---

## 2. 编码仓初始化

```powershell
cd D:\CursorProjects\agent-demo-app
npm install
npm install -D @mermaid-js/mermaid-cli
```

**Agent 注册表（单一数据源）** — 与 `/` 补全、使用说明 **必须同源**：

```powershell
Copy-Item D:\CursorProjects\agent-demo\agents\registry.yaml `
          D:\CursorProjects\agent-demo-app\agents\registry.yaml
```

校验（在需求仓）：

```powershell
cd D:\CursorProjects\agent-demo
pip install pyyaml
python scripts\validate_registry.py
```

Harness 实现：`list_commands` 读取 `agents/registry.yaml`；前端 `/` 补全与「使用说明」页读取同一文件（或 API 代理）。

---

## 3. Supabase

1. 按 [requirement/config/SUPABASE-GUIDE.md](../requirement/config/SUPABASE-GUIDE.md) 创建项目并填写 `secrets.env`  
2. 检测连通：

```powershell
cd D:\CursorProjects\agent-demo\seed
pip install -r requirements.txt
python scripts\check_supabase.py
python scripts\check_supabase.py --apply-migrations
```

3. 应用编码仓 migration（若已存在 `supabase/migrations/`）：

```powershell
cd D:\CursorProjects\agent-demo-app
npx supabase db push
```

`seed/migrations/` 中的 SQL 可合并进编码仓 migration（`001_fund_watchlist.sql`、`002_fund_semantic_entries.sql`）。

---

## 4. 基金域种子（DEMO-ABC-01）

> 详细说明：[seed/README.md](../seed/README.md) · PRD：[09-fund.md](../requirement/prd/09-fund.md) §9.0.1

### 4.1 离线验收（不需数据库）

```powershell
cd D:\CursorProjects\agent-demo\seed
python scripts\test_seed.py
```

预期：`manifest`、SQL、语义 JSON、vault 目录、FTS 能命中 017704「管理费」。

### 4.2 一键流水线（推荐）

```powershell
cd D:\CursorProjects\agent-demo\seed
python scripts\run_all.py --explore --mock-embedding
```

| 步骤 | 脚本 | 产出 |
|------|------|------|
| 下载 PDF | `download_pdfs.py` | 019305 官方 PDF |
| 转 md | `convert_pdf.py` | vault 内 md |
| 组装 vault | `build_vault.py` | `seed/fund-knowledge/` |
| FTS 索引 | `build_index.py` | `index.db` |
| 自选 | `apply_watchlist.py` | `fund_watchlist` **6 行** |
| L2 向量 | `apply_semantic.py` | `fund_semantic_entries` **100 条通用 FAQ** |

**同步到编码仓**（vault + index.db）：

```powershell
python scripts\run_all.py --skip-db --sync-app
# 或分步：
python scripts\build_vault.py --sync --app-root D:\CursorProjects\agent-demo-app
python scripts\build_index.py --app-root D:\CursorProjects\agent-demo-app
```

编码仓目标路径：

```text
{APP_ROOT}/data/fund-knowledge/          # vault + 各基金目录
{APP_ROOT}/data/fund-knowledge/index.db  # SQLite FTS5
```

### 4.3 生产 embedding（去掉 mock）

设置页或 `secrets.env` 配置 **文本嵌入**（§2.2.7）后：

```powershell
python scripts\apply_semantic.py
# 编码仓 CLI（实现后等价）：
# fund-knowledge semantic index --fund 019305
```

**L2 规模（L2-SEED-02）**：`seed/fund_semantic_entries.json` 含 **100 条通用 FAQ**（`fund_code=*` · 任意基金口语 intent）；`apply_semantic.py` 写入 pgvector 后全基金可用。

```powershell
python scripts\apply_semantic.py
# 或 mock：python scripts\apply_semantic.py --mock-embedding
```

---

## 5. 联调验收 Checklist

### 5.0 聊天壳验收（全场景共有 · shared）

> **详述、REST、SQL**：[`requirement/prd/05-chat-shared.md`](../requirement/prd/05-chat-shared.md) **§5.1.5a/b · §5.10 · §5.11**；metadata → [`03-data-architecture.md`](../requirement/prd/03-data-architecture.md) **§3.3.1**。

**前置**：设置页 **推理 + 联网** 通过（四业务 Tab 另需 DB · SET-DB-01）。

- [ ] §5.1.5a **A1–H1** + §5.1.5b 四项
- [ ] `POST /api/conversations` 满 300 → `evicted_oldest` + Toast

---

### 5.1 基金域 · 六类型演示对照（A～F）

| 代码 | 类型 | 自选 | L1 vault | L2 | 报告预期 |
|------|------|------|----------|-----|----------|
| **019305** | A QDII | ✅ | ✅ | ✅ 通用 FAQ | FK-CITE；ASSET 可能无（仅地区分布季报） |
| **017704** | B 存单 | ✅ | ✅ | ✅ | 存单重仓 + 费率 |
| **110020** | C 宽基 | ✅ | ✅ | ✅ | 指数联接 |
| **206007** | D 主动 | ✅ | ✅ | ✅ | 消费重仓 |
| **519772** | E 平衡 | ✅ | ✅ | ✅ | 股债平衡 |
| **518880** | F 黄金 | ✅ | ✅ | ✅ | 黄金联接 |

> 待决与验收阻塞见 [PENDING-DECISIONS.md](./PENDING-DECISIONS.md)（含 L0 本地化）。

### 5.2 部署后命令（编码仓 CLI · 与 registry `cli_commands` 同源）

```bash
# 披露 FTS（vault 变更后必跑）
fund-knowledge index --all
fund-knowledge index --fund 019305

# 调试 explore
fund-knowledge explore --fund 019305 --query "管理费"

# L2 向量（通用 100 FAQ；需 embedding 配置）
python scripts\apply_semantic.py
# fund-knowledge semantic search --fund 019305 --query "管理费多少"
```

管理页等价操作：**基金知识库 → 更新搜索索引**；expert 上传后 **增量 semantic embed**。

### 5.3 验收步骤（勾选 · DEMO-ABCDEF-01）

> 种子包：**DEMO-ABCDEF-01** — 六类型自选（019305 / 017704 / 110020 / 206007 / 519772 / 518880）+ 六 vault + 2026Q1 季报。

#### ② 我的自选

- [ ] `SELECT * FROM fund_watchlist ORDER BY added_at DESC` → **6 行**（019305、017704、110020、206007、519772、518880）
- [ ] 打开 App · 基金 Tab · **我的自选** Tab 非空
- [ ] 点 **AI 解析** → 切对话 Tab 并触发 `fund_full_report`
- [ ] 点 **删除自选** → 确认 → 可删除预置项；再添加可恢复

#### ③ 基金知识库

- [ ] `{APP_ROOT}/data/fund-knowledge/` 下 **六只** vault 目录均存在（A～F）
- [ ] 各 vault 含 `prospectus/` 或 `quarterly_report/` md；**2026Q1** 季报已入库
- [ ] `index.db` 存在；`explore --fund 019305 --query 管理费` 有命中
- [ ] `fund_lookup` 对六只均返回 live L0（Tushare 或 AKShare；**不用** REG 假数）

#### ① 基金解析（端到端）

- [ ] **019305** 简答「管理费多少」→ 当轮短答，**不出**草稿
- [ ] **019305**「出具完整基金解读报告」→ 进度含 **同步行情、费率与持仓** → 模式 B · 确认发布
- [ ] **206007** 完整报告 → 有 vault + FK-CITE；Verify 通过
- [ ] L0 接口不可用时 → lookup / l0_sync **报错**，提示检查 Tushare / AKShare

#### Registry 同源（基金 Tab）

- [ ] `{APP_ROOT}/agents/registry.yaml` 与需求仓 `agents/registry.yaml` 一致
- [ ] 基金 Tab 输入 `/` → 展示 §5.3.9a 解析 + 自选 Command（无 CLI 运维项）
- [ ] 使用说明 · 基金页 Command 表与 registry `usage_pages.fund` 一致

### 5.4 自由问答验收（chat 域）

> **详述、勾选表、Planner 样例**：[`requirement/prd/05-chat-qa.md`](../requirement/prd/05-chat-qa.md) **§5.15**（Command 见 **§5.3.9b**）。壳层项见 **§5.0**。

**前置**：设置页 **推理 + 联网搜索** 检测通过；截图验收项另需 **图片理解** 槽位。

- [ ] §5.15.1 **Q1–Q14** 全部勾选
- [ ] §5.15.3 registry 两项通过

### 5.5 设置域验收

> **详述、勾选表、API 速查**：[`requirement/prd/02-settings.md`](../requirement/prd/02-settings.md) **§2.7**（模型 · 数据库 · 聊天记忆子文档见 **§2.0**）。

- [ ] §2.7.1 **#1–#9** 全部勾选（含 SET-DB-01 · 数据源 §2.8.9）

---

## 6. Mermaid CLI（全报告共用）

```bash
npx @mermaid-js/mermaid-cli --version
npx mmdc -i requirement/docs/samples/mermaid-smoke.mmd -o %TEMP%\mermaid-smoke.svg
```

报告 publish 前须对正文内 ` ```mermaid ` 块跑 `mmdc` 校验（MERMAID-01）。

---

## 7. HyperFrames CLI（HTML 视频合成）

**依赖**：Node.js 22+、FFmpeg、Chrome headless（`doctor` 会检查）。

```bash
npm run hyperframes:doctor
npx hyperframes --version
```

**Agent Skills**（Claude / Cursor / Harness 共用）：

```bash
npm run hyperframes:skills
```

安装后路径：

| 目标 | 路径 |
|------|------|
| Cursor | `.cursor/skills/hyperframes*`（junction → `.agents/skills/`） |
| Claude Code（项目） | `.claude/skills/` |
| Claude Code（全局） | `~/.claude/skills/` |
| Harness Planner | `skills/hyperframes/SKILL.md` 等（见 `agents/registry.yaml`） |

**常用命令**（在项目内已 `hyperframes init` 的合成目录执行）：

```bash
npm run hyperframes:lint
npm run hyperframes:preview
npm run hyperframes:render
```

入口 Skill：先读 `/hyperframes`，再按需加载 `hyperframes-core`、`hyperframes-animation`、`hyperframes-cli`。

---

## 8. 环境变量速查

| 变量 | 用途 |
|------|------|
| `DATABASE_URL` | seed 脚本写 Supabase |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | REST / 应用 |
| 数据源 | Tushare Token | 设置 → **数据源**（§2.8）；env 为开发 fallback |
| `EMBEDDING_API_URL` / `EMBEDDING_API_KEY` / 模型名 | L2 semantic（或设置页 embedding 槽位） |

详见 `requirement/config/secrets.env` 与 [SUPABASE-GUIDE.md](../requirement/config/SUPABASE-GUIDE.md)。

---

## 9. 故障排查

| 现象 | 处理 |
|------|------|
| FTS 无命中 | 跑 `fund-knowledge index --all`；检查 md 是否在 vault |
| semantic 失败 | 设置页检测 **文本嵌入**；或 `apply_semantic.py --mock-embedding` 仅联调 |
| 自选空 | 跑 `apply_watchlist.py` 或 migration `001_fund_watchlist.sql` |
| `/` 补全与说明不一致 | 重新复制 `agents/registry.yaml` 并重启 dev server |
| L0 全失败 | 确认 Tushare/AKShare；Harness 应走 **web_search** 兜底，不阻断出报告 |

---

## 10. 相关文档

| 文档 | 说明 |
|------|------|
| [requirement/CODING.md](../requirement/CODING.md) | 编码仓结构 |
| [requirement/HARNESS.md](../requirement/HARNESS.md) | Agent 运行时 |
| [requirement/prd/09-fund.md](../requirement/prd/09-fund.md) | 基金域三支柱 |
| [requirement/prd/05-chat.md](../requirement/prd/05-chat.md) | 聊天总览 |
| [requirement/prd/05-chat-shared.md](../requirement/prd/05-chat-shared.md) | 聊天壳 · §5.10 API · §5.1.5a/b 验收 |
| [requirement/prd/05-chat-qa.md](../requirement/prd/05-chat-qa.md) | 自由问答 · §5.3.9b · §5.15 验收 |
| [requirement/prd/02-settings.md](../requirement/prd/02-settings.md) | 设置总览 · §2.7 验收 · 三块子 PRD |
| [seed/README.md](../seed/README.md) | 种子脚本细节 |
