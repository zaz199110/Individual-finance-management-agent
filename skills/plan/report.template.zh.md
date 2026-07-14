---
skill_id: plan_report
report_type: plan
prd: requirement/prd/07-allocation-plan.md §7.4.1
spec: requirement/docs/samples/plan-allocation-report-spec.md
blueprint: requirement/docs/samples/plan-allocation-report-blueprint.md
sample: requirement/docs/samples/plan-allocation-report-sample.md
locale: zh
---

# 资产配置方案 · 模板与 Mock

> **用途**：`plan_report` → `report_draft`（`report_type=plan`）**模板填槽** + 少量 LLM（三句话/§三）；Verify 对照。  
> **标题**：`{场景}-资产配置方案-{YYYYMMDD}`（**RPT-PLAN-NAME-02**）  
> **须** 含 **` ```echarts `** 围栏（≥3 张图）。

**PRD** → `requirement/prd/07-allocation-plan.md` §7.2 · §7.4.1 · **PL-REPORT-EC**  
**五场景蓝图（定稿）** → `requirement/docs/samples/plan-allocation-report-blueprint.md`  
**实现说明（详文）** → `requirement/docs/samples/plan-allocation-report-spec.md`  
**完整 Mock（退休养老）** → `requirement/docs/samples/plan-allocation-report-sample.md`

### 与已跑通链路的关系（Skill 不改编解析规则）

| 层级 | 文件 | 职责 |
|------|------|------|
| **本 Skill** | `skills/plan/report.template.zh.md` | Agent **入口摘要**（骨架 + ECharts 要点） |
| **Blueprint** | `plan-allocation-report-blueprint.md` | 五 goal_type · 初筛/Hook/LLM/§六 **定稿** |
| **Spec** | `plan-allocation-report-spec.md` | 章节映射、Verify **详文** |
| **Sample** | `plan-allocation-report-sample.md` | 退休养老 **验收样例**（3 块 `echarts` · 正文无开发元数据） |
| **Preview 组件** | PRD §1.3.4 `ReportMarkdownPreview` | 产品内：`echarts` 围栏 → `JSON.parse` → `echarts.init` |

> 新增 Skill **仅集中索引**；围栏标识（`echarts`）、纯 JSON Option、全报告 ≥3 块等约定以 **spec + sample** 为准。

---

## 何时生成

| 触发 | 说明 |
|------|------|
| 第二步明细 **确认写库**（`plan_step=2` · `is_current=true`） | 生成 run 草稿 → Verify → **模式 B** → 用户 **确认发布** |
| **禁止** 第一步大类确认后直接出规划书 | 须两步结构化数据齐备 |

**输入快照**：`allocation_plans`（step=2）+ `web_citations`（≤5）+ 已确认大类/明细  
**禁止输入**：持仓；**禁止** vault 优先推荐（**PL-PLAN-KB-NO-PRIORITY-01**）

---

## 一级标题（`#` · 与 `report_name` 一致）

格式（§4.1.0d · RPT-NAME-01）：`{场景对客名}-投资规划-{YYYYMMDD}`

示例：`# 退休养老-投资规划-20260614`

**正文第一行必须是 `#` 标题**（**RPT-PLAN-CLEAN-01**）：**禁止** 文首写 Spec/PRD/Agent 说明、`goal_type`、读者标注等开发块；对客 md 与 sample **从标题直接开始**。

---

## 章节骨架（顺序固定 · P0 必含）

| 序 | 对客章节（`##`） | 必含 | 数据 / 备注 |
|----|------------------|------|-------------|
| — | **三句话读懂本方案** | ✅ | 全文摘要 · 不另表展开 |
| 一 | **个人信息** | ✅ | 从投资需求报告提取 · 姓名/年龄/家庭/职业/收入/资产/负债/结余 |
| 二 | **投资场景需求** | ✅ | 场景对客名 + 投资需求字段（投资期限/风险偏好/回撤/收益预期/动用时间/投入方式/定投期限/已有金额/每月再投入） |
| 三 | **大类资产配置** | ✅ + **≥1** 个 `echarts` | `target_allocation` + 大类比例/目标金额 |
| 四 | **配置基金** | ✅ + **≥1** 个 `echarts` | 基金名称 · 基金代码 · 资产类别（股票/债券/货币/其他） · 占组合比例 |
| 五 | **分批建仓计划** | ✅ | 加仓时间 · 基金中文简称 · 基金代码 · 拟定买入金额 + 建仓节奏原因（≤200字） |
| — | **温馨提示** | ✅ | 本报告由AI输出，仅供参考，请审慎投资。 |

**§一 个人信息字段（从投资需求报告提取）**：

| 字段 | 说明 |
|------|------|
| 姓名 | 用户姓名 |
| 年龄 | 用户年龄 |
| 家庭现状 | 婚姻/子女情况 |
| 职业 | 工作性质 |
| 税后年收入 | 年收入 |
| 每月税后到手 | 月收入 |
| 可投资金融资产 | 总可投资资产 |
| 贷款待还总额 | 负债总额 |
| 每月还贷 | 月供 |
| 每月固定生活开支 | 生活支出 |
| 每月可投资 | 月可投资金额 |

**§二 投资场景需求字段**：

| 字段 | 说明 |
|------|------|
| 风险偏好 | 如"稳健" |
| 投资期限 | 如"5年" |
| 一次性投入 | 如"100,000" |
| 每月投入 | 如"300" |
| 目标年化收益 | 如"5.5%" |
| 最大回撤承受 | 约"-20%" |
| 定投期限 | 如"12月" |

详文（Gather 分步、对客话术、深链 · **RPT-PREVIEW-LINK-01**）→ **spec §4.4–§4.5**

---

## 标题层级与自动编号（RPT-HEADING-NUM-01 · P0）

Preview 为 **`##`～`######`** 自动编号（最多五级）；**禁止** 在标题写「一、」「4.1 股票类」等手写序号。章内明细用 `###` / `####` 表达层级。

详文 → PRD §1.3.4.2 · `requirement/docs/samples/report-heading-numbers.css`

---

## 统一版式（RPT-FORMAT-01 · P0）

章间 `---` · 文末免责 · 详 [`report-format-spec.md`](../../requirement/docs/samples/report-format-spec.md)

---

## ECharts 规范（PL-REPORT-EC · P0）

| 所在章 | 最少块数 | 典型图 |
|--------|----------|--------|
| **三、大类资产配置** | **≥1** | 大类占比 **环图/饼图** |

- 全报告 **≥2** 块；语言标识 **`echarts`**；块内 **仅** Option JSON  
- **禁止** `function`、外链 PNG、`<img>`  

详文 → **spec §5** · 自检 → `preview-report.html` + `plan-allocation-report-sample.md`

---

## Verify 最低项（plan_report_verify · P0）

| # | 检查 |
|---|------|
| 1 | `#` 标题与 `report_name` 一致 |
| 2 | §一～§五 二级标题存在（个人信息/投资场景需求/大类资产配置/配置基金/分批建仓计划） |
| 3 | `target_allocation` 与正文一致；比例和 100%（±0.5%） |
| 4 | 每只基金含 **基金名称 + 基金代码 + 资产类别 + 占组合比例** |
| 5 | §五 含分批建仓表（加仓时间/基金中文简称/基金代码/拟定买入金额）+ 建仓节奏原因（≤200字） |
| 6 | **≥2** 个 `echarts` 块且 **JSON.parse 全通过** |
| 7 | §温馨提示 为固定句式「本报告由AI输出，仅供参考，请审慎投资。」 |
| 8 | **禁止** 非中国公募基金代码 |
| 9 | **禁止** 开发元数据块；`#` 为第一行（**RPT-PLAN-CLEAN-01**） |
| 10 | §一 含 `tab=profile` 深链 · `id` = `profile_report_id` |

详文 → **spec §8**

---

## 完整 Mock 示例 · `retirement`（退休养老）

见 **`requirement/docs/samples/plan-allocation-report-sample.md`**（可直接用于 Preview 验收）。
