---
skill_id: fund_full_report
report_type: fund
intent: fund_full_report
prd: requirement/prd/09-fund-analysis.md §9.1.1
spec: requirement/docs/samples/fund-analysis-report-spec.md
sample: requirement/docs/samples/fund-analysis-report-sample.md
locale: zh
---

# 基金解读报告 · 模板与 Agent 参考

> **用途**：`fund_full_report` → `report_draft`（`report_type=fund`）排版、Gather 与 Verify 对照。  
> **不是**：`fund_qa` 单点简答（简答 **不出** 本模板、不写 `draft-report.md`）。  
> **不是**：对客预存报告——用户看到的正文 **必须** 由 **AI 解析 / 出具解读** 触发后实时生成（`data/runs/.../draft-report.md`）。本 Skill 与 `*-sample.md` **仅** 供 Agent / 验收参考。  
> **与投资需求报告/规划书差异**：基金解读 **必须** 含 **` ```echarts `** 围栏；Preview 靠前端 **解析 JSON Option** 渲染。

**PRD** → `requirement/prd/09-fund-analysis.md` §9.1.1 · §9.1.1b · **FK-18-EC**  
**Preview 渲染管线** → `requirement/prd/01-global-design.md` §1.3.2 · §1.3.4（`ReportMarkdownPreview`）  
**ECharts 实现契约** → `requirement/docs/samples/fund-analysis-report-spec.md` §6  
**完整参考样例（019305 · 非预置对客报告）**→ `requirement/docs/samples/fund-analysis-report-sample.md`  
**六类型填空蓝图（审阅版 · 每图用途 + 槽位 + 固定块数）**→ [`fund-report-blueprints-A-F.md`](../../requirement/docs/samples/fund-report-blueprints-A-F.md)  
**单图冒烟** → `requirement/docs/samples/echarts-smoke-test.md` · `echarts-smoke.json`

### 与已跑通链路的关系（Skill 不改编解析规则）

| 层级 | 文件 | 职责 |
|------|------|------|
| **本 Skill** | `skills/fund/report.template.zh.md` | Agent **入口摘要**（骨架 + archetype + ECharts 要点） |
| **Spec §6** | `fund-analysis-report-spec.md` | ECharts 契约、图表清单、Verify **详文** |
| **Sample** | `fund-analysis-report-sample.md` | 019305 **Agent/Verify 参考样例**（**非**运行时默认正文） |
| **Preview 组件** | PRD §1.3.4 `ReportMarkdownPreview` | 产品内：`echarts` 围栏 → `JSON.parse` → `echarts.init` |
| **开发冒烟** | `preview-report.html` + `echarts-smoke-test.md` | 需求仓自检（与组件 **同源** 渲染逻辑） |

> 新增 Skill **以 [`fund-report-blueprints-A-F.md`](../../requirement/docs/samples/fund-report-blueprints-A-F.md) 为唯一口径**；**不限制**全报告 ECharts 总块数，**各章有数据才出、无则省略**。

---

## 各章图表（有数据才出 · 不凑假数）

| 章 | 对客名称 | 条件 |
|----|----------|------|
| 第一章 | 大类资产饼 | L1 季报「资产组合」或 AKShare 资产比例 |
| 第一章 | 前十重仓横条 | L0 live 前十非空 |
| 第四章 | 费率柱 | 解析费率至少一项 |

**本期不做**：业绩对比图、雷达、回撤走势、持有人结构、分红表、行业配置。

---

## LLM 导语（compose · `fund.rpt.draft.compose`）

| 块 | 字数 | 输入 |
|----|------|------|
| 三句话 ①②③ | 每句 40～90，合计 ≤240 | 产品定位 + 风险画像 + 适配提示（L0+L1+archetype） |
| 第二章开篇 | 120～200 | L0 收益/回撤/基准超额 + 非承诺句 |
| 第三章开篇 | 120～200 | L1 目标/申赎 + archetype；**不写业绩 %** |

失败 → TPL fallback。`l0_summary` **compose 不改写**。

---

## 何时用本模板

| 意图 | 标识 | 是否用本模板 |
|------|------|--------------|
| 单点简答 | `fund_qa` | ❌ 聊天气泡短答即可 |
| **完整解读** | `fund_full_report` | ✅ KB-03 → 本骨架 → Verify → 模式 B → 确认发布 |

**强触发**：自选 **AI 解析**；用户要「基金解析 / 解读报告 / 完整分析」。

---

## 一级标题（`#` · 与 `report_name` 一致）

格式（§4.1.0d · RPT-NAME-01）：

```text
{fund_code}-{基金简称}-基金解读-{YYYYMMDD}
```

示例：

```markdown
# 019305-摩根标普500指数(QDII)人民币C-基金解读-20260612
```

文首副标题（推荐）：

```markdown
*为您生成 · {生成日期}*  
*行情与净值数据截至 **{as_of_trade_date}**（最近一个交易日）*
```

**禁止**：标题写「单只基金深度解析报告」等泛称；正文 **禁止** L0/L1/L2/L3、RAG、chunk_id、explore 等内部词。

---

## 章节骨架（顺序固定 · MVP 必含 · FK-18-FLOW）

> **对客四问四答**：① 产品介绍 → ② 赚不赚钱 → ③ 是否适合长期持有 → ④ 是否适合我

| 序 | 对客章节（`##`） | 必含 | 数据 / 备注 |
|----|------------------|------|-------------|
| — | **阅读指引** | ✅ | 四问导航；建议阅读列 **仅章节名**（如「长期持有」） |
| — | **三句话读懂这只基金** | ✅ | **LLM compose**（L0+L1）；①产品定位 ②风险画像 ③适配提示 |
| 一 | **产品介绍** | ✅ + 条件 echarts | 产品表 · 经理 · 投向与重仓（**大类资产饼** / **前十横条** 有数据才出） |
| 二 | **这只基金赚不赚钱？** | ✅ | LLM **开篇段** + **l0_summary 数字块**（模板直出） |
| 三 | **是否适合长期持有？** | ✅ | LLM **开篇段** + 风险揭示摘要（L1 润色） |
| 四 | **这只基金适合我吗？** | ✅ + **费率柱**? | 通用引导 + **决策参考清单**（无 profile/plan） |
| — | **温馨提示** | ✅ | §0.7 合规短版 |
| — | **引用说明** / **参考来源说明** | ✅ | FK-CITE；有 vault → 深链 |
| — | **延伸阅读** | 若有 L3 | 联网 ≤5 |

---

## 标题层级与自动编号（RPT-HEADING-NUM-01 · P0）

> Preview（`ReportMarkdownPreview` / `preview-report.html`）为 **`##`～`######`** 自动加 **1 / 1.1 / 1.1.1 / 1.1.1.1 / 1.1.1.1.1**；`#` 报告名 **不** 编号。

| Markdown | 对客显示（示例） | 用途 |
|----------|------------------|------|
| `#` | （无序号）基金解读报告名 | 与 `report_name` 一致 |
| `##` | **1** 产品介绍 | 章 |
| `###` | **1.1** 产品身份 | 节 |
| `####` | **1.5.1** 前十大重仓股 | 小节 |
| `#####` | **1.5.1.1** … | 更细条目（按需） |
| `######` | **1.5.1.1.1** … | 最深一级（少用） |

**写稿规则**

- 章标题 **禁止** 写「一、」「第二章」等手写序号；用 **`## 产品介绍`** 等纯文案。
- 逻辑块 **§4.1～§4.4** 指 **第四章内 `###` 顺序**，不在标题里写「4.1」。
- 需要更深层级时 **降级标题**（`####` / `#####`），不要只靠加粗段落冒充小节。

CSS 参考 → `requirement/docs/samples/report-heading-numbers.css` · PRD §1.3.4.2

**对客用语（RPT-COPY-FRIENDLY）**：用 **「这只基金」** 不用「这只基」；持有人小节 **`### 谁持有这只基金？`**

**统一版式**：章间 `---` · **基金报告禁止「本章回答」** · 文末免责 · 详 [`report-format-spec.md`](../../requirement/docs/samples/report-format-spec.md)（投资需求报告仍用 RPT-FORMAT-01）

---

## Archetype（FK-18-ARCH · 一套骨架 + 第四章变体）

`fund_lookup` 返回 `report_archetype`（A～F）；`draft-meta.json` 须存同值。  
**回退 D**：无法分类时按 spec §2.2 规则。

| ID | 类型 | 第一章 · 投哪里 第 1 图 | 第 2 图 | 禁止 |
|----|------|---------------|---------------|------|
| **A** | QDII / 海外 | 资产/地区饼 | **前十大重仓** 横条（海外/港股 · L0 有则画）+ 可选指数行业柱 | 「前十大 **A 股**重仓」标题 |
| **B** | 固收 / 存单 / 货币 | 资产饼 | **前十大重仓债券/存单** + 券种/久期结构 | 标题写「重仓**股**」 |
| **C** | 被动指数（非 QDII） | 资产饼 | 跟踪标的 / 指数行业；有 L0 → **前十股** | 无 A 股时误用「A 股重仓」 |
| **D** | 主动偏股 / 混合 | 资产饼 | **前十大 A 股重仓** 横条 | — |
| **E** | 主动偏债 / 二级债 | 资产饼 | **前十大重仓债券/转债** 横条 | 标题写「重仓**股**」 |
| **F** | FOF | 资产饼 | 子基金/大类配置 | 标题写「重仓**股**」 |

**全类型**：第一章「投哪里」**有数据则出** 1～2 块 echarts（大类资产饼 + 前十横条）；第四章 **有费率则出** 费率柱。**不限制**全报告总块数。  
**禁止**：外链 PNG 代替 ` ```echarts ` 块。

### 前十大持仓 · 按类型（FK-18-HOLD · 详文 spec §2.2b）

> 季报前十 **不一定是股票**——偏债/存单展示 **债券**；**FOF 一定有子基金前十**（`holdings_kind=fund`），标题写「重仓**基金**」；ETF 联接可能主要持有目标 ETF，同按 `fund` 或 `none` 路由。

| `holdings_kind` | 对客小节标题 | 表列（示例） |
|-----------------|--------------|--------------|
| `stock` | 前十大重仓**股** | 序号 · 名称 · 占净值% · 行业 |
| `bond` / `cd` | 前十大重仓**债券** / **存单** | 序号 · 名称 · 占净值% · 券种/评级 |
| `fund` | 前十大重仓**基金** | 序号 · **子基金名称** · 占净值% · （可选）子基金代码 |
| `mixed` | 前十大**重仓资产** | 序号 · 名称 · 类型 · 占净值% |
| `none` | （省略前十小节） | 仅资产配置 / 券种结构 |

**019305 样例** = `stock`（海外股）；**017704** = `bond`/`cd`；**206007** = `stock`（A 股）。

### 本期不做（原 FK-18-SUPP / RADAR 等）

> **第三方星级评级** **不对客**。以下模块 **不进报告**：持有人结构、换手率补充、历史分红、六维雷达、业绩对比图、回撤走势、行业配置。

**对客（RPT-SYN-COPY-01）**：正文 **禁止**「AI 分析」「AI 根据…整理」及 **「本章回答」**；第二/三章用 **普通开篇段**。

详情页事实（风险/投向/费用/经理）→ **第一章**；业绩数字块 → **第二章 l0_summary**；长期持有叙述 → **第三章**；个人匹配 → **第四章**。

六类型对照 → [`fund-report-blueprints-A-F.md`](../../requirement/docs/samples/fund-report-blueprints-A-F.md)；019305 结构参考 → **sample（A）**。

---

## ECharts 解析与渲染（FK-18-EC · 必读）

> 基金解读报告 **不是纯 Markdown 文档**：模式 B Preview、我的报告 Tab 均通过 **`ReportMarkdownPreview`** 把正文里的 **` ```echarts `** 块 **当 JSON 解析** 后 `echarts.init` 出图。写错围栏或 JSON → **该图位报错或空白**，Verify / publish 应拦截。

### 与投资需求报告的区别

| | 投资需求报告 | **基金解读报告** |
|---|--------------|------------------|
| 图表 | **可选** 0～2 图（月度去向 / 目标时间线等） | **按章有数据才出**（第一章 1～2 + 第四章 0～1）；**不限制总块数** |
| Preview | 表格 + 段落即可 | 须 **JSON.parse** 每块 Option |
| Verify | 章节 + 字段 | 章节 + **JSON 合法** + 导语/三句话 + 数字与 L0 一致 |

### 围栏格式（唯一合法写法）

- 语言标识 **必须是** `echarts`（**不是** `json` / `javascript` / `js`）  
- 块内 **仅** 标准 ECharts **Option 对象** 的 JSON  
- **禁止** `function (...) { }`、`formatter: function` 等 JS 函数字符串（Preview **无法** eval）  
- **禁止** 外链 PNG/JPG、`<img>`、base64 图代替图表  

````markdown
```echarts
{
  "title": { "text": "近一年净值走势", "left": "center" },
  "tooltip": { "trigger": "axis" },
  "xAxis": { "type": "category", "data": ["2025-06", "2025-07"] },
  "yAxis": { "type": "value", "scale": true },
  "series": [{ "name": "本基金", "type": "line", "data": [1.0, 1.03] }]
}
```
````

### 前端解析流程（产品行为 · Agent 须兼容）

1. 正则拆分全文 → 每个 **` ```echarts `** 块单独 `JSON.parse`  
2. 解析成功 → 占位 `div` + `echarts.init(div).setOption(option)`  
3. 解析失败 → **仅该图位** 对客短错；**不**拖垮整页（§1.3.4）  
4. 基金报告 Preview：`citationMode='fk-cite'`（与图表解析 **独立**）

**自检**：改 md 后用 `echarts-smoke-test.md` 或 `fund-analysis-report-sample.md` 在 `preview-report.html` 冒烟（§1.3.4.1）。

### 按章图表（FK-18-EC · 有数据才出 · Verify 不数总块）

| 所在章 | 条件 | 典型图 |
|--------|------|--------|
| **第一章 · 投哪里** | L1 季报资产 / AK 资产比例 | 大类资产饼 |
| **第一章 · 投哪里** | L0 live 前十非空 | 前十横条（标题依 `holdings_kind`） |
| **第四章 · 适合我吗** | `parsed_fees` 至少一项 | 费率柱 |

- **不限制**全报告 ` ```echarts ` 总块数；无数据 **省略**，不凑假数  
- 表格数字 **≡** 同章图表 `series.data`（同一 `as_of_trade_date`）  
- 颜色：涨 `#22c55e` · 跌 `#ef4444` · 基准/中性 `#64748b` / `#94a3b8`  

详表（各 archetype 前十标题）→ [`fund-report-blueprints-A-F.md`](../../requirement/docs/samples/fund-report-blueprints-A-F.md) §4 · spec §6.2。

### Verify / publish 与 ECharts 相关项

| 检查 | 说明 |
|------|------|
| `fund_report_verify` | 每块 `JSON.parse` 通过；**不设**全报告块数上限 |
| 块数与 archetype | 标题须与 `holdings_kind` 一致；有 L0 前十 → 表 + 横条 |
| 无外链图 | 不得用图片 URL 代替 echarts |
| publish 前（可选） | 对照 `echarts-smoke-test.md` Preview 冒烟 |

完整 FK-18 清单 → 下文 Verify 表 · spec §7。

---

## 对客话术（阅读友好 · FK-18-LAYOUT）

- 用 **「您」**；数字 **加粗**；先结论后表格  
- **防重复**：关键数字在 **第二章** 展开；三句话 / 第四章小结 **定性**
- 第二/三章：**LLM 开篇段**（普通段落），**禁止**「本章回答」
- **第三章** 仅 AI 叙述，不重复第一章表格
- 专业词 **跟一句白话**（如「动态回撤 = 买入后最多曾亏多少」）  
- 每张图前 **1 段**：横轴/纵轴、哪条线是本基金  
- 图表视觉 **FK-18-VIS**：标题 15～16px 加粗 · 浅灰网格 · 柱圆角 · 饼图白边（见 spec §6.1）  
- 合规节标题：**温馨提示**  
- 引用节：**引用说明 · 可查看招募书原文**  
- **禁止**正文：L0/L1、向量、KB-03、内部字段名  

---

## §4 · 适合我吗（P0 · 无 profile/plan 联动）

> **本期范围**：**不做**与投资需求报告（profile）、投资规划书（plan）或自选池其它基金的 **联动对照**。  
> **Gather**：KB-03（L0/L1）；L2 仍可用于 Gather 内 L1 提示，**不**写入第四章正文。`fund.gather.profile` **auto-done**。

### 第四章结构（固定）

```markdown
## 这只基金适合我吗

请结合产品类型、历史波动与个人持有期限，对照下方清单综合判断。

### 决策参考清单

1. 您的 **风险等级** 是否与产品 **{risk_level}** 相匹配？
2. 您计划的 **持有期限** 是否覆盖至少一个完整市场周期？
3. 您是否理解 **费率结构** 与可能的 **申赎限制**？
4. 若已有资产配置方案，本产品 **大类角色** 是否清晰、占比是否合理？
5. 个人匹配与买卖决策请结合 **自身风险承受能力、持有期限与资产配置角色** 综合判断。
```

**禁止**：写「结合您的投资需求」「与自选池其它产品对照」、虚构 profile 深链或规划书引用。

> **二期（未做）**：FK-18-07 条件块 · 历史片段见 `fund-analysis-report-ch7-variants.md`（已归档，非 P0 验收）。

---

## 引用与来源（FK-CITE · FK-CITE-NOVAULT-01）

> **Gather 后看 `fund_lookup.has_vault`**。**本期不做** 报告内自动 PDF 解析入库。

### 有知识库（`has_vault=true`）

```markdown
## 引用说明 · 可查看招募书原文

以下条目可在 App 内 **「查看原文」**，跳转至对应披露文件位置。

| 标记 | 文件 | 章节 | 操作 |
|------|------|------|------|
| [^1] | 产品资料概要 | … | 查看原文 |
```

- 脚注 `[^n]` ↔ `metadata.knowledge_citations`  
- **禁止** 与延伸阅读混在同一表

### 无知识库（`has_vault=false` · 历史样例，**DEMO-ABCDEF-01 六只均有 vault**）

```markdown
## 参考来源说明

本基 **暂未纳入** App 本地基金知识库。正文中的费率、投资范围、风险等级等 **硬事实** 来自 **授权行情（L0）** 与 **公开联网页面（L3）**，请以基金公司最新法律文件为准。

| 信息类型 | 主要来源 |
|----------|----------|
| 净值、区间收益 | 授权行情数据 |
| 费率、基金类型 | 公开联网检索（见延伸阅读） |

## 延伸阅读（公开资讯）

| 标题 | 说明 |
|------|------|
| […](https://…) | 公开摘要 · **不代表推荐** |
```

- **禁止**：FK-CITE 表含「查看原文」；无 `chunk_id` 的深链  
- `knowledge_citations` **可为 []** · `web_citations` **≥1**（若用了 L3 硬事实）

**补库**：本期仅 **人工/seed/脚本** 写 vault；**二期** 再议自动抓取入 vault。

详文 → spec §5.4 · 有库样例 → `fund-analysis-report-sample.md` 文末

---

## Verify 最低项（FK-18 · `fund_report_verify`）

| # | 检查 |
|---|------|
| 1 | `#` 含 **基金简称 + 代码** |
| 2 | 文首 **数据截至** 最近交易日 |
| 3 | **阅读指引** + **三句话读懂** + **四段式** 四个 `##` 章存在 |
| 4 | 正文 **无** L0/L1/L2/L3、chunk_id、RAG 等术语 |
| 5 | **echarts**：每块 JSON 合法；**不限制**总块数；有 L0/L1 数据时第一章/第四章图表与 blueprint 一致 |
| 6 | 业绩数字与 L0 一致；费率/范围与 L1 一致 |
| 7 | 硬事实 **≥1** 处脚注 `[^n]`（有 vault 时） |
| 8 | **温馨提示**（§0.7 短版） |
| 9 | **引用** 与 **延伸阅读** 分节；L3 ≤5 |
| 10 | 无外链图代替 chart |
| 11 | `metadata.knowledge_citations` 与脚注对应 |
| 12 | **第四章**：含 **决策参考清单** · **禁止**「结合您的投资需求 / 自选对照」 |
| 13 | **三句话** + 第二/三章 **开篇段**（LLM 或 TPL）；**禁止「本章回答」**；第二章 **保留 l0_summary** |
| 14 | `report_archetype` 与第一章「投哪里」前十标题一致 |
| 15 | **FK-18-LAYOUT**：四问导航 · 第一章详情页 · **RPT-SYN-COPY-01** |
| 16 | 无「AI 分析」对客标题 · 文末系统整理免责 |
| 17 | **draft-meta.json** 含 `fund_code`、`as_of_trade_date`、`report_archetype`（§4.1.0b） |
| 18 | **RPT-HEADING-NUM-01**：`##`～`######` 标题 **无**「一、」「4.1」等手写序号 |
| 19 | **RPT-COPY-FRIENDLY**：**无**「这只基」 |
| 20 | 章间 `---` · **无「本章回答」** · 文末系统免责 |

完整清单 → spec §7。

---

## Gather 反模式（禁止）

- 链式读整份招募书 / vault grep  
- 须 `fund_knowledge_explore`（PRD knowledge §9.2.0d）  
- 联网结果 **自动入库** L2  
- 照抄 sample 数值（sample 仅结构与话术标准，数字 **必须** 来自当次 L0/L1）

---

## 产出路径

| 阶段 | 路径 |
|------|------|
| 草稿 | `data/runs/{conversation_id}/{run_id}/draft-report.md` |
| 发布后 | `data/reports/fund/{sanitized_report_name}.md` + `report_index` |

用户 **确认发布**（RPT-CARD-01）后才写索引；Verify 通过 **不**自动发布。

---

## Agent 须知（不对客）

| 项 | 规则 |
|----|------|
| **Command** | `fund_lookup` → archetype → KB-03 并行 L0/L1 → `report_draft` |
| **Verify** | `fund_report_verify`：**JSON.parse 每个 echarts 块** + 导语/三句话 + 数字与 L0 一致；失败则重写，**不**出模式 B |
| **修订** | 同 `run_id` 全量 re-Verify（RPT-REV-01） |
| **L0** | `fund.prep.l0_sync` 优先 Tushare → AKShare；失败 **中断**报告（不用 REG 假数） |
| **L0 降级** | `l0_degraded` 时加强 L3，L1 硬事实仍以 vault 为准 |
| **阶段条** | 理解意图 → 确认档案 → **同步行情** → 检索披露 → 撰写报告 → 核对内容 |

---

## Mock 索引

| 文件 | 内容 |
|------|------|
| `requirement/docs/samples/fund-analysis-report-sample.md` | **019305 · archetype A** 全文（图表 + FK-CITE + 话术） |
| `requirement/docs/samples/fund-analysis-report-spec.md` | 瀑布流程、metadata、echarts-smoke |
| `requirement/docs/samples/echarts-smoke-test.md` | **单图** Preview 冒烟 |
| `requirement/docs/samples/echarts-smoke.json` | 最小 Option JSON |

生成任意基金时：**共用本骨架** + `report_archetype` 切换第四章；**禁止**照抄 sample 数字。
