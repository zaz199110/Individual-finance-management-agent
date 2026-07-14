---
skill_id: portfolio_intake
scene: portfolio
prd: requirement/prd/08-portfolio.md §8.1–§8.3
verify: skills/portfolio/portfolio_verify.yaml
tasks: skills/portfolio/portfolio_workflow_tasks.zh.yaml
locale: zh
---

# 持仓分析 · 录入与分析编排 Skill

> **用途**：`scene_portfolio` — **录入/更新持仓** → 触发 `portfolio_report` 草稿。  
> **权威 PRD** → `requirement/prd/08-portfolio.md`  
> **审视规则** → `skills/portfolio/portfolio_verify.yaml`  
> **报告排版** → `skills/portfolio/report.template.zh.md`（**本 Skill 不重复**章节/ECharts 细则）

---

## 何时加载

| 触发 | 说明 |
|------|------|
| `conversation_type=portfolio` · 录入/调仓/分析 | Planner 选本 Skill |
| `port.hold.wait` 阻塞 | 用户改持仓 → `holdings_propose` 重出卡 |
| `port.rpt.wait` | **不** 用本 Skill 改持仓事实 → overlay 或回 `port.hold.*`（RPT-CHAT-ROUTE-01） |
| 定时持仓分析 | 同 Harness · `trigger_source=scheduled` · 无模式 B（RPT-SCHED-01） |

---

## 前置条件

| 检查 | 失败时 |
|------|--------|
| 出分析报告 | 须有 `holdings_versions.is_current=true` 且 ≥1 行 |
| 识图 | portfolio Tab **≤20 张/轮**（PORT-VISION-BATCH-01） |
| 行数 | `positions` **≤100 行**（ERR-HOLDINGS-ROW-LIMIT） |

---

## 端到端流程

```text
[A 录入] hold.input → parse → propose → 持仓确认卡 → hold.wait → holdings_confirm
[B 报告] gather.l0 → gather.plan → draft.tpl → draft.compose → draft.verify → report_publish（定时直发）
```

**无分析结论卡**（PORT-NO-ANALYSIS-CARD-01）：`holdings_confirm` 后直接进 [B]。

任务图 **label 逐字** → `portfolio_workflow_tasks.zh.yaml` · PRD §8.11.2（**一级平铺**）。

---

## 录入三种方式（PORT-INPUT-01）

| 方式 | `source` | Command |
|------|----------|---------|
| 手输 | `manual` | `holdings_propose` |
| 持仓/对账单截图 | `vision` / `vision+manual` | `vision_parse` → 合并 → `holdings_propose` |

**不做** PDF/Excel/Word（PORT-NO-FILE-01）。  
Vision 缺 **买入日 / 买入支付金额** → 追问齐全前 **不出** 确认卡（PORT-VISION-01/02）。

---

## Command 编排

| 阶段 | Command | 类型 | 备注 |
|------|---------|------|------|
| 读持仓 | `holdings_read` | 读 | `/` 可见 |
| 提议 | `holdings_propose` | 提议 | `kind=holdings` |
| 写库 | `holdings_confirm` | 写 | 新版本 + `change_summary` |
| 识图 | `vision_parse` | 读 | portfolio ≤20 张 |
| 行情 | `fund_lookup` / `holdings_nav_gather` | 读 | gather.l0 **force refresh** · 录入期软检查 |
| 背景 | `web_search` | 读 | **默认不调用** |
| 报告 | `report_draft` | 提议 | TPL + compose · `report.template.zh.md` |
| 发布 | `report_publish` | 写 | `holdings_version_id` 必填 |

**Propose 样例** → `requirement/docs/samples/holdings-propose-payload.examples.json`

---

## 确认卡（对客）

| 卡 | `kind` | Mock |
|----|--------|------|
| 持仓 | `holdings` | `skills/shared/confirm_card.mock.zh.md` §五 |

列：代码 · 名称 · 买入日 · 买入支付金额 · 持有份额（可改）。  
**无** 持有收益列（分析时才算）。

---

## 份额默认（PORT-SHARES-01）

`shares = paid_amount ÷ 买入日单位净值`（L0）；用户可在卡上改份额，**买入支付金额** 仍以用户确认为准。

---

## 大类映射（分析时 · PORT-CATEGORY-MAP-01）

- **§三 展示**：QDII型 / 指数型 / 股票型 / 货币型 / 债券型 / 混合型 / 其他（按优先级判定）

---

## 对话修订（RPT-CHAT-ROUTE-01）

| 用户意图 | 路径 |
|----------|------|
| 只改报告表述 | `report_overlay_patch` → merge |
| 改持仓事实 | `port.hold.*` → 新持仓卡 → **重跑** `report_draft` + re-apply overlay |
| 改方案/别的 Tab | 跳转卡 |

---

## 与 §7 分工

- §8 **只读** 已发布方案 · **不** 反写 `allocation_plans`（PORT-NO-PLAN-WRITE-01）
