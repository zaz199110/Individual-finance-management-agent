# 投资需求报告 · 编写规格（Agent / 研发）

> **受众**：Cursor Agent、Skill 作者、前端 / Harness 研发  
> **对客样例**：[`profile-investment-requirements-report-sample.md`](./profile-investment-requirements-report-sample.md)（**财富增值** · 开篇三块 + 七章 · **1× `echarts`** · **无** 开发元数据块）  
> **产品规格**：PRD [§6.2.8 RPT-PROFILE-TPL](../prd/06-profile.md#628-写库--投资需求报告草稿--确认发布rpt-profile-b--p0-必做)

---

## 1. 两份文档的分工

| 文件 | 读者 | 用途 |
|------|------|------|
| **`skills/profile/report.template.zh.md`** | Agent / Skill 运行时 | 章节骨架、五场景字段、图表触发条件、Verify 摘要 |
| **sample** | **C 端投资者** | 友好话术、图文并茂；Preview 即最终阅读体验 |
| **spec（本文）** | Agent / 研发 | 章节映射、数据绑定、**可选图表契约**、校验清单 |

**原则：** 写入 `data/runs/…/draft-report.md` 的正文 **必须** 采用 sample 的对客风格；用户 **确认发布** 后落盘 `data/reports/profile/` 并 INSERT `report_index`。**禁止** 在正文暴露 Hook 编号、库表名、`goal_constraint_id` 等内部词。

---

## 2. 与其它三类报告的差异

| 维度 | 投资需求 | 规划书 / 基金 / 持仓 |
|------|----------|----------------------|
| **定位** | 确认事实整理 + 需求理解 | 配置建议 / 产品解读 / 持仓测算 |
| **图表** | **可选**（0～2 张，按数据触发） | **必含**（规划 ≥3 · 基金 ≥6 · 持仓变体 A ≥3） |
| **禁止** | 大类比例、基金代码、市场观点 | — |

> **PROFILE-VISUAL-01**：投资需求 **不** 为凑版式硬画图。图只用在 **表不好一眼看懂** 的结构关系上（月度钱去哪、目标时间线等）。

---

## 3. 章节映射（RPT-PROFILE-TPL）

| 序 | `##` 标题 | 写什么 | 推荐图表 |
|----|-----------|--------|----------|
| 开篇 | **阅读指引** | 4 行内表格；**有图时** 增加一行「图表在哪」 | — |
| 开篇 | **三句话读懂本组需求** | blockquote 3 条 · **规则草稿 + 相对数据 + 少量 LLM 润色**（§3.1） | — |
| 开篇 | **需求速览** | 本组目标 + 约束 + 资金一表 | —（**禁止** 与速览表重复画饼） |
| 1 | **报告说明** | 1～2 句 | — |
| 2 | **基本情况** | 客户信息层 **11 项** 全量 | **可选 1**：月度资金去向（见 §5） |
| 3 | **本组投资目标** | 该场景 `goal_detail` 全部字段 | **可选 1**：目标时间线（见 §5） |
| 4 | **本组投资偏好与边界** | `investment_constraints` | —（表已足够） |
| 5 | **本组资金安排** | 已有金额 + 月投入 | — |
| 6 | **对您需求的理解** | ≥3 条综合解读 | — |
| 7 | **合规与说明** | §0.7 短版 | — |

---

## 3.1 三句话 · 规则 + 相对数据 + 少量 LLM（PROFILE-THREE-SENT-01 · P0 · 已拍板）

> **决项**：三句话 **不走纯 LLM 自由发挥**；先用 **统一规则** 拼骨架并注入 **相对数据**，再 **一次短 LLM** 只做白话润色。  
> **需求速览** 仍为 **100% 确定性** 填表（见 §3 表 · 不经过 LLM）。

### 流水线

```
DB 槽位 → buildProfileReportMarkdown()（模板 + 槽位 + 规则草稿）
       → refineProfileDraftReport()（可选 LLM 润色三句话 + §6）
       → profile_report_verify
```

| 步 | 做什么 | LLM |
|----|--------|-----|
| 1 | 读 `basic_info` + 本组 `goal_detail` / `investment_constraints` / 金额 | 否 |
| 2 | `deriveRelativeMetrics` 计算 **相对指标**（见下表） | 否 |
| 3 | `buildProfileReportMarkdown`：开篇三块 + 七章 **模板直出**；三句话 / §6 **规则草稿** | 否 |
| 4 | `refineProfileDraftReport`：润色 **三句话 + 对您需求的理解**；**禁止** 增删维度、改数字、荐基 | **是（仅这两块）** |

LLM 不可用时：**规则草稿直接落稿**（与基金 `reviewAndRefineFundDraft` skip 同理）。

### LLM 对客质检（PROFILE-LLM-QA-01 · P0）

与基金解读 **compose 审视** 对齐：仅 **三句话** 与 **§6 对您需求的理解** 经 LLM；落稿前须过 **规则质检**，可选 **LLM 审视 JSON** 后再润色一轮。

```
规则草稿 → LLM 润色 → pickAcceptedLlmSection（不合格回退规则稿）
         → LLM 审视 JSON（needs_fix）→ 带 issues 重润色
         → validateProfileLlmSections → Verify
```

| 检查 | 三句话 | §6 理解 |
|------|--------|---------|
| 格式 | blockquote + ①②③ | **1. 2. 3.** 编号 ≥3 条 |
| C 端 | 无内部词 / fund_code / Tab | 无荐基 / 大类比例 / 整表 |
| 简洁 | 单条 ≤2 行（warn >320 字） | 单条 warn >520 字 |

实现 → `src/lib/profile/report-llm-quality.ts` · `report-refine.ts` · `profile_report_verify.ts`

### ①②③ 固定维度（字面标签不变）

| 条 | 维度 | 规则草稿须含 |
|----|------|--------------|
| **① 资金性质** | 本组在整体财务里的角色 | `{场景对客名}` + `goal_detail` 要点 + **≥1 条相对数据**（见下） |
| **② 风险偏好** | 边界是否自洽 | `{risk_tolerance}` + `{max_drawdown}` + `{expected_return}` + **自洽标签**（见下） |
| **③ 执行节奏** | 钱从哪来、怎么投 | `{deploy_mode}` + 本组金额 + **月投/可投或本金/金融资产占比**（有才算） |

**防重复**：三句话 **定性 + 少量关键数**；完整数字表在 **需求速览** 与 §2–§5。**禁止** 复读 11 项客户信息层。

### 相对数据（deriveRelativeMetrics · 有才算 · 禁止虚构）

| 键 | 计算 | 用于 |
|----|------|------|
| `principal_pct_of_assets` | `principal_amount / financial_assets` | ① 或 ③ · 「约占可投资金融资产 **X%**」 |
| `monthly_pct_of_investable` | `monthly_amount / monthly_investable`（分母 >0） | ③ · 「月投约占月可投 **X%**」 |
| `months_to_full_deploy` | 仅当 `deploy_mode` 含定投且 `monthly_amount>0`：粗算再投月数 | ③ · 「约 **N 个月** 投完本组计划」 |
| `years_to_goal` | 退休：`retirement_age - age`；教育：`target_year - 今年`；买房/婚育：`purchase_timeline` / `timeline` 解析 | ① · 「距目标约 **N 年**」 |
| `debt_payment_ratio` | `monthly_loan_payment / monthly_income_after_tax` | ① 可选 · 「还贷占月到手 **X%**」 |
| `surplus_after_group` | `monthly_income - expense - loan - monthly_amount` | ③ 可选 · 「本组外月结余约 **X 元**」 |
| `risk_coherence` | 规则：`risk_tolerance` × `max_drawdown` × `expected_return` 三档对照（见模板） | ② · 「三者 **大致匹配** / **偏进取需留意** / **偏保守**」 |

每条三句话 **至少引用 1 条** 相对数据（三条合计 ≥3 条引用；同键可复用）。

### LLM 润色契约（refineProfileDraftReport）

**输入**：规则草稿三句 + `relative_metrics` JSON + 禁止清单  
**输出**：仍 **blockquote 3 条**，保留 **① ② ③** 前缀；每条 ≤2 行  

**允许**：语序调整、连接词、把占比改写成更口语的「大半 / 约三分之一」  
**禁止**：新增事实、改数字、出现 `fund_code` / 大类比例 / 买卖 / 市场观点、删掉相对数据要点  

**Verify 追加（三句话）**：

- 含 **① ② ③** 三条 blockquote
- 至少 **2 处** 可识别的相对表述（占比、年数、月数、自洽标签等）
- 数字与 `basic_info` / 本组金额 **一致**（容许 ±1% 四舍五入口语）

---

## 4. 数据绑定

| 章节 | 数据来源 |
|------|----------|
| §2 | `profile_versions.basic_info`（当前 `is_current`） |
| §3 | 本行 `goal_detail` |
| §4 | 本行 `investment_constraints` |
| §5 金额 | `principal_amount` · `monthly_amount` |
| 图表 | **仅** 用上表已确认数字；**禁止** 虚构未采集字段 |

---

## 5. 图表契约（PROFILE-EC-01 · PROFILE-VISUAL-01 · P0）

### 5.1 总则

| 规则 | 说明 |
|------|------|
| **数量** | 全报告 **0～2** 个 ` ```echarts ` 块；**无触发条件则不画** |
| **语言标识** | `echarts`；块内 **仅** Option JSON · **禁止** `function`、外链 PNG、`<img>` |
| **读图句** | 每图 **前** 1 句白话：告诉读者 **看什么、数字口径** |
| **表图分工** | 与规划书一致：**表 OR 图** 表达同一组数；**禁止** 对 §5 金额表重复画累积折线图 |
| **配色** | 支出/中性 `#94a3b8` · 本组相关 `#22c55e` · 收入/结余 `#3b82f6` · 其它 `#cbd5e1` |

### 5.2 触发条件（满足才画 · 不满足整类跳过）

| 图 | 建议位置 | 类型 | 触发条件 | 数据 |
|----|----------|------|----------|------|
| **月度资金去向** | §2 · `### 结余` 之后 | 环形 `pie` 或横向堆叠 `bar` | `每月税后到手` 可分解为 **≥2 项** 去向（生活开支、还贷、本组月投、其它等）且加总 **可对上** | 各项金额（元） |
| **目标时间线** | §3 | `bar`（时间轴类目）或 **省略**（Mermaid 二期） | `goal_type` 为 `retirement` / `education` / `housing` / `marriage_child`，且有 **可量化年份或年限** | 当前年龄/年份 → 目标年 |

**明确不画：**

- **需求速览** 已有完整约束表 → **不再** 画风险雷达、回撤仪表（留给规划书 / 基金报告）
- 仅 1～2 个数字、无时间维度 → **保持表格**
- 为凑「图文并茂」复制 §4 偏好表做柱图

### 5.3 样例图位（财富增值 · sample）

1. §2：**每月税后到手怎么分**（生活 12,000 · 本组 2,000 · 其他 12,000）

---

## 6. 对客版式（RPT-FORMAT-01）

- 章间 `---` · 文末系统免责  
- §2 可用 `###` 分组（身份与家庭 / 收入 / 资产与负债 / 结余）  
- 详文 → [`report-format-spec.md`](./report-format-spec.md)

---

## 7. Verify 最低项（profile_report_verify · P0）

| # | 检查 |
|---|------|
| 1 | 开篇 **阅读指引 + 三句话 + 需求速览** 齐全 |
| 2 | 7 个正文 `##` 章节标题与 PRD §6.2.8 表一致 |
| 3 | §2 覆盖客户信息层 **11 项** |
| 4 | §3 覆盖该 `goal_type` 全部 `goal_detail` 项 |
| 5 | §4 覆盖 `investment_constraints` 必填键 |
| 6 | §5 含本组已有金额、月投入 |
| 7 | §6 **对您需求的理解** ≥3 条 · 不复读整表 · 无 Tab/流程指引 |
| 8 | §7 含 §0.7 合规短句 |
| 9 | **无** 市场观点、`fund_code`、大类比例、其他目标专章 |
| 10 | **图表**：若有 `echarts` 块则 **JSON.parse 全通过** · 数量 **≤2** · 每图前有读图句 · 数字与正文 **一致** |
| 11 | **RPT-FORMAT-01**：章间 `---` · 文末免责 |
| 12 | **PROFILE-LLM-QA-01**：**三句话 + §6**（LLM 块）格式清晰 · C 端友好 · 简洁；`validateProfileLlmSections` **errors 为空** |

> **无图也通过 Verify**：#10 在 **0 图** 时自动满足。  
> **#12 仅验 LLM 块**：§2–§5 槽位不经 LLM，由 #3–#6 覆盖。

---

## 8. 文件索引

| 文件 | 用途 |
|------|------|
| [profile-investment-requirements-report-sample.md](./profile-investment-requirements-report-sample.md) | 对客验收样例 |
| [skills/profile/report.template.zh.md](../../../skills/profile/report.template.zh.md) | Skill 模板与 Mock |
| [report-format-spec.md](./report-format-spec.md) | 四类共用版式 |
| PRD [06-profile.md §6.2.8](../prd/06-profile.md) | 产品专规 |

## 9. 实现状态（2026-06-22）

| 项 | 状态 | 代码 |
|----|------|------|
| 模板 + 槽位拼装（§2–§5、开篇三块） | ✅ | `src/lib/profile/report-blueprint.ts` |
| 相对指标 + 三句话规则草稿 | ✅ | `deriveRelativeMetrics` · `buildThreeSentencesDraft` |
| §6 规则草稿 | ✅ | `buildUnderstandingDraft` |
| LLM 润色 + QA 回退 | ✅ | `report-refine.ts` · `report-llm-quality.ts` |
| 可选 echarts（0～2） | ✅ | `buildMonthlyCashflowChart` · `buildGoalTimelineChart` |
| Verify | ✅ | `profile_report_verify.ts` · **`draftProfileReport` 内自动调用**，失败阻断发布卡 |
| 进度条 `profile.rpt.draft`（一级） | ✅ | 撰写与校验内联于 `report_draft` · `profile_workflow_tasks.zh.yaml` |
| 发布 `report_name` 与草稿 `#` 标题一致 | ✅ | `draft-meta.json` · `report-publish.ts` 读 meta |
