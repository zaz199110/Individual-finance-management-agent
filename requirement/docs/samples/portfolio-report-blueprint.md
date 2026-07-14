# 持仓分析报告 · 填空蓝图（变体 A / B）

> **状态**：定稿（2026-06-22，compose + L0 gather 拍板）  
> **用途**：`portfolio_report` 触发后 **Gather + 模板拼装 + compose LLM**；Verify 对照章节与字段  
> **参考**：[`portfolio-analysis-report-sample-variant-a.md`](./portfolio-analysis-report-sample-variant-a.md) · [`portfolio-analysis-report-sample.md`](./portfolio-analysis-report-sample.md) · [`skills/portfolio/report.template.zh.md`](../../../skills/portfolio/report.template.zh.md)  
> **详文**：[`portfolio-analysis-report-spec.md`](./portfolio-analysis-report-spec.md)

---

## 0. 已拍板规则

| 项 | 决定 |
|----|------|
| **模板刚性** | 变体 A/B **`##` 章顺序固定**；明细表 / 大类表 / ECharts **TPL 直出** |
| **LLM compose** | 对齐基金：**三句话** + 各章 **开篇段** + **§四 分基短文** + **§七 规则后补句**；TPL fallback |
| **禁止「本章回答」** | 与基金解读一致；正文章 **普通开篇段**（非 blockquote 导语块） |
| **L0** | **宁可缺数，不凑 REG 假数**；`port.rpt.gather.l0` **每次 force refresh**（`syncFundL0Local` 跳过 stale cache） |
| **单基失败** | 明细行标注「暂无行情」，**不阻断**整份报告 |
| **分红失败** | 仍算市值 − 成本；脚注「未纳入现金分红」 |
| **web_search** | **默认不调用** |
| **第 4 图** | 组合加权净值走势 **默认关闭**（§6.3 触发才画） |
| **定时变体** | **有且仅有一个**已发布方案 → **自动变体 B**；否则 **变体 A** |
| **标题** | A：`持仓分析报告-{YYYYMMDD}` · B：`{场景名}-持仓分析报告-{YYYYMMDD}` |

---

## 1. 数据来源图例

| 标记 | 含义 |
|------|------|
| **L0-TS** | Tushare（`fund_basic` / `fund_nav` / `fund_div` 等） |
| **L0-AK** | AKShare 等价公开 HTTP |
| **L1-V** | vault 披露摘录（§四 可选 1 句） |
| **TPL** | 模板固定句 + 槽位 |
| **LLM** | `port.rpt.draft.compose` 生成 |
| **RULE** | 确定性规则（大类映射、偏离、PORT-RISK-01） |

---

## 2. 模块 · 来源（对客名）

| 对客模块 | 优先来源 | 备用 |
|----------|----------|------|
| **阅读指引 / 温馨提示 / 测算免责** | TPL | — |
| **三句话读懂本报告** | **LLM** · 组合汇总槽位 | TPL fallback |
| **持仓速览** | TPL · `holdings_nav_gather` 汇总 | — |
| **文首「数据截至」** | L0 `as_of_trade_date` | — |
| **§一 当前持仓表** | TPL · `positions[]` + 行级 L0 | 失败行「暂无行情」 |
| **§二 组合表现** | **LLM 开篇** + TPL 解读表 + **持有收益横条** | — |
| **§三 结构分布** | **LLM 开篇（可短）** + TPL 大类表 + **环图** | PORT-CATEGORY-MAP-01 |
| **§四 要点** | TPL **一览表** + **LLM** 分基 3～5 句/只 | L1-V 可选 1 句输入 |
| **§五 配置偏离**（B） | **LLM 开篇** + TPL 偏离表 + **方案 vs 实际柱** | `plan_read` |
| **§六 再平衡**（B） | TPL 动作清单 + **LLM 开篇（可短）** | `rebalance_rule` |
| **§七 风险与合规** | **RULE 必含句** + **LLM 补 1～2 句** | — |
| **参考来源** | 仅当曾 `web_search` | 默认省略 |

---

## 3. LLM compose（对齐基金）

> **时机**：`port.rpt.draft.tpl` 模板拼装（HTML 注释占位）→ `port.rpt.draft.compose` 批量写入 → `port.rpt.draft.verify`  
> **失败**：各块 **TPL fallback**；**不阻断**草稿与发布（测算偏差同理）

### 3.1 占位符（编码约定）

| 标记 | 块 |
|------|-----|
| `<!-- PORT-THREE-SENTENCES -->` | 三句话 |
| `<!-- PORT-CH2-INTRO -->` | §二 开篇 |
| `<!-- PORT-CH3-INTRO -->` | §三 开篇 |
| `<!-- PORT-CH4-FUND-{code} -->` | §四 分基段落（每只） |
| `<!-- PORT-CH5-INTRO -->` | §五 开篇（仅 B） |
| `<!-- PORT-CH6-INTRO -->` | §六 开篇（仅 B） |
| `<!-- PORT-CH7-SUPP -->` | §七 LLM 补句（RULE 段之后） |

Verify：**禁止** 正文残留未剥离占位符。

### 3.2 三句话读懂本报告

固定 **3 句、3 主题**；**可含关键汇总数字**（总成本、市值、组合收益、大类占比、变体 B 偏离摘要）。

| 句序 | 主题 | 主要输入 |
|------|------|----------|
| **① 整体盈亏** | 笔数、总成本、市值、持有收益（元+%） | `holdings_nav_gather` 汇总 |
| **② 结构印象** | 大类成本占比；B 时与方案偏离一句 | PORT-CATEGORY-MAP-01 · 变体 B 偏离 |
| **③ 下一步** | 阅读指引 / 再平衡或核对底稿 | 变体 A/B |

**字数（建议）**：每句 **40～90 汉字**；三句合计 **≤240 字**；3 行 blockquote；禁止 bullet。

### 3.3 正文章开篇（§二～§六）

| 章 | 形式 | 字数建议 | 禁止 |
|----|------|----------|------|
| §二 组合表现 | 普通段落 | 80～160 字 | 重复 §一 全表 |
| §三 结构分布 | 普通段落 | 60～120 字 | 用市值做方案比对 |
| §五 配置偏离（B） | 普通段落 | 80～160 字 | 无方案深链 |
| §六 再平衡（B） | 普通段落 | 80～140 字 | 强迫换具体基金 |

### 3.4 §四 分基要点

- TPL：**一览表**（类型 · 角色 · 本期表现%）
- LLM：每只 `### {简称}（{code}）` 下 **3～5 bullet**；输入 L0 类型/费率/持有期 pnl + 可选 L1 一句
- **禁止** 基金解读级长篇；**禁止** 荐基

### 3.5 §七 风险（RULE + LLM）

1. **TPL/RULE** 先写入 PORT-RISK-01 触发句（R1～R6）  
2. **LLM** 在 `PORT-CH7-SUPP` 补 **1～2 句** 情境化说明  
3. **禁止** 与已写入数字矛盾

---

## 4. L0 · `holdings_nav_gather`（编码）

> **进度条**：`port.rpt.gather.l0` · 实现 `src/lib/portfolio/holdings-nav-gather.ts`（待建）

### 4.1 流程

```
positions[] 去重 fund_code
  → syncFundL0Local(code, { force: true })   // 每次报告 gather 强制刷新
  → 按行 invested_at 汇总 dividend（fund_div / AKShare）
  → 行级 market_value / pnl_abs / pnl_pct
  → 组合汇总 + 大类拆分（PORT-CATEGORY-MAP-01）
```

### 4.2 行级输出（`PortfolioPositionMetrics`）

| 字段 | 说明 |
|------|------|
| `l0_ok` | false → 表内「暂无行情」 |
| `nav_latest` / `as_of_trade_date` | 最新净值 |
| `market_value` | `shares × nav_latest`（无净值则空） |
| `cash_dividend_total` | `[invested_at, as_of]` 现金分红 × 份额 |
| `pnl_abs` / `pnl_pct` | PORT-RETURN-01 |
| `stock_position_pct` | 混合拆分 |
| `dividend_missing` | true → 行或组合脚注 |

### 4.3 录入期软检查

`holdings_propose` 后可 `fund_lookup` **提示**代码是否可拉 L0；**不阻断**确认卡。

---

## 5. 方案绑定 · 三层存储

| 层 | 位置 | 内容 |
|----|------|------|
| **会话** | `conversations.metadata.portfolio_plan_context` | 用户选择：compare / variant / goal / plan ids |
| **草稿** | `draft-meta.json` | 本 run **冻结**快照 + `holdings_version_id` + `l0_degraded[]` |
| **发布** | `report_index` | 列：`allocation_plan_id` · `goal_constraint_id` · `holdings_version_id`；metadata：`plan_report_id` · `trigger_source` |

---

## 6. 共用骨架

```markdown
# {report_name}

*为您生成 · {date}*
*数据截至 **{as_of}（最近交易日）***{B：对照「{scene}」方案}*{定时：自动生成}*

---

## 阅读指引
## 三句话读懂本报告
## 持仓速览
## 您的当前持仓
## 组合表现与收益
（LLM 开篇 · 普通段落）
（TPL 解读表 + 持有收益横条 echarts）
## 结构分布
（LLM 开篇 · 普通段落）
（TPL 大类表 + 环图 echarts）
## 主要持仓基金要点
（TPL 一览表 + LLM 分基 ###）
## 对照方案 · 配置偏离        ← 仅 B
## 再平衡参考                  ← 仅 B
## 风险与合规
（RULE + LLM 补句）
## 温馨提示
```

变体 A **禁止** §五 §六 空章占位。

---

## 7. 图表（有数据才出）

| 章 | 图 | 变体 |
|----|-----|------|
| §二 | 持有收益横条 | A / B |
| §三 | 大类环图（成本口径） | A / B |
| §五 | 方案 vs 实际分组柱 | **B** |
| §二末（可选） | 组合加权净值走势 | 默认 **关** |

变体 A **2** 图 · B **3** 图（不含可选第 4 图）。

---

## 8. 进度条（一级平铺 · PORT-STAGE-01）

| 顺序 | task_key | 对客文案 |
|------|----------|----------|
| … | `port.prep.read` / `pick_plan` / `plan_ask` | （见 PRD §8.11） |
| 1 | `port.rpt.gather.l0` | 同步各持仓基金行情与分红 |
| 2 | `port.rpt.gather.plan` | 读取对照方案（A 则 auto-done） |
| 3 | `port.rpt.draft.tpl` | 整理持仓表与图表 |
| 4 | `port.rpt.draft.compose` | 撰写分析导语与要点 |
| 5 | `port.rpt.draft.verify` | 核对报告结构与图表 |
| 6 | `port.rpt.preview` / `wait` / `publish` | 模式 B · 发布 |

---

## 9. 实现状态

| 项 | 状态 |
|----|------|
| Spec / 蓝图 / PRD | ✅ 定稿（本文） |
| `holdings_nav_gather` | ⏳ 待编码 |
| compose + TPL fallback | ⏳ 待编码 |
| 一级 task 图 yaml | ✅ 文档已更新 |
| Sample 去「本章回答」 | ✅ 文档已更新 |
