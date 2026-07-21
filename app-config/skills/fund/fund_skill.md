---
skill_id: fund_full_report
scene: fund
prd: requirement/prd/09-fund-analysis.md §9.1–§9.1.10
verify: requirement/docs/samples/fund-analysis-report-spec.md §7
tasks: skills/fund/fund_workflow_tasks.zh.yaml
locale: zh
---

# 基金解读 · 简答与完整报告编排 Skill

> **用途**：`scene_fund` — **简答**（`fund_qa`）或 **完整解读报告**（`fund_full_report`）。  
> **权威 PRD** → `requirement/prd/09-fund-analysis.md`  
> **报告排版** → `skills/fund/report.template.zh.md` · **实现 Spec** → `fund-analysis-report-spec.md`

---

## 何时加载

| 触发 | Skill id | 说明 |
|------|----------|------|
| 基金 Tab 口语问答、未要求报告 | `fund_qa` | 两节点 · 无草稿 |
| 用户要「解读报告」/ 自选 AI 解析 | `fund_full_report` | 完整任务图 §9.1.10.3 |
| `fund.rpt.wait` | `fund_full_report` | overlay 或回 gather · **不** silent 改 L0 数字 |

---

## 前置条件

| 检查 | 失败时 |
|------|--------|
| `fund_lookup` 命中 | 对客「未找到该基金」 |
| L0 不可用 | 可识别字段 + 加强 L3；L1 数字仍以 vault 为准 |

---

## 端到端流程（完整报告）

```text
prep.intent → prep.lookup → [prep.enrich] → [clarify blocked] → gather(L0 ∥ L1)
  → rpt.draft.compose → rpt.draft.verify → 模式 B → [overwrite blocked] → rpt.wait → report_publish
```

`prep.enrich`（FK-ENRICH-01）：无 vault 或披露未覆盖近 12 个月时，seed 同步 ∥ 联网摘要 → FTS 索引；成功则后续走 L1 + FK-CITE。

简答：`fund.qa.understand` → `fund.qa.answer`（按需 L0/L1/联网）。

任务图 **label 逐字** → `fund_workflow_tasks.zh.yaml` · PRD §9.1.10。

---

## Command 编排

| 阶段 | Command | `/` 可见 | 类型 |
|------|---------|----------|------|
| 档案 | `fund_lookup` | ✅ | 读 · `report_archetype` |
| 披露 | `fund_knowledge_explore` | ✅ | 读 L1 |
| 语义 FAQ | `fund_knowledge_semantic_search` | ✅ | 读 |
| 联网 | `web_search` | ✅ | 读 L3 · ≤5 |
| 识图 | `vision_parse` | ✅ | 读 |
| 草稿 | `report_draft`（`report_type=fund`） | ✅ | 提议 |
| 校验 | `fund_report_verify` | ✅ | 读 · FK-18 |
| 发布 | `report_publish` | ✅ | 写 · `report_slug` |

**draft-meta.json** 须存：`fund_code` · `as_of_trade_date` · `report_archetype`。

---

## 资料瀑布（KB-03）

1. **L0** `fund_lookup` — 行情、持仓、类型  
2. **L1** `fund_knowledge_explore` — 披露块（FK-CITE）  
3. **L2/L3** Harness 在 `fund.gather.l1` 内触发语义检索 / `web_search`

---

## 确认与阻塞

| 节点 | 说明 |
|------|------|
| `fund.prep.clarify` | 仅代码无「报告」话术 · **blocked** |
| `fund.rpt.overwrite` | 已有草稿须用户确认覆盖（RPT-DRAFT-01） |
| `fund.rpt.wait` | 报告确认发布卡（RPT-CARD-01） |

发布卡后助手：**已保存至「我的报告 · 基金解读」**。

---

## 对话修订（RPT-REV-01）

| 阻塞 | 用户意图 | 路径 |
|------|----------|------|
| `fund.rpt.wait` | 改表述 | `report_overlay_patch` → merge |
| `fund.rpt.wait` | 换基 / 重解读 | 回 `fund.prep.lookup` 或 `fund.gather` |
| 仅改某章 | 用户指明 | 从 `fund.rpt.draft.compose` 重入 |

---

## Verify 闸门

`fund_report_verify` + spec §7（含每块 `echarts` JSON 合法 · archetype 章节映射）。  
**禁止** Verify 未过进入模式 B。

实现：编码仓 Harness · spec 为权威清单。

---

## 边界（禁止）

- ❌ 阶段条「客户画像」「投资画像」「约束」等内部词  
- ❌ 未确认发布即写 `report_index`  
- ❌ 简答路径 silent 出完整报告草稿  
- ❌ 知识库运维 Command 混入投资者对话 `/` 补全  

---

## 关联 Skill

| Skill id | 职责 |
|----------|------|
| `fund_qa` | 简答两节点 · 本文件 §简答 |
| `fund_full_report` | 完整报告 · 本文件 |

知识库入库 / 索引 → fund Tab **运维** CLI（`fund-knowledge.*`）· 非本 Skill。
