> [← PRD 索引](../PRD.md) · **9. 基金域（总览）**

## 9. 基金域（总览）

### 模块说明

三块能力：**解析**（§9.1）、**自选**（§9.3）、**知识库维护**（§9.2，侧栏全局页）。提到基金代码 ≠ 自动出长报告（FUND-INTENT-01）。检索与存储 → [knowledge §9.2.0](./09-fund-knowledge.md)。

### 9.0 三支柱对照

| 块 | 用户一句话 | 入口在哪 | Done 是什么 | 数据存哪 | 详细 PRD |
|----|------------|----------|-------------|----------|----------|
| **① 基金解析** | 「帮我把这只基讲清楚 / 出报告」 | 底部 Tab **基金** → 对话；或自选 **AI 解析** | **确认发布**后报告进「我的报告 · 基金解读」；简答 = 当轮气泡结束 | 草稿：`data/runs/…`；已发布：`data/reports/fund/` + `report_index` | [**09-fund-analysis.md**](./09-fund-analysis.md) · §9.1 |
| **② 我的自选** | 「我常看的基金放一块，一键解读；**可随时踢出**」 | 底部 Tab **基金** → 主区 **我的自选** | 增删成功（**含删除预置三只**） | Supabase **`fund_watchlist`** | [**09-fund-watchlist.md**](./09-fund-watchlist.md) · §9.3 |
| **③ 基金知识库** | 「上传招募书/PDF，让 Agent 能引用原文」 | 侧栏全局 **基金知识库** → `/fund-knowledge` | 上传/刷新后索引同步；L2 FAQ 可 semantic 搜 | 本地 **`data/fund-knowledge/`** + `index.db`；L2 → pgvector FAQ only | [**09-fund-knowledge.md**](./09-fund-knowledge.md) · §9.2 |

**三者关系（不互相绑死）**

```
                    ┌─────────────────┐
                    │  ③ 基金知识库    │  运维/演示上传 PDF → md → 索引
                    │  （全局独立页）   │
                    └────────┬────────┘
                             │ L1 explore / L2 semantic（解析时只读）
                             ▼
┌──────────────┐    ┌─────────────────┐    ┌──────────────────┐
│ ② 我的自选    │───▶│  ① 基金解析      │───▶│ 我的报告·基金解读 │
│ fund Tab 列表 │ AI │ 简答 / 完整报告  │发布│ （§4.1.1）        │
└──────────────┘ 解析 └─────────────────┘    └──────────────────┘
      │                      │
      │ 同 fund_code         │ L0 live（Tushare→AKShare→`l0-cache`→联网兜底）
      │ 无外键               │ **不用** REG 假持仓；无 L0 前十时 C 型可省略「投向与重仓」
      └──────────────────────┘
```

| 规则 | 说明 |
|------|------|
| **自选 ≠ 持仓** | `fund_watchlist` 与 `holdings_versions` **无关** |
| **自选 ≠ 报告** | 删自选 **不删** 已发布报告；报告 **不依赖** 是否在自选 |
| **知识库 ≠ 解析入口** | 用户 **不在** 聊天里上传 PDF；只走管理页（§0.3） |
| **提到代码 ≠ 出报告** | 解析须判 **`fund_qa`** vs **`fund_full_report`**（§9.1.0） |

### 9.0.1 演示六只（DEMO-ABCDEF-01 · **唯一总表**）

> 自选 / 知识库 / 报告验收 **共用本表**；覆盖报告 archetype **A～F 各一**。

| 代码 | 简称 | Archetype | ② 自选默认 | ③ vault | ③ L2 |
|------|------|-----------|-----------|---------|------|
| **019305** | 摩根标普500(QDII)C | **A** QDII | ✅ | ✅ A 档满配 | 通用 FAQ |
| **017704** | 兴业同业存单AAA… | **B** 固收/存单 | ✅ | ✅ B 档披露 | 通用 FAQ |
| **110020** | 易方达沪深300ETF联接A | **C** 指数 | ✅ | ✅ B 档披露 | 通用 FAQ |
| **206007** | 鹏华消费优选混合 | **D** 主动偏股 | ✅ | ✅ B 档披露 | 通用 FAQ |
| **519772** | 交银定期支付双息平衡 | **E** 平衡/偏债 | ✅ | ✅ B 档披露 | 通用 FAQ |
| **518880** | 华安黄金ETF联接A | **F** 商品/FOF式 | ✅ | ✅ B 档披露 | 通用 FAQ |

> **L2（KB-02）**：`fund_semantic_entries` 为 **100 条通用口语 FAQ**（`fund_code=*`），**非**单基金专属；运行时只读，见 [knowledge §9.2.10](./09-fund-knowledge.md)。

### 9.0.2 跨块决项索引

| ID | 块 | 摘要 | 位置 |
|----|-----|------|------|
| FUND-INTENT-01 | ① | 提到代码 ≠ 自动出报告 | [analysis §9.1.0](./09-fund-analysis.md) |
| RPT-DRAFT-01 / RPT-REV-01 | ① | 每对话 1 草稿；修订 **同一 run_id** + 全量 re-Verify | §4.1.0 · [analysis §9.1.2](./09-fund-analysis.md) |
| WL-01～WL-04 | ② | 默认 3 只、排序、AI 解析、发布后建议加自选 | [watchlist](./09-fund-watchlist.md) |
| KB-01 / L2-SEED-01 / FK-CITE | ③ | vault、FTS、块引用、L2 只 seed 不写 | [knowledge](./09-fund-knowledge.md) |
| DEMO-ABCDEF-01 | 三块 | 上表 A～F 六只 · 自选默认 | §9.0.1 + 各子文档 |
| FK-ENRICH-01 | ①③ | 完整报告前 **知识库预热**（§9.1.6） | [analysis §9.1.6](./09-fund-analysis.md) |
| KB-02 | ③ | 单基金 **FAQ**（约 15～30 条 · A 档 **30 条**）；expert 仅 vault | [knowledge §9.2.10](./09-fund-knowledge.md) |
| L0-FALLBACK-01 | ① | L0 挂了 → 联网补；不阻断报告 | [analysis §9.1.8](./09-fund-analysis.md) |
| UX-PC-01 | 全局 | 仅 PC，不做移动布局 | §1.2.5 |

### 9.0.3 演示数据 · 对客 Mock · L0（Hub 口径）

| 项 | 说明 |
|----|------|
| **对客 Mock 正文** | [`fund-analysis-report-sample.md`](../docs/samples/fund-analysis-report-sample.md) — **019305 · Archetype A · 3× `echarts`**（资产饼 + 前十横条 + 费率柱）；**话术 / 版式 / Verify 对照** · **非**运行时预挂载报告 |
| **实现 Spec** | [`fund-analysis-report-spec.md`](../docs/samples/fund-analysis-report-spec.md) · 六类型规则 → [`fund-report-blueprints-A-F.md`](../docs/samples/fund-report-blueprints-A-F.md) |
| **L0 行情** | `fund_lookup` / `fund.prep.l0_sync`：**Tushare → AKShare**；成功写入 `data/l0-cache` + `l0_sync_log`；后续 fetch **优先读缓存** |
| **REG / registry** | `FUND_L0_REGISTRY` · `registry-portfolio` **仅** archetype / 类型 / 演示筛选用静态指标；**已删除** `REGISTRY_PORTFOLIO_DEMO` 假持仓 · **禁止**向报告注入假前十 |
| **前十来源** | 报告 **前十表/横条仅 L0**（`fund_portfolio` / `fund_portfolio_hold_em` 等）；**不是** L1 季报表格直出 |
| **C 型 110020** | L0 **无**前十 → **整段省略** `### 投向与重仓`（不做 L3 凑段） |
| **基金版式** | **禁止「本章回答」**（与投资需求 RPT-FORMAT-01 不同）；第二/三章为 **普通开篇段** + `l0_summary` / 风险摘要 |
| **CI** | **不**增加 mock L0 模式；单测 / 离线验收用 fixture 或已有 `l0-cache` 快照 |

---

**子文档**

1. [09-fund-analysis.md](./09-fund-analysis.md) — 基金解析（§9.1）  
2. [09-fund-watchlist.md](./09-fund-watchlist.md) — 我的自选（§9.3）  
3. [09-fund-knowledge.md](./09-fund-knowledge.md) — 基金知识库维护（§9.2）
