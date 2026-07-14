---
skill_id: portfolio_report
report_type: portfolio
prd: requirement/prd/08-portfolio.md §8.4
spec: requirement/docs/samples/portfolio-analysis-report-spec.md
blueprint: requirement/docs/samples/portfolio-report-blueprint.md
sample_a: requirement/docs/samples/portfolio-analysis-report-sample-variant-a.md

locale: zh
---

# 持仓分析报告 · 模板与 Mock

> **用途**：`portfolio_report` → Gather → TPL → compose → Verify（`report_type=portfolio`）。  
> **结构**：固定 **5** 章、**2** 图（收益横条图 + 结构分布饼图）。  
> **蓝图（定稿）** → `portfolio-report-blueprint.md`

**PRD** → `08-portfolio.md` §8 · **PORT-01**  
**Spec** → `portfolio-analysis-report-spec.md`  
**Mock** → `portfolio-analysis-report-sample-variant-a.md`

| 层级 | 文件 |
|------|------|
| 编排 | `portfolio_skill.md` |
| 本 Skill | 骨架 + ECharts + Verify 摘要 |
| 蓝图 | `portfolio-report-blueprint.md` |
| 任务图 | `portfolio_workflow_tasks.zh.yaml` |

---

## 何时生成

| 触发 | 说明 |
|------|------|
| `holdings_confirm` + 「重新分析」 | 生成报告 |
| **定时** | 生成报告 · 直发 |
| **禁止** 无 `is_current` / 未保存确认卡 | §8.1 |

**web_search**：**默认不调用**。

---

## 一级标题（PORT-NAME-01）

| 格式 |
|------|
| `持仓分析报告-{YYYYMMDD}` |

文首副标题 → Spec §3 · 定时加「自动生成」句。

---

## 章节骨架

| 章 | `##` | 备注 |
|----|------|------|
| 一 | 您的当前持仓 |
| 二 | 组合表现与收益 | +1图（收益横条图） |
| 三 | 结构分布 | +1图（结构分布饼图） |
| 四 | 主要持仓基金要点（表+分基） |
| 五 | 风险与合规 |

**版式**：章间 `---` · **禁止「本章回答：」** · 正文章 **LLM 开篇普通段** + TPL 表/图。

---

## 流水线（一级 task · PORT-STAGE-01）

```text
port.rpt.gather.l0 → port.rpt.gather.plan → port.rpt.draft.tpl
  → port.rpt.draft.compose → port.rpt.draft.verify
  → port.rpt.preview → port.rpt.wait → port.rpt.publish
```

| 步 | 职责 |
|----|------|
| **gather.l0** | `holdings_nav_gather` · **force** L0 · 分红 · 行级 pnl |
| **gather.plan** | auto-done |
| **draft.tpl** | 明细表 · 图表 · compose HTML 占位 |
| **draft.compose** | 章导语 · §四 分基 · §五 补句 |
| **draft.verify** | `portfolio_report_verify` |

---

## compose 占位（PORT-COMPOSE-01）

`PORT-CH2-INTRO` · `PORT-CH3-INTRO` · `PORT-CH4-FUND-{code}` · `PORT-CH5-SUPP`

失败 → TPL fallback。Verify 禁止残留占位符。

---

## 上下文

| 层 | 字段 |
|----|------|
| 会话 | `metadata.portfolio_context` |
| 草稿 | `draft-meta.json` |
| 发布 | `report_index` |

---

## ECharts

固定 **2** 图（收益横条图 + 结构分布饼图）。详 Spec §6。

---

## Verify 摘要

→ Spec §9 · `portfolio_verify.yaml` · 含 **禁止「本章回答」** · compose 占位剥离

---

## Mock

| 文件 |
|------|
| `portfolio-analysis-report-sample-variant-a.md` |
