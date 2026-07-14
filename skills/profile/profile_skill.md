---
skill_id: profile_intake
scene: profile
prd: requirement/prd/06-profile.md §6.1–§6.6
verify: skills/profile/profile_verify.yaml
tasks: skills/profile/profile_workflow_tasks.zh.yaml
locale: zh
---

# 需求梳理 · 客户信息与投资需求编排 Skill

> **用途**：`scene_profile` — **客户信息**采集 → **投资需求**（五场景可多组）→ 触发 `profile_report` 草稿。  
> **权威 PRD** → `requirement/prd/06-profile.md`  
> **审视规则** → `skills/profile/profile_verify.yaml`  
> **报告排版** → `skills/profile/report.template.zh.md`（**本 Skill 不重复**章节细则）

---

## 何时加载

| 触发 | 说明 |
|------|------|
| `conversation_type=profile` · 新用户 / 加场景 / 改客户信息 | Planner 选 `profile_intake` 或 `goal_constraint_intake` |
| `profile.basic.wait` / `profile.goal.wait` | 用户改事实 → 重 `profile_propose` / 问卷 |
| `profile.rpt.wait` | **不** 用本 Skill 改库事实 → overlay 或回 A/B 段（RPT-CHAT-ROUTE-01） |
| §6.0.2 续接报告 | 用户 **发话** 开跑 · **禁止** silent `report_draft`（RPT-PROFILE-05） |

---

## 前置与完善定义

| 概念 | 规则 |
|------|------|
| **完善（N）** | 单组须：约束已确认 + 已发布 profile 报告且 `profile_version_id` + `goal_constraint_revision_id` 与当前对齐（PH-PROFILE-ENC-01） |
| **待续接（M）** | 约束已确认但报告未发布或未对齐 |
| **下游 §7** | 仅 **N** 组可作方案输入 |
| **下游 §8** | 只读客户信息层；对照方案另绑完善组 |

---

## 端到端流程

```text
[A 客户信息] basic.form → verify → 客户信息确认卡 → basic.wait → profile_confirm
[B 投资需求] goal.pick → goal.form → verify → 约束确认卡 → goal.wait → goal_constraint_confirm
[C 报告] report_draft → profile_report_verify → 模式 B → profile.rpt.wait → report_publish
  → 下一组？ / 引导资产配置 Tab（须本组完善）
```

任务图 **label 逐字** → `profile_workflow_tasks.zh.yaml` · PRD §6.15.2。

---

## 问卷与 Skill 路径

| 段 | 问卷 | 路径 |
|----|------|------|
| 客户信息 | Q-BASE | `skills/profile/questionnaire.base.zh.md` · 增量 `questionnaire.base.delta.zh.md` |
| 选场景 | Q-GOAL-PICK | `skills/profile/questionnaire.goal.pick.zh.md` |
| 五场景 | Q-GOAL-* | `skills/plan/questionnaire.goal.*.zh.md`（**误放副本** · **以 PRD §6.2.2 表为准**） |

---

## Command 编排

| 阶段 | Command（Harness 内部） | 用户 `/` | 类型 |
|------|-------------------------|----------|------|
| 读摘要 | `profile_read` | ✅ | 读 · 返回 N/M · `eligible_groups` |
| 客户信息 parse | `profile_parse` | — | 内部 |
| 客户信息审视 | `profile_check_conflicts` · `profile_check_completeness` | — | 内部 Hook |
| 客户信息提议 | `profile_propose` | ✅ | 提议 · `kind=profile_basic` |
| 客户信息写库 | `profile_confirm` / `profile_confirm_write` | ✅ | 写 |
| 约束 parse | `goal_constraint_parse` | — | 内部 |
| 约束审视 | `goal_constraint_check_conflicts` · `goal_constraint_check_completeness` | — | 内部 Hook |
| 约束提议 | `profile_propose`（`kind=goal_constraint`） | ✅ | 提议 |
| 约束写库 | `profile_confirm` / `goal_constraint_confirm_write` | ✅ | 写 · **同事务** INSERT 修订 + UPDATE 主表 |
| 报告 | `report_draft`（`report_type=profile`） | ✅ | 提议 |
| 报告校验 | `profile_report_verify` | — | 内部 |
| 发布 | `report_publish` | ✅ | 写 · 绑 `goal_constraint_revision_id` |

**Propose 样例** → `requirement/docs/samples/profile-propose-payload.examples.json`

---

## 确认卡（对客）

| 卡 | `card_kind` | Mock |
|----|-------------|------|
| 客户信息 | `profile_basic` | `skills/shared/confirm_card.mock.zh.md` §一 |
| 投资需求 | `goal_constraint` | 同文件 §二 |

按钮：**确认** / **放弃，暂不保存** / **保持上一版**（PH-PROFILE-UNDO-01）。

---

## 写库要点（PH-PROFILE-GV-02 · PH-PROFILE-PV-01）

| 操作 | 行为 |
|------|------|
| 客户信息 confirm | 新 `profile_versions` · `is_current=true`；旧版 `false` |
| §6.4 改客户信息 | 批量 **UPDATE** 所有 `is_active=true` 约束的 `profile_version_id` |
| 约束 confirm | **先** `INSERT goal_constraint_revisions` · **再** `UPDATE` 主表 · `goal_constraint_id` **不变** |
| 报告 publish | `report_index` 写入 **`goal_constraint_revision_id`** = 草稿时最新修订 id |

---

## 报告队列（PH-PROFILE-RPT-Q-01）

多组待发布时：`pending_profile_report_queue` · 逐组 `report_draft` → 模式 B → 发布卡。  
一级阶段条 label 追加 **「（第 i/K 份）」**。

---

## 对话修订（RPT-CHAT-ROUTE-01）

| 阻塞 | 用户意图 | 路径 |
|------|----------|------|
| `profile.rpt.wait` | 改措辞 | `report_overlay_patch` → merge |
| `profile.rpt.wait` | 改客户信息/约束事实 | 回 A/B 段 → 新确认卡 → **重跑** `report_draft` |
| 任意 | 改方案/持仓/基金 | Handoff 跳转卡 |

---

## 审视闸门

Hook1 矛盾 **须 = 0** → 否则「矛盾清单」→ 修订 → 重跑。  
Hook2 缺项 **须 = 0** → 否则「缺项清单」→ 补齐 → 重跑。  
跨组加总 **须通过**（静默通过不对客解释规则）。  
**禁止** 审视未过就推确认卡。

实现：`src/harness/verify/profile.ts` 读取 `profile_verify.yaml`（编码仓 · CODING §8）。

---

## 边界（禁止）

- ❌ silent 自动 `report_draft`（RPT-PROFILE-05）  
- ❌ 约束 confirm 只改主表不留 `goal_constraint_revisions`  
- ❌ 从报告 md 反解析还原约束（UNDO-02 须读修订表）  
- ❌ 阶段条出现「客户信息层」「约束层」等内部词  
- ❌ 未完善组计入 §7 Gather 的 N  

---

## 关联 Skill

| Skill | 路径 | 职责 |
|-------|------|------|
| `goal_constraint_intake` | 本文件 §B 段 | 五场景问卷 → 约束确认卡 |
| `profile_report` | `skills/profile/report.template.zh.md` | `report_draft` · Verify · 模式 B · 发布 |
