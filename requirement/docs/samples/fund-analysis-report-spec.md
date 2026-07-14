# 单只基金解读报告 · 实现说明（Spec）

> **状态**：2026-06-22 · 与 [`fund-report-blueprints-A-F.md`](./fund-report-blueprints-A-F.md) **同口径**  
> **Hub 总览**：[`09-fund.md` §9.0.3](../../prd/09-fund.md#903-演示数据--对客-mock--l0hub-口径)（Mock / L0 / REG / CI）  
> **Agent 入口**：`skills/fund/report.template.zh.md`  
> **对客样例**：[`fund-analysis-report-sample.md`](./fund-analysis-report-sample.md)（019305 · A 型 · **3× echarts**）  
> **PRD**：`requirement/prd/09-fund-analysis.md` §9.1  
> **历史**：≥6 图 · 六维雷达 · FK-18-SUPP · REG 假持仓 — **已 superseded**

---

## 1. 文档分工

| 文件 | 读者 | 内容 |
|------|------|------|
| **蓝图 A～F** | 产品 / Agent | 六类型规则、数据来源、LLM 块、图表条件 |
| **本 spec** | 研发 / Verify | 流程、字段、ECharts 契约、校验清单 |
| **sample** | 对客话术参考 | 019305 全文（**非**运行时默认正文） |
| **Skill 模板** | Agent 运行时 | 骨架摘要 + Verify 对照 |

写入 `data/runs/…/draft-report.md` 的正文须 **对客友好**；技术字段进 `draft-meta.json` / `report_index.metadata`，**禁止** L0/L1/chunk_id 等内部词。

---

## 2. 流程（`fund_full_report`）

```mermaid
flowchart LR
  A[用户 / AI 解析] --> B[fund_lookup async]
  B --> C[fund.prep.l0_sync]
  C --> D[KB-03 Gather]
  D --> E[report_draft TPL]
  E --> F[compose LLM 导语]
  F --> G[fund_report_verify]
  G --> H[模式 B Preview]
  H --> I[确认发布]
```

| 步 | 说明 |
|----|------|
| lookup | **Tushare → AKShare**；失败则中断，**不用 REG 假持仓/净值** |
| l0_sync | 写 `data/l0-cache` + `l0_sync_log`；后续 fetch **优先读缓存** |
| Gather | L0 ∥ L1；缺数可 L3；**行业配置不进报告** |
| draft | 模板直出数字表 / echarts / l0_summary |
| compose | LLM 写 **三句话** + 第二/三章 **开篇段**（TPL fallback） |
| Verify | 结构 + 导语质检 + echarts JSON + 禁止「本章回答」 |

---

## 2.1 演示种子（DEMO-ABCDEF-01）

| 代码 | 类型 | vault |
|------|------|-------|
| 019305 | A QDII | ✅ |
| 017704 | B 存单 | ✅ |
| 110020 | C 宽基联接 | ✅ |
| 206007 | D 主动 | ✅ |
| 519772 | E 平衡 | ✅ |
| 518880 | F 黄金联接 | ✅ |

`FUND_L0_REGISTRY` **仅保留** archetype / 类型 / 演示用静态指标（规划书筛选用）；`registry-portfolio.ts` **已删除** `REGISTRY_PORTFOLIO_DEMO` · **不得**向报告注入假持仓或假前十。

**CI**：**不**增加 mock L0 模式；单元测试用 fixture 或 `data/l0-cache` 快照，外网不可用时不另开 bypass 开关。

---

## 3. 章节骨架（FK-18-FLOW）

| 序 | `##` 章节 | 必含 | 备注 |
|----|-----------|------|------|
| — | 阅读指引 | ✅ | 四问导航 |
| — | 三句话读懂这只基金 | ✅ | LLM · 3 行 blockquote · ①②③ |
| 一 | 产品介绍 | ✅ | 产品表 · 经理 · 投向与重仓? · 范围 · 费率 |
| 二 | 这只基金赚不赚钱 | ✅ | LLM **开篇段** + **l0_summary**（live L0） |
| 三 | 是否适合长期持有 | ✅ | LLM **开篇段** + 风险揭示摘要 |
| 四 | 这只基金适合我吗 | ✅ | 决策清单 + 费率柱? |
| — | 温馨提示 | ✅ | 合规短版 |
| — | 引用说明 | ✅ | FK-CITE（有 vault） |

**版式**：章间 `---`；**基金报告不用「本章回答」**（与投资需求报告 RPT-FORMAT-01 不同）。

---

## 4. 数据来源

### 4.1 L0（前十 / 净值 / 费率）

| 模块 | Tushare | AKShare / EastMoney |
|------|---------|---------------------|
| 净值、区间收益、回撤 | `fund_nav` 等 | 净值历史 API |
| 费率 | `fund_basic` | `fund_overview_em` |
| **股票前十** | `fund_portfolio` | `fund_portfolio_hold_em` |
| **债券/存单前十** | 同上（债券） | `fund_portfolio_bond_hold_em` |
| 大类资产（无 L1 时） | — | 雪球资产比例 |

**前十重仓表/横条仅来自 L0**（Tushare/AKShare），**不是** L1 季报表格直出。对客说明：「前十大来自公开行情接口，相对定期报告可能有滞后。」

### 4.2 L1（vault）

投资范围、风险揭示、费率佐证、**大类资产饼首选**（季报「资产组合」段落）。

### 4.3 Archetype C（110020）· 无 L0 前十

- L0（Tushare `fund_portfolio` / AKShare `fund_portfolio_hold_em`）**无**可结构化的前十 → **`buildHoldingsSection` 返回空** → **整段省略** `### 投向与重仓`
- **不做** L3 联网摘要凑段；其它 archetype 无 L0 前十时仍可有 L3 文字 fallback（C 型除外）
- **大类资产饼**与前十 **同节**；C 型无前十时该节整体不出现（饼图不单独悬挂）

---

## 5. LLM 导语（compose）

### 5.1 三句话

- 3 行 blockquote；① 产品定位（类型与投向）② 风险画像（风险等级与波动特征）③ 适配提示（持有期限与适合人群）
- 每句 40～90 字；合计 ≤240  
- **禁止**「本章回答」、内部词、收益承诺  

### 5.2 第二章开篇

- **1 段普通段落**（非 blockquote）  
- 含近一年收益、最大回撤（**须与 live L0 一致**）+ 非承诺句  
- 其下 **l0_summary** 模板块 **不得删除/改写**  

### 5.3 第三章开篇

- **1 段普通段落**  
- **不写**业绩 `%`  
- 其下 `### 风险揭示摘要`（L1 摘录）  

---

## 6. ECharts（FK-18-EC）

### 6.1 本期图表（有数据才出 · 无总块数 cap）

| 章 | 图 | 条件 |
|----|-----|------|
| 一 | 大类资产饼 | L1 季报资产组合 **或** L0-AK 资产比例 |
| 一 | 前十重仓横条 | L0 live 前十 **非空** |
| 四 | 费率柱 | 解析费率 ≥1 项 |

**本期不做**：雷达、业绩对比、回撤走势、持有人结构、分红表、行业配置。

### 6.2 围栏格式

- 语言标识 **`echarts`**（非 `json`）  
- 块内 **纯 JSON Option**；禁止 `function` / 外链 PNG  
- Preview：`ReportMarkdownPreview` → `JSON.parse` → `echarts.init`

### 6.3 视觉（FK-18-VIS）

标题 15～16px 加粗；浅灰网格；柱圆角；涨 `#22c55e` / 跌 `#ef4444`。

---

## 7. Archetype（A～F）

| ID | 类型 | 前十标题要点 |
|----|------|--------------|
| A | QDII | 前十大重仓（海外） |
| B | 存单/固收 | 前十大存单/债券 |
| C | 指数联接 | 前十大重仓股；**无 L0 前十 → 省略投向与重仓** |
| D | 主动偏股 | 前十大 A 股重仓 |
| E | 股债平衡 | 前十大债券/转债 |
| F | FOF/黄金联接 | 子基金/联接结构 |

`holdings_kind` 由 **inferHoldingsKind(archetype, fund_type)** 推断，不读 REG 假表。

---

## 8. 第四章（FK-18-07）

固定 **决策参考清单** 5 条；**禁止** profile/plan/自选联动。可选 **费率柱**。

---

## 9. 引用（FK-CITE）

有 vault：脚注 `[^n]` + **查看原文** 深链。  
六只 DEMO **均有 vault**；无 vault 场景见蓝图（参考来源说明 + L3）。

---

## 10. Verify 清单（`fund_report_verify`）

| # | 检查 |
|---|------|
| 1 | 标题含基金代码；文首数据截至 |
| 2 | 四段 FLOW 章节 + 三句话 + 温馨提示 |
| 3 | **全文禁止「本章回答」** |
| 4 | 三句话 ①②③；第二/三章有开篇段；第二章含 l0_summary |
| 5 | 禁止内部词、AI 分析、建议买入 |
| 6 | echarts 每块 JSON 合法；**禁止 radar**；无业绩对比图 |
| 7 | 有 vault → 脚注 + 引用说明 |
| 8 | 第四章决策清单；无 profile 联动 |
| 9 | `draft-meta.json`：fund_code、report_archetype、conversation_id、run_id |
| 10 | 业绩数字与 **live L0** 一致（产品表 / 第二章 / l0_summary） |

---

## 11. Gather 反模式

- 链式读整份招募书  
- 联网结果自动入库 L2  
- 用 REG / registry **假持仓**凑前十  
- 照抄 sample 数字（sample 仅结构与话术）  
- 为 CI **新增 mock L0** 绕过 Tushare/AKShare

---

## 12. 进度条（PL-STAGE-FUND-01 · 一级平铺）

`fund.prep.lookup` → **`fund.prep.l0_sync`** → enrich? → `fund.gather.l0` / `l1` / `l3?` → `fund.rpt.draft.compose` → `fund.rpt.draft.verify`

---

*详版六类型填空见 [`fund-report-blueprints-A-F.md`](./fund-report-blueprints-A-F.md)。*
