# 投资规划书 · 实现说明（Spec）

> **受众**：Cursor Agent、Skill 作者、前端 / Harness 研发  
> **对客样例**：[`plan-allocation-report-sample.md`](./plan-allocation-report-sample.md)（C 端投资者直接阅读 · 退休养老场景 · **3× `echarts`** · **无** 开发元数据块 · **信息不重复**）  
> **蓝图（定稿）**：[**plan-allocation-report-blueprint.md**](./plan-allocation-report-blueprint.md) · 五 **goal_type** · LLM 模板 · `plan_screen_funds` · §六 指数

---

## 1. 两份文档的分工

| 文件 | 给谁看 | 内容 |
|------|--------|------|
| **`skills/plan/report.template.zh.md`** | **Agent / Skill 运行时** | 章节骨架摘要、ECharts 要点、Verify 摘要（**首选入口**；详文见本文） |
| **sample** | **C 端投资者** | 友好话术、无 Hook / L0/L1 术语；Preview 即最终阅读体验 |
| **spec（本文）** | **Agent / 研发** | 章节映射、数据绑定、图表契约、生成流程、校验清单 |

**原则：** 写入 `data/runs/…/draft-report.md` 的正文 **必须** 采用 sample 的对客风格；用户 **确认发布** 后 `report_publish` 落盘 `data/reports/plan/{sanitized_report_name}.md` 并 INSERT `report_index`（§4.1.0 · RPT-PUB-01 · RPT-NAME-01）。技术字段写入 `report_index.metadata`，**不要** 在正文暴露 Hook 编号、`fund_code` 作段落标题、L0/L1/L2 等内部词。

**正文起点（RPT-PLAN-CLEAN-01 · P0）**：`#` 一级标题 **必须** 是第一行有效内容；其后接文首副标题（`*为您生成 · …*`）。**禁止** 在正文顶部写开发说明、Spec/Sample 链接、`goal_type`、Agent/PRD 引用、读者标注等 **任何** 非对客块——与 [`fund-analysis-report-sample.md`](./fund-analysis-report-sample.md) 一致，样例 md **从标题直接开始**。

**标题编号（RPT-HEADING-NUM-01 · P0）**：Preview 为 **`##`～`######`** 自动编号；正文标题 **禁止** 「一、」「4.1」等手写序号。→ PRD §1.3.4.2 · [`report-heading-numbers.css`](./report-heading-numbers.css)

**统一版式（RPT-FORMAT-01 · P0）**：章间 `---` · 文末系统免责 · Preview CSS → [`report-format-spec.md`](./report-format-spec.md) · [`report-format.css`](./report-format.css) · PRD §1.3.4.3

---

## 2. 何时生成

| 触发 | 说明 |
|------|------|
| 第二步明细 **确认写库**（`plan_step=2` · `is_current=true`） | 生成 run 草稿 → Verify → **模式 B** → 用户 **确认发布** |
| **禁止** 第一步大类确认后直接出规划书 | 须两步结构化数据齐备 |

**输入快照**：`allocation_plans`（step=2）+ `web_citations`（≤5 · 第二步公开资讯）+ 已确认大类/明细  
**禁止输入**：持仓；**禁止** 将 vault 当作推荐池（**PL-PLAN-KB-NO-PRIORITY-01**）

**Gather 分步（§7.1.3 · PL-PLAN-S1-NET-01）**

| 步骤 | 写入规划书章节 |
|------|----------------|
| **第一步**（md + **联网 ≤3** → Hook → rationale **润色一次**） | §二 大类 + `allocation_rationale`（**与您对齐** · **不进** §三） |
| **第二步**（联网 ≤5 + 全市场初筛 + KB 核验） | §三 **LLM 归纳** + §四 明细 + §五 执行 |
| **模板拼装** | 三句话（规则+润色）· §六 **PLAN-RISK-INDEX-01** |

规划书 md 在第二步 **仅** 作约束对齐（金额、分批、禁投）；**不** 用 md 摘要替代 Hook 结构化校验。

---

## 3. 一级标题与文首

格式（§4.1.0d · RPT-NAME-01）：

```text
{场景对客名}-资产配置方案-{YYYYMMDD}
```

示例：`# 退休养老-资产配置方案-20260614`

文首副标题（推荐）：

```markdown
*为您生成 · {生成日期}*  
*本方案针对 **「{场景对客名}」** 这一组投资目标 · 数据与公开资讯截至 **{as_of_date}***
```

---

## 4. 章节骨架与数据绑定（P0 必含）

| 序 | 对客章节（`##`） | 必含 | 数据 / 备注 |
|----|------------------|------|-------------|
| — | **三句话读懂本方案** | ✅ | 目标 · 大类 · 执行各一句（**不** 再展开成表） |
| 一 | **个人信息** | ✅ | 从投资需求报告提取 · 姓名/年龄/家庭/职业/收入/资产/负债/结余 |
| 二 | **投资场景需求** | ✅ | 场景对客名 + 投资需求字段（仅展示有值的字段） |
| 三 | **大类资产配置** | ✅ + **≥1** 个 `echarts` | 大类占比 **环图/饼图**（不展示表格） |
| 四 | **配置基金** | ✅ | 基金名称 · 基金代码 · 资产类别（股票/债券/货币/其他） · 占组合比例 |
| 五 | **分批建仓计划** | ✅ | 加仓时间 · 基金中文简称 · 基金代码 · 拟定买入金额 + 建仓节奏原因（≤200字） |

**规划书输出分工**

| 章节 | 内容来源 |
|------|----------|
| §一 | 从投资需求报告提取客户信息层 11 项 + **PH-PROFILE-ENC-01 对齐** 的 `profile_report_id` 深链 |
| §二 | 投资需求报告中的投资约束字段（风险偏好/投资期限/一次性投入/每月投入/目标年化收益/最大回撤承受/定投期限） |
| §三 | 第一步 `target_allocation` + 大类比例/目标金额 |
| §四 | 全市场初筛 + KB 核验后的 `detailed_plan`（基金名称/代码/资产类别/占组合比例） |
| §五 | `execution_schedule`（加仓时间/基金中文简称/基金代码/拟定买入金额）+ 建仓节奏原因（≤200字） |

**基金表格列头（对客）**：**基金名称** · **基金代码** · **资产类别** · **占组合**

---

## 4.6 §六 风险粗估（PLAN-RISK-INDEX-01 · P0）

> 详文 → [blueprint §6](./plan-allocation-report-blueprint.md#6-§六-风险粗估plan-risk-index-01)

| 项 | 规则 |
|----|------|
| **代理指数** | 股：沪深300 · 债：中证全债（AK 备用上证国债 `sh000012`）· 货：中证货币基金指数 / 固定锚点 |
| **窗口** | **3Y + 5Y** 各算 → 合成 **区间**（波动、回撤） |
| **瀑布** | 缓存 → Tushare `index_daily` → AK `stock_zh_index_daily` → 联网 → **仍无则「—」** |
| **LLM** | **可选** 润色说明列；**禁止** 改数字 |
| **免责** | 固定 TPL：**非**本方案基金组合回测 · **非**承诺 |

**Verify #12a**：有指数数据时 §六 数字 ≡ `deriveRiskMetricsFromIndices()`；无数据时 **不得** 出现虚构百分比。

## 4.4 绑定投资需求报告深链（RPT-LINK-01 · P0）

> 规划书 **第一步前提** 是已发布且对齐的投资需求报告（§7.1.2 · PH-PROFILE-ENC-01）。§一 **须** 给出可跳转链接，便于用户在「我的报告」核对约束来源。

| 项 | 规则 |
|----|------|
| **取哪一条** | 与当前 `goal_constraint_id` 绑定的 **PH-PROFILE-ENC-01 对齐** 行 → `report_index.id` + `report_name`（同 `plan_read_profile_report`） |
| **写入 `draft-meta.json`** | `profile_report_id` = 上述 uuid（plan 必填） |
| **正文写法** | Markdown 链接，**相对路径**（与 RPT-LINK-01 一致）： |

```markdown
**对应投资需求报告**：[{report_name}](/reports?tab=profile&id={profile_report_id})（点击可在「我的报告 · 投资需求」中打开）
```

| 样例 uuid | 仅 Mock 占位；Agent **禁止** 照抄，须用真实 `report_index.id` |
|-----------|----------------------------------------------------------------|

**Preview 可点性**：该链指向 **已发布** 报告 → 在 **待确认草稿 Preview** 中 **可点击**（见 §4.5 · **RPT-PREVIEW-LINK-01**）。

---

## 4.5 待确认草稿 Preview · 链接可点规则（RPT-PREVIEW-LINK-01 · P0）

> **适用**：四类报告 **模式 B** 主区 Preview（`pending_report_draft` · 尚无本稿 `report_index` 行）。  
> **组件**：`ReportMarkdownPreview` · prop `linkPolicy='draft'`（详 [§1.3.4](../prd/01-global-design.md)）。

| 链接类型 | 识别 | 草稿 Preview 行为 |
|----------|------|-------------------|
| **外部链接** | `http://` / `https://` | ✅ **可点击** · 新窗口打开 |
| **已发布报告深链** | `/reports?tab={profile\|plan\|portfolio\|fund}&id={uuid}` 且 `id` **存在**于 `report_index` | ✅ **可点击** · App 内跳转「我的报告」对应 Tab 并选中行 |
| **其它** | 未发布报告 id、错误 tab/id、指向本稿草稿、`file://`、仅 `#` 锚点以外的无效链 | ❌ **不可点击** · 渲染为普通文字（保留链接文案 · 无 hover 手型 · 主色不强调） |

**已发布 Preview**（「我的报告」列表 / 全屏 · `linkPolicy='published'`）：合法深链与外部链接 **均可点击**（RPT-LINK-01）。

**Agent 写稿**：§三「参考来源」中 **未核验的公开 URL** 可写为纯文本标题（样例做法）；若写 `https://…` 则按外部链接规则在草稿中可点。

---

## 5. ECharts 契约（PL-REPORT-EC · P0）

> **Preview 解析**：PRD [§1.3.4](../prd/01-global-design.md) · `ReportMarkdownPreview` — 围栏 **` ```echarts `** + Option JSON → `JSON.parse` → `echarts.init`（与基金解读同源）

| 所在章 | 最少块数 | 典型图 |
|--------|----------|--------|
| **三、大类资产配置** | **≥1** | 大类占比 **环图/饼图**（与 §三表 **同数** · 不另写一段重复解读） |

- 全报告 **至少 1** 个 `echarts` 块；**禁止** 为凑图数复制正文已有表格  
- 语言标识 **必须是** `echarts`；块内 **仅** 标准 Option JSON  
- **禁止** `function`、外链 PNG、`<img>`  
- 表格占比 **≡** 同章图表 `series.data`（±0.5% 容差）

**自检**：[`preview-report.html`](./preview-report.html) 选 `plan-allocation-report-sample.md` · 每块 `JSON.parse` 通过。

---

## 6. 对客话术与版式（PL-PLAN-VISUAL · P0）

- 用 **「您」**；金额 **千分位**；比例 **整数或一位小数**  
- **三句话** = 全文摘要；**方案速览** = 数字索引；**§一** = 约束明细 —— **三者不互相复述**  
- **表 OR 图** 二选一表达同一组数；§五 执行节奏 **仅用表**（首期/每期分基金表），**不** 另画累计投入折线  
- **禁止** 为版式堆叠：阅读指引+速览+§一 三处同一链接/回撤/再平衡；市场 **表+柱**；风险 **表+柱**；定投 **表+分组柱**  
- 图表配色：股票 `#22c55e` · 债券 `#3b82f6` · 货币 `#94a3b8`  
- **禁止**正文：PRD §、Hook、L0/L1；**禁止**文首开发元数据（**RPT-PLAN-CLEAN-01**）

---

## 7. Agent 须知（不对客）

| 项 | 规则 |
|----|------|
| **输入** | `allocation_plan_id`（step=2）+ `goal_constraint_id` + `profile_version_id` + **`profile_report_id`**（§4.4） |
| **性质** | **整理已确认方案** + 联网引用；**禁止** 在 publish 前擅自改比例/换基金 |
| **持仓** | **不读、不写** 与用户现有持仓的对照或调仓建议（§8 职责） |
| **Verify** | 本文 §8 · `plan_report_verify` |
| **发布** | 草稿 → 模式 B → RPT-CARD-01（`report_type=plan`）→ 用户确认发布 |
| **变更** | 大类变更 → 从第一步重来；仅明细/频率 → 第二步或新版本 |

**两步与规划书关系（PRD §7.4）**

1. **`allocation_plans` 结构化确认写库**（大类确认卡 + 明细确认卡）  
2. **规划书 md 快照**须 **再次确认发布**（§4.1.0 · RPT-PUB-01）  

合规：文案为「信息参考与教育性分析」；须重复 §0.7 短句。

---

## 8. Verify 最低项（plan_report_verify · P0）

| # | 检查 |
|---|------|
| 1 | `#` 标题与 `report_name` 一致 |
| 2 | §一～§五 **二级标题字面存在**（个人信息/投资场景需求/大类资产配置/配置基金/分批建仓计划） |
| 3 | `target_allocation` 大类与正文表一致；比例和 100%（±0.5%） |
| 4 | 每只基金含 **基金名称 + 基金代码 + 资产类别 + 占组合比例** |
| 5 | §五 含分批建仓表（加仓时间/基金中文简称/基金代码/拟定买入金额）+ 建仓节奏原因（≤200字） |
| 6 | **≥1** 个 `echarts` 块且 **JSON.parse 全通过** |
| 7 | §温馨提示 为固定句式「本报告由AI输出，仅供参考，请审慎投资。」 |
| 8 | **禁止** 出现非中国公募基金代码 |
| 9 | **禁止** 正文含开发元数据（Spec 链接、PRD §、Agent 入口、`goal_type` 等 · **RPT-PLAN-CLEAN-01**）；`#` 须为第一行 |
| 10 | §一 含 **绑定投资需求报告** 深链：`tab=profile` · `id` = `profile_report_id` · 链文案 = 对应 `report_name` |
| 11 | **overlay 块**（若有）：**不要求** 进 §4 模板表；正文 **不得** 与 `allocation_plans` **数字/代码矛盾**（RPT-CHAT-ROUTE-01 · §4.1.0h） |
| 12 | **RPT-FORMAT-01**：各正文 `##` 章间 `---` · 文末系统免责 |

**合并**：`report_draft` 产出模板 body 后 → **`merge_report_overlay`** → 再 Verify / 模式 B（overlay 重生 **须 re-merge**）。

**Hook2 关联（PRD §7.3）**：规划书必填章节无法生成 → Hook2 #9 checklist 未过。

---

## 9. 生成流程（摘要）

> 详文 → PRD [§7.2](../prd/07-allocation-plan.md#72-端到端流程联网--两步确认--审视闸门)

```mermaid
flowchart LR
  S2[第二步写库 plan_step=2] --> Draft[plan_report / report_draft]
  Draft --> Merge[merge_report_overlay]
  Merge --> Verify[plan_report_verify]
  Verify --> ModeB[模式 B Preview]
  ModeB --> Pub[report_publish → report_index]
```

| 步 | Command / Skill | 产出 |
|----|-----------------|------|
| 1 | `plan_confirm_detail` 后触发 `plan_report` | `data/runs/…/draft-report.md` |
| 2 | `plan_report_verify` | 阻断非法草稿 |
| 3 | 模式 B + 规划书确认卡 | 用户 Preview |
| 4 | `report_publish` | `data/reports/plan/` + `report_index` |

---

## 10. 路径索引

| 资产 | 路径 |
|------|------|
| Agent 模板入口 | `skills/plan/report.template.zh.md` |
| **五场景蓝图** | `requirement/docs/samples/plan-allocation-report-blueprint.md` |
| 对客 Mock | `requirement/docs/samples/plan-allocation-report-sample.md` |
| 实现说明 | `requirement/docs/samples/plan-allocation-report-spec.md`（本文） |
| Verify 实现 | `src/harness/verify/plan.ts` |
| PRD 模块 | `requirement/prd/07-allocation-plan.md` |
