# 报告 Markdown 样例 · 文档索引

> **产品 Preview**：**页面彼此独立**（我的报告 · **四 Tab** 页 / 设置·聊天记忆 / 知识库管理），**共用** App 内 **`ReportMarkdownPreview`**（PRD §1.3.4 · PREVIEW-01 · FK-21）。  
> 本目录 md 与 [`preview-report.html`](./preview-report.html) 为 **开发期 / Agent 参考**，用于对齐 Preview 渲染与 Verify 契约。  
> **禁止**：将本目录任一 `*-sample*.md` 作为对客「预存演示报告」挂载或默认展示；对客正文 **仅** 来自用户触发 **AI 解析 / 出具报告** 后生成的 `data/runs/.../draft-report.md`（确认发布 → `report_index`）。  
> **标题编号**：全部对客报告共用 **RPT-HEADING-NUM-01**（`##`～`######` 自动 1 / 1.1 / … · 见 [`report-heading-numbers.css`](./report-heading-numbers.css) · PRD §1.3.4.2）。  
> **统一版式**：**RPT-FORMAT-01**（章间 `---` · 表格/三句话样式 · 见 [`report-format-spec.md`](./report-format-spec.md) · [`report-format.css`](./report-format.css) · PRD §1.3.4.3）。

## 四类报告 · 共用格式

| 文件 | 用途 |
|------|------|
| [**report-format-spec.md**](./report-format-spec.md) | **RPT-FORMAT-01** · 骨架、本章回答、Verify |
| [report-format.css](./report-format.css) | Preview 版式（与 App 组件同源） |
| [report-heading-numbers.css](./report-heading-numbers.css) | **RPT-HEADING-NUM-01** · 标题 1 / 1.1 / … |

## 单只基金解读

| 文件 | 读者 | 用途 |
|------|------|------|
| [**fund-analysis-report-sample.md**](./fund-analysis-report-sample.md) | **Agent / 研发** | **参考样例**（019305 · **3× echarts** · 无「本章回答」 · **非**运行时预置正文） |
| [**fund-analysis-report-ch7-variants.md**](./fund-analysis-report-ch7-variants.md) | Agent / 研发 | **FK-18-07 四种组合（已归档）** · 本期不做 profile/plan 联动 |
| [**fund-analysis-report-spec.md**](./fund-analysis-report-spec.md) | Agent / 研发 | 章节映射、**DEMO-ABCDEF-01 六类型**、KB-03 流程、FK-CITE、ECharts 契约 |

## 持仓分析报告

| 文件 | 读者 | 用途 |
|------|------|------|
| [**portfolio-report-blueprint.md**](./portfolio-report-blueprint.md) | 产品 / Agent | **定稿蓝图**（TPL/LLM/L0 · compose · gather · 2026-06-22） |
| [**portfolio-analysis-report-spec.md**](./portfolio-analysis-report-spec.md) | Agent / 研发 | 实现说明 · Verify |
| [**portfolio-analysis-report-sample-variant-a.md**](./portfolio-analysis-report-sample-variant-a.md) | **C 端投资者** | 变体 A（**2× echarts** · **无「本章回答」**） |
| [**portfolio-analysis-report-sample.md**](./portfolio-analysis-report-sample.md) | **C 端投资者** | 变体 B（**3× echarts** · 对照方案） |
| [**holdings-propose-payload.examples.json**](./holdings-propose-payload.examples.json) | Agent / 研发 | `holdings_propose` JSON 样例 |

## 资产配置方案（plan）

| 文件 | 读者 | 用途 |
|------|------|------|
| [**plan-allocation-report-blueprint.md**](./plan-allocation-report-blueprint.md) | Agent / 研发 | **五 goal_type 填空蓝图** · 初筛/Hook/LLM/§六 指数 · **定稿** |
| [**plan-allocation-report-sample.md**](./plan-allocation-report-sample.md) | **C 端投资者** | 对客友好样例（**退休养老** · **3× `echarts`** · 正文 **无** 开发元数据块） |
| [**plan-allocation-report-spec.md**](./plan-allocation-report-spec.md) | Agent / 研发 | 章节映射、数据绑定、`allocation_plans` 字段、PL-REPORT-EC、Verify |

## 投资需求报告

| 文件 | 读者 | 用途 |
|------|------|------|
| [**profile-investment-requirements-report-sample.md**](./profile-investment-requirements-report-sample.md) | **C 端投资者** | 对客样例（**财富增值** · 开篇三块 + 七章 · **1× `echarts`** · 与基金解读 **§七** 深链联动演示） |
| [**profile-investment-requirements-report-spec.md**](./profile-investment-requirements-report-spec.md) | Agent / 研发 | 章节映射、**可选图表契约**（PROFILE-VISUAL-01）、Verify |
| [**profile-propose-payload.examples.json**](./profile-propose-payload.examples.json) | Agent / 研发 | `profile_propose` JSON 样例（**五 goal_type** · 同一客户 · Hook #8 对齐） |

> 另见 Skill 内 Mock：`skills/profile/report.template.zh.md`（含 **退休养老** 等五场景片段）

## 图表冒烟

| 文件 | 读者 | 用途 |
|------|------|------|
| [echarts-smoke.json](./echarts-smoke.json) | 研发 | ECharts Option JSON 片段 |
| [echarts-smoke-test.md](./echarts-smoke-test.md) | 研发 | ECharts 渲染冒烟（对齐 `ReportMarkdownPreview` 管线） |
| [mermaid-smoke.mmd](./mermaid-smoke.mmd) | 研发 | Mermaid CLI 自检 |

### 开发期预览 ECharts / Mermaid（非 App 组件）

内置 Markdown Preview **不支持** ` ```echarts `。验收以 **浏览器 `preview-report.html`** 或 App 内 **`ReportMarkdownPreview`** 为准。

| 方式 | 说明 |
|------|------|
| **推荐** | 浏览器打开 [`preview-report.html`](./preview-report.html) → 下拉选样例，或 `?sample=portfolio` 直达持仓分析 |
| 一键 | 双击 [`open-preview.cmd`](./open-preview.cmd) → `localhost:8765` |
| 备选 | MPE **Open in Browser**（侧边 webview 常白框） |

详细步骤见 [`.crossnote/README.md`](../../../.crossnote/README.md)。

### 默认已添加自选（WL-01）

验收矩阵见 PRD [§9.0.1](../../prd/09-fund.md)；样例报告以 **019305** 为主，**017704 / 206007** 变体见 [spec](./fund-analysis-report-spec.md)。
