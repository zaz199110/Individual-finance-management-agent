# 演示种子（DEMO-ABCDEF-01）

> 对应 PRD：[09-fund.md §9.0.1](../requirement/prd/09-fund.md) · WL-01 · KB-01 · L2-SEED-02

编码 / demo 前须补齐的数据：

| 块 | 产物 | 本目录 |
|----|------|--------|
| ② 我的自选 | `fund_watchlist` 默认 **6 行**（A～F） | `fund_watchlist.sql` |
| ③ L1 vault | 六只 demo 披露库 + FTS | `fund-knowledge/` + `scripts/build_index.py` |
| ③ L2 向量 | **100 条通用 FAQ**（`fund_code=*`） | `fund_semantic_entries.json` |
| ④ 交易日历 | `trading_calendar` 2026 全年（Tushare SSE） | `trading_calendar_2026.sql` · `scripts/fetch_trading_calendar.py` |

## 目录结构

```
seed/
├── manifest.json              # 三只基金元数据 + PDF 下载源
├── fund_watchlist.sql         # 幂等 INSERT（空表时）
├── fund_semantic_entries.json # L2 通用 FAQ 100 条（embedding 由脚本生成）
├── bundled/                   # 017704 披露 md、019305 expert md
├── migrations/                # 可复制到 agent-demo-app/supabase/migrations/
│   ├── 001_fund_watchlist.sql
│   ├── 002_fund_semantic_entries.sql
│   ├── 003_scheduled_and_trading_calendar.sql
│   ├── 006_profile_core.sql      # 须在 004 之前
│   ├── 004_allocation_plans.sql
│   ├── 005_holdings_versions.sql
│   └── 007_report_index.sql      # 须在 004、005 之后
├── scripts/
│   ├── run_all.py             # 一键流水线
│   ├── download_pdfs.py       # 联网下载 019305 官方 PDF
│   ├── convert_pdf.py         # PDF → md
│   ├── build_vault.py         # 组装目录 + 可选同步到编码仓
│   ├── build_index.py         # SQLite FTS5 index.db
│   ├── apply_watchlist.py
│   ├── apply_semantic.py
│   └── test_seed.py           # 离线验收（不需数据库）
└── fund-knowledge/            # 运行后生成（PDF/md）
```

## 快速开始

> **完整部署与 A～F 验收**：[docs/DEPLOY.md](../docs/DEPLOY.md) §4–§5

### 1. 依赖

```bash
cd seed
pip install -r requirements.txt
```

### 2. 离线验收（推荐先跑）

```bash
python scripts/test_seed.py
```

验证：manifest、SQL、语义 JSON、vault 目录、FTS 能命中 017704「管理费」。

### 3. 完整流水线（含联网下载 PDF）

```bash
python scripts/run_all.py --explore
```

步骤：下载 PDF → 转 md → 复制 bundled → 建 `index.db`。

### 4. 写入 Supabase（编码仓联调）

**先读连通指南**：[`requirement/config/SUPABASE-GUIDE.md`](../requirement/config/SUPABASE-GUIDE.md)

```powershell
# 检测连通（自动读 requirement/config/secrets.env）
python scripts/check_supabase.py

# 建表 + 灌种子
python scripts/check_supabase.py --apply-migrations
python scripts/apply_watchlist.py
python scripts/apply_semantic.py --mock-embedding
python scripts/fetch_trading_calendar.py --year 2026 --apply-migrations --apply
```

- `--mock-embedding`：无 embedding 接口时用确定性伪向量跑通 pgvector 写入
- 生产：配置 `EMBEDDING_API_URL` / `EMBEDDING_API_KEY` 后去掉该参数

### 5. 同步到编码仓

```bash
python scripts/build_vault.py --sync --app-root D:\CursorProjects\agent-demo-app
python scripts/build_index.py --app-root D:\CursorProjects\agent-demo-app
```

## 演示六只对照（A～F）

| 代码 | 类型 | vault | 说明 |
|------|------|-------|------|
| **019305** | A QDII | ✅ | 海外指数；expert bundled |
| **017704** | B 存单 | ✅ | bundled 披露 md |
| **110020** | C 宽基 | ✅ | 沪深300 联接 |
| **206007** | D 主动 | ✅ | 消费主题混合 |
| **519772** | E 平衡 | ✅ | 股债平衡 |
| **518880** | F 黄金 | ✅ | 黄金 ETF 联接 |

L2：**100 条通用 FAQ**（任意基金共用）；专家观点仅 vault L1，不进 L2。

待决项见 [docs/PENDING-DECISIONS.md](../docs/PENDING-DECISIONS.md)。

## 复制到编码仓

将本目录整体复制或软链到 `agent-demo-app/seed/`，migration 复制到 `supabase/migrations/`。
