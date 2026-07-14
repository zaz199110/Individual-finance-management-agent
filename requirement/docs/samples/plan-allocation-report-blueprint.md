# 资产配置方案 · 五场景填空蓝图（goal_type）

> **状态**：定稿（2026-06-22）  
> **用途**：`scene_plan` 两步确认 + `plan_report` / `report_draft`（`report_type=plan`）按 **goal_type** **Gather + 模板拼装**；Verify / Hook 对照  
> **参考**：[`plan-allocation-report-sample.md`](./plan-allocation-report-sample.md) · [`plan-allocation-report-spec.md`](./plan-allocation-report-spec.md) · [`skills/plan/report.template.zh.md`](../../../skills/plan/report.template.zh.md)  
> **PRD**：[§7 资产配置](../../prd/07-allocation-plan.md)

---

## 0. 已拍板规则

| 项 | 决定 |
|----|------|
| **报告标题** | `{场景对客名}-资产配置方案-{YYYYMMDD}`（**RPT-PLAN-NAME-02** · 不用「投资规划书」） |
| **模板刚性** | 五场景 **`##` 章顺序相同**；表/echarts **100% 填槽**；三句话 + 建仓节奏原因 + 文案润色 **少量 LLM** |
| **大类** | 仅 **股票类 / 债券类 / 货币类**；**禁止** 商品类入池与正文 |
| **第一步** | 投资需求 md + **联网**（≤3 citation）→ LLM 提议大类 → Hook → **重试 ≤3** → confirm |
| **第二步** | 联网（≤5）+ **`plan_screen_funds` 全市场 Top40** → LLM 选 5～6 只 + 规则算执行表 |
| **QDII** | **默认允许**；md/用户明确不要 → 剔除 |
| **规划书** | confirm 后 **纯填槽**；建仓节奏原因 **LLM 生成**（≤200字） |
| **验收** | 同一客户（张先生）**五 goal_type 各一条**完整链路；P0 养老 · P2 全五场景 |
| **Dev 样例口令** | 「用样例大类/明细」保留 · **验收不走样例** |

---

## 1. 五场景变体（骨架相同 · 槽位不同）

### 1.0 共用骨架（所有 goal_type）

```markdown
# {场景名}-资产配置方案-{YYYYMMDD}

*为您生成 · {date}*
*本方案针对 **「{场景名}」** · 数据与公开资讯截至 **{as_of}***

## 三句话读懂本方案
## 个人信息                  （从投资需求报告提取 · 11项客户信息 + 深链）
## 投资场景需求              （风险偏好/投资期限/一次性投入/每月投入/目标年化收益/最大回撤承受/定投期限）
## 大类资产配置              （≥1 echarts）
## 配置基金                  （≥1 echarts · 基金名称/代码/资产类别/占组合比例）
## 分批建仓计划              （加仓时间/基金中文简称/基金代码/拟定买入金额 + 建仓节奏原因≤200字）
## 温馨提示                  （本报告由AI输出，仅供参考，请审慎投资。）
```

### 1.1 场景配置表

| goal_type | 对客名 | §一 特化字段 | 第一步 web 检索模板（示例） | §六 流动性/场景句 |
|-----------|--------|--------------|----------------------------|-------------------|
| `retirement` | 退休养老 | `retirement_age`、社保 | `{场景} 稳健 股债配置 退休储备 宏观` | 退休前原则上不动；货币应急 |
| `education` | 子女教育 | `target_year`、`education_path` | `{场景} 教育金 中长期 股债配置` | 距目标年 **N** 年；到期前流动性 |
| `housing` | 购房置业 | `purchase_timeline`、`target_amount` | `{场景} 购房首付 债券 流动性 配置` | 距买房 **N** 年；临近降权益 |
| `marriage_child` | 结婚生育 | `timeline`、`estimated_cost` | `{场景} 婚育 短期 稳健 配置` | 2–3 年节点；流动性优先 |
| `wealth_growth` | 财富增值 | `fund_source`、`intended_use` | `{场景} 闲钱 长期增值 股债配置` | 非应急金；可承受略高波动 |

### 1.2 验收 seed 金额（同一客户 · Hook #8）

`financial_assets=500000` · `monthly_investable=3500` · **Σprincipal=500000 · Σmonthly=3500**

| goal_type | principal | monthly | risk | max_dd | expected | 目标大类 %（股/债/货） |
|-----------|-----------|---------|------|--------|----------|------------------------|
| retirement | 120,000 | 1,000 | 稳健 | -15% | 4.5% | 25 / 55 / 20 |
| education | 80,000 | 800 | 平衡 | -20% | 5% | 35 / 50 / 15 |
| housing | 150,000 | 1,000 | 稳健 | -12% | 4% | 15 / 55 / 30 |
| marriage_child | 50,000 | 400 | 稳健 | -15% | 4% | 10 / 40 / 50 |
| wealth_growth | 100,000 | 300 | 平衡 | -20% | 5.5% | 40 / 45 / 15 |

详 JSON → [`profile-propose-payload.examples.json`](./profile-propose-payload.examples.json)

---

## 2. 数据来源图例

| 标记 | 含义 |
|------|------|
| **DB** | `allocation_plans` / `investment_goal_constraints` / profile md |
| **NET-S1** | 第一步 `web_search` · `allocation_citations`（≤3） |
| **NET-S2** | 第二步 `web_search` · `web_citations`（≤5） |
| **L0-TS** | Tushare |
| **L0-AK** | AKShare（本机已验） |
| **SCR** | `plan_screen_funds` 全市场初筛 |
| **TPL** | 模板固定句 + 槽位 |
| **LLM** | 一次短调用（润色/归纳/提议） |
| **RULE** | 确定性规则（Hook / 执行表 / §六 公式） |

---

## 3. 第一步 · 大类配置

### 3.1 Gather

| 序 | 输入 | 产出 |
|----|------|------|
| 1 | 投资需求 md 全文 | — |
| 2 | `investment_goal_constraints` 结构化 | Hook 对照 |
| 3 | `web_search`（goal_type 模板 · **≤3**） | `allocation_citations` |
| 4 | LLM 提议 | `target_allocation` + `allocation_rationale` 草稿 |
| 5 | `plan_check_conflicts` + `plan_check_completeness`（step=1） | 0 或矛盾清单 |
| 6 | 失败 → **重试 prompt**（≤3 轮） | 修订 JSON |
| 7 | `refinePlanAllocationRationale`（**一次**） | 润色后 rationale |
| 8 | 大类确认卡 → 写库 `plan_step=1` | `allocation_citations` 落库 |

**PL-PLAN-S1-NET-01**：第一步 **须** 联网成功；失败 **阻断**（与第二步一致）。

**分工**：

- `allocation_rationale` = **与您约束对齐**（期限、回撤、场景、比例逻辑）；**不写**单只基金；**不写**宏观预测式承诺  
- `allocation_citations` **不进**规划书 §三（§三只用第二步 `web_citations`）

### 3.2 Hook 重试（LLM 输入）

```
约束 JSON + 上一轮 target_allocation/rationale + hook_fail_list（逐条）
+ allocation_citations 摘要 + hook_rules_s1_summary
→ 仍仅输出 JSON · 禁止 fund_code
```

### 3.3 权益上限提示（Hook #2 · LLM system 摘要）

| max_drawdown | risk_tolerance | equity 建议上限 |
|--------------|----------------|-----------------|
| ≤10% | 保守 | 15% |
| ≤15% | 稳健 | 30% |
| ≤20% | 平衡 | 45% |
| ≤25% | 进取 | 65% |

`years_to_goal ≤ 5`（education/housing/marriage）→ 再 **−5～10pp** 权益提示。

### 3.4 Prompt 模板 ID

| ID | 用途 |
|----|------|
| `plan.s1.allocation.propose` | 首次大类提议 |
| `plan.s1.allocation.retry` | Hook 失败后重试 |
| `plan.s1.rationale.refine` | confirm 前 rationale 润色 |

正文见本文 **§9**。

---

## 4. 第二步 · 明细与执行

### 4.1 `plan_screen_funds`（PL-PLAN-L0-FULL-01）

**名录**：Tushare `fund_basic`（`market=O`, `status=L`）→ AKShare `fund_overview_em` 补漏。

**硬过滤**（剔除）：

| 规则 | 条件 |
|------|------|
| 品种 | 中国公募；**非**私募/信托/海外直投 |
| 商品 | 商品类基金 **剔除** |
| QDII | **默认保留**；md/用户禁 QDII → 剔除 |
| 代码 | `^\d{6}$` 且概况可查 |
| 大类映射 | 必须映射到 股票/债券/货币 之一 |

**软过滤 + 排序**（每类 **Top 40**）：

| 大类 | 最低规模 | 最短成立 | 其他 |
|------|----------|----------|------|
| 股票类 | **≥ 2 亿元** | **≥ 3 年** | 优先开放型；ETF/联接/指数 **允许** |
| 债券类 | **≥ 1 亿元** | **≥ 2 年** | 剔除明显可转债单主题（除非用户要） |
| 货币类 | **≥ 5000 万元** | **≥ 1 年** | 须为货币型 |

**排序分**：`0.5·log10(AUM_亿) + 0.3·稳定性 + 0.2·规模分位`；同系列优先 **A/主份额**。

**LLM**：**仅**从 Top40×3 候选中选 **6～8 只**；`execution_schedule` **RULE 算表** + LLM 写 `fund_deploy[].note`；`recommendation_reason` 结构化 → **`plan.s2.reason.refine` 润色**。

**卫星（PL-PLAN-SECTOR-01）**：无用户行业偏好 → 资讯看好 **≤1** 行业卫星，否则宽基分散。

### 4.2 Prompt 模板 ID

| ID | 用途 |
|----|------|
| `plan.s2.detail.propose` | 选基 + 执行 JSON |
| `plan.s2.detail.retry` | Hook step=2 失败重试 |
| `plan.s2.reason.refine` | 推荐理由润色 |

---

## 5. 规划书 · 章节槽位

| 章 | 来源 | LLM |
|----|------|-----|
| 三句话 | `deriveRelativeMetrics` + RULE 草稿 | **一次** `plan.rpt.three_sentences.refine` |
| §一 个人信息 | 从投资需求报告提取客户信息层 11 项 | 否 |
| §二 投资场景需求 | 投资需求报告中的投资约束字段（仅展示有值的字段） | 否 |
| §三 大类资产配置 | `target_allocation` + 大类占比 echarts | 否 |
| §四 配置基金 | `detailed_plan`（基金名称/代码/资产类别/占组合比例） | 否 |
| §五 分批建仓计划 | `execution_schedule`（加仓时间/基金中文简称/基金代码/拟定买入金额） | **一次** `plan.rpt.section5.reason` 建仓节奏原因（≤200字） |

---

## 6. §六 风险粗估（PLAN-RISK-INDEX-01）

### 6.1 代理指数

| 大类 | Tushare（优先） | AKShare 备用（已验） | 禁用 |
|------|-----------------|----------------------|------|
| 股票类 | `index_daily` · `000300.SH` 沪深300 | `stock_zh_index_daily("sh000300")` · `date,close` | — |
| 债券类 | `index_daily` · `000832.CSI` 中证全债 | `stock_zh_index_daily("sh000012")` **上证国债**（对客注明代表债券类） | `sh000832`（停更 2018） |
| 货币类 | `index_daily` · `H11025.CSI` 中证货币基金指数 | 无序列时 **固定锚点**（见下） | — |

**Tushare 字段**：`index_daily` → `trade_date, close`（与现有 `tushare-client.ts` 一致）。

### 6.2 数据瀑布

```
① 本地缓存（index_code + 窗口）
② Tushare index_daily
③ AKShare stock_zh_index_daily
④ web_search（仅补指数公开统计 · 仍无法得 close 序列 → 缺数）
⑤ 货币类：Tushare/AK 均失败 → 固定锚点 vol 0.3–0.8% · DD 0~−0.5%（须标注「代表指数不可用」）
```

**宁可缺数，不凑假数**：波动/回撤格无依据时写 **「—」** + 缺数说明；流动性行仍用 TPL。

### 6.3 算法（3Y + 5Y → 区间）

对每指数、窗口（约 **756 / 1260** 交易日）：

- **年化波动**：日收益 σ × √252 → 3Y/5Y 合成 **区间**  
- **最大回撤**：窗口 peak-to-trough；组合 **加权启发式**（非组合回测）

组合：`σ_port = sqrt(Σ w_i² σ_i²)` · `DD_port ≈ Σ w_i |DD_i|`（略放宽 1pp 对客）

**对客依据句（TPL · PLAN-RISK-DISCLAIMER-01）**：

> 按您确认的大类比例，参照 **沪深300、中证全债（或上证国债代表）、货币市场指数** 近 **3～5 年** 公开历史 **粗算**，**非**本方案所选基金之回测，**非**收益或回撤承诺。

含 QDII 时追加：**权益含 QDII 部分还受海外与汇率影响**。

### 6.4 Verify

§六 数字与 `deriveRiskMetricsFromIndices()` **完全一致**；LLM **不得**改数。

---

## 7. 图表（PL-REPORT-EC · 全报告 ≥2）

| 章 | 图 | 数据 |
|----|-----|------|
| §三 | 大类环/饼 | `target_allocation.categories` |

配色：股 `#22c55e` · 债 `#3b82f6` · 货 `#94a3b8`

---

## 8. 进度条（摘要）

| 阶段 | task_key | 说明 |
|------|----------|------|
| 准备 | `plan.prep.check` | N≥1 完善需求 |
| S1 | `plan.s1.allocation.web` | 第一步联网 |
| S1 | `plan.s1.allocation.propose` | LLM 大类 |
| S1 | `plan.s1.allocation.verify` | Hook step=1 |
| S2 | `plan.s2.detail.web` | 第二步联网 |
| S2 | `plan.s2.detail.screen` | `plan_screen_funds` ×3 |
| S2 | `plan.s2.detail.propose` | LLM 明细 |
| S2 | `plan.s2.detail.verify` | Hook step=2 |
| 报告 | `plan.rpt.draft` → `plan.rpt.draft.verify` | 模板 + Verify |

---

## 9. LLM Prompt 模板（正文）

### 9.1 `plan.s1.allocation.propose`

```text
你是资产配置助手。根据【投资需求报告全文】与【结构化约束 JSON】，在仅含「股票类、债券类、货币类」的前提下，提议大类比例。

【公开检索摘要】（≤3 条，仅供配置语境，勿写进推荐理由中的具体基金）
{allocation_citations_summary}

【必须遵守】
- 比例之和 = 100%（±0.5%）
- 不得输出任何 fund_code
- allocation_rationale：对齐期限、max_drawdown、expected_return、流动性、场景目标；不写单只基金；不写「建议买入」
- 权益比例须与 risk_tolerance、max_drawdown 大致匹配
{hook_rules_s1_summary}

【输出 JSON】
{"target_allocation":{"categories":[{"category":"股票类","allocation_pct":25,"amount_cny":48000},...]},"allocation_rationale":"..."}
```

### 9.2 `plan.s1.allocation.retry`

```text
上一轮大类方案未通过审视。请仅修订比例与 allocation_rationale，不要辩解。
【结构化约束】{constraints_json}
【上一轮】{prev_target_allocation} / {prev_rationale}
【矛盾清单 · 须逐条消掉】{hook_fail_list}
【公开检索摘要】{allocation_citations_summary}
仍输出同一 JSON。禁止 fund_code；比例之和 100%。
```

### 9.3 `plan.s1.rationale.refine`

```text
润色 allocation_rationale 为对客白话（2-4 短段）。
禁止：改数字、增删大类、fund_code、宏观承诺。
须保留：期限、回撤边界、场景名、股债货比例。
【原文】{draft_rationale}
仅输出润色后正文。
```

### 9.4 `plan.s2.detail.propose`

```text
已确认大类：{target_allocation_summary}
投资需求约束（金额/分批/禁投）：{md_constraint_excerpt}
公开资讯（≤5）：{web_citations}
【候选池 · 只能从这里选】
股票类：{stock_candidates_40}
债券类：{bond_candidates_40}
货币类：{cash_candidates_40}
输出 detailed_plan、execution_schedule、rebalance_rule JSON。
recommendation_reason 先写结构化要点；货币 dca_in_periodic=false。
```

### 9.5 `plan.s2.reason.refine`

```text
将结构化要点润色为对客「推荐理由」一句到两句。
禁止 L0/L1/内部词；禁止改 fund_code/权重。
【要点】{structured_reason}
```

### 9.6 `plan.rpt.section5.reason`

```text
根据投资场景需求和大类资产配置，撰写分批建仓计划的建仓节奏原因（≤200字）。
要求：语句含义完整，简明清晰，说明为什么这样安排建仓节奏。
【投资场景需求】{investment_scenario}
【大类资产配置】{target_allocation}
【分批建仓计划】{execution_schedule}
仅输出建仓节奏原因正文。
```

### 9.7 `plan.rpt.three_sentences.refine`

```text
润色 blockquote 三句，保留 ①②③ 前缀与所有数字。禁止新增事实、荐基、改比例。
【规则草稿】{three_sentences_draft}
```

---

## 10. 实现状态

| 项 | 状态 |
|----|------|
| 蓝图 + PRD 补丁 | ✅ 本文 + §7 |
| `plan-report-blueprint.ts` / `report-draft` 重写 | ✅ |
| `plan_screen_funds` | ✅ |
| Hook `plan_check_*` | ✅ |
| 五场景 profile seed + 已发布 md | ⏳ P2 |
| `allocation_citations` 迁移 | ✅ `013_allocation_citations.sql` |

---

## 附录 A · AKShare 验证（2026-06-22）

| 接口 | 用途 | 结果 |
|------|------|------|
| `stock_zh_index_daily("sh000300")` | 沪深300 | ✅ 5931 行 · 至 2026-06-18 |
| `stock_zh_index_daily("sh000012")` | 上证国债（债代理） | ✅ 至 2026-06-18 |
| `stock_zh_index_daily("sh000832")` | 中证全债 AK | ❌ 停更 2018 · **禁用** |
| `index_zh_a_hist` / `stock_zh_index_daily_em` | 文档 id1 推荐 | ❌ 本环境 ConnectionError · **不作主路径** |
| `fund_money_fund_daily_em` | 货基名录参考 | ✅ 不作货指时序 |

脚本：`automation/tmp/verify_akshare_index_result.json`
