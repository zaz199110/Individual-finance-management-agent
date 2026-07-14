---
skill_id: plan_allocation
scene: plan
prd: requirement/prd/07-allocation-plan.md §7.2–§7.8
verify: skills/plan/plan_verify.yaml
tasks: skills/plan/plan_workflow_tasks.zh.yaml
locale: zh
---

# 资产配置 · 两步方案 Skill

> **用途**：`scene_plan` 主工作流 — 读投资需求 → **第一步大类** → **第二步明细** → 触发 `plan_report` 草稿。  
> **权威 PRD** → `requirement/prd/07-allocation-plan.md`  
> **审视规则** → `skills/plan/plan_verify.yaml`（与 §7.3 Hook 表 **同源**）  
> **规划书排版** → `skills/plan/report.template.zh.md` · **五场景蓝图** → `requirement/docs/samples/plan-allocation-report-blueprint.md`

---

## 何时加载

| 触发 | 说明 |
|------|------|
| `conversation_type=plan` 且用户开始生成/修订方案 | Planner 选 `plan_allocation` |
| `plan.s1.wait` / `plan.s2.wait` 阻塞期间用户改方案 | 仍走本 Skill；**禁止** 误判为纯 `chat` |
| `plan.rpt.wait` | **不** 用本 Skill 改库数字 → 见 §7.8.2 · `report_overlay` |

---

## 前置条件

| 检查 | 失败时 |
|------|--------|
| **N ≥ 1** 完善投资需求（§6.0.1 · PH-PROFILE-ENC-01） | 占位引导 → **需求梳理** Tab |
| **N ≥ 2** | **须** 场景选择器选定 `goal_constraint_id`（PL-PLAN-PICK-GOAL-01） |
| — | — | 两步均基于投资需求 md 文本与 FUND_L0_REGISTRY 推理；无需外部 web_search |

---

## 输入绑定（PL-PLAN-STEP-INPUT-01）

| 步骤 | 允许输入 | 禁止 |
|------|----------|------|
| **第一步** | 《投资需求报告》**md 全文**（宏观/股债配置语境） | 基金知识库 · **基金代码** · 持仓 · 商品类 |
| **第二步** | 已确认 `target_allocation` + FUND_L0_REGISTRY 全市场候选池 + 同份 md（金额/分批/禁投/QDII 对齐） | vault **优先推荐** · Demo 6 只白名单 · 商品类 |

**选基机制**：`buildL0Candidates()` 直接从 FUND_L0_REGISTRY 构造全市场候选池；不再作为独立 pipeline 步骤，不依赖 web_search。

---

## 端到端流程

```text
prep.check → [pick_goal] → read_profile
  → s1: propose_allocation → validate(step=1) → 大类确认卡 → confirm(step=1)
  → s2: propose_detail → validate(step=2) → 明细确认卡 → confirm(step=2)
  → plan_report: report_draft → verify → 模式 B → plan.rpt.wait → report_publish
```

任务图节点 **逐字 label** → `plan_workflow_tasks.zh.yaml` · PRD §7.11.2。

---

## Command 编排

| 阶段 | Command | 类型 |
|------|---------|------|
| 准备 | `plan_read_profile_report` | 读 md |
| 准备 | `plan_read_constraint` | 读主表（Hook 用 · **不** 替代 md 送 LLM） |
| 第一步 | `plan_propose_allocation` | 提议 → `kind=plan_allocation` |
| 审视 | `plan_check_conflicts` · `plan_check_completeness` | `step: 1` |
| 写库 | `plan_confirm_allocation` | `plan_step=1` · `is_current=false` |
| 第二步 | `plan_screen_funds` | L0 全市场初筛 — 现由 `buildL0Candidates()` 内部调用 |
| 第二步 | `plan_propose_detail` | 提议 → `kind=plan_detail` |
| 写库 | `plan_confirm_detail` | `plan_step=2` · `is_current=true` |
| 规划书 | `report_draft` → `plan_report_verify` | 见 `report.template.zh.md` |

用户 `/` 侧统一：`plan_read` · `plan_propose` · `plan_confirm`（registry）。

**Propose payload 样例** → `requirement/docs/samples/plan-propose-payload.examples.json`

---

## 确认卡（对客）

| 步骤 | `kind` | Mock |
|------|--------|------|
| 大类 | `plan_allocation` | `skills/shared/confirm_card.mock.zh.md` §三 |
| 明细 | `plan_detail` | 同文件 §四（含首期/定投分基金摘要） |

**瘦卡片 + 全量落盘** → `propose_artifacts` + `artifact_read`（ARTIFACT-01）。

---

## 对话修订（PL-PLAN-DIALOG-01）

| 阻塞 | 用户意图 | Agent |
|------|----------|-------|
| `plan.s1.wait` | 改股债货比例 | 仅 `target_allocation` + `allocation_rationale` → 新大类卡 |
| `plan.s2.wait` | 换基 / 行业 / 分批 | 仅 `detailed_plan` + 执行字段 → 新明细卡 |
| `plan.rpt.wait` | 加段 / 改表述 | `report_overlay_patch` → merge（**不改库**） |
| `plan.rpt.wait` | 改基金/比例 | **回** `plan.s2` 或 `plan.s1`（§7.8.2） |

旧确认卡 → `superseded`；**无** inline 编辑。

---

## 行业 / 分批（摘要）

| 主题 | 规则 ID | 要点 |
|------|---------|------|
| 行业偏好 | PL-PLAN-PREF-S2-01 · §7.4.2 | **仅第二步**；未指定 → 卫星默认 A/B |
| 货币定投 | PL-PLAN-DEPLOY-01 · Hook D2 | 首期 100% · `dca_in_periodic=false` |
| 债基分批 | PL-PLAN-DEPLOY-BOND-01 · Hook D4 | 不写死 · `fund_deploy[].note` 须解释 |

详文 → PRD §7.4.2–§7.4.3 · `plan_verify.yaml` Hook2 **S1–S5 · D1–D4**。

---

## 审视闸门

Hook1 冲突 **须 = 0** → 否则输出「方案矛盾清单」→ 修订 → 重跑。  
Hook2 漏洞 **须 = 0** → 否则输出「缺项清单」→ 补齐 → 重跑。  
**禁止** Hook 未过就推确认卡。

实现：`src/harness/verify/plan.ts` 读取 `plan_verify.yaml`（编码仓 · 见 CODING §8）。

---

## 边界（禁止）

- ❌ 第一步出 **基金代码** 或 **商品类**（PL-PLAN-S1-NET-01）
- ❌ 跳过全市场候选池构造直接出明细（PL-PLAN-NET-BLOCK-01）  
- ❌ 从 vault 列表直接选基、跳过全市场初筛（Hook2 #4）  
- ❌ 读持仓或做偏离诊断（§8 职责）  
- ❌ `plan.rpt.wait` 用 overlay 偷偷改 `allocation_plans` 数字  
- ❌ 使用 `skills/plan/questionnaire.*`（§6 问卷副本 · **误放**；采集走 **需求梳理** Tab）

---

## 关联 Skill

| Skill | 职责 |
|-------|------|
| `plan_report` | 第二步写库后 → `report_draft` · Verify · 模式 B · 发布 |
| `profile_*` | 上游投资需求；无完善组则 **不可** 进入本 Skill |
