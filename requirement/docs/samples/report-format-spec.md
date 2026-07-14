# 四类报告 · 统一格式规范（RPT-FORMAT-01 · P0）

> **适用范围**：`profile` / `plan` / `portfolio` / `fund` 全部对客 Markdown。  
> **Preview**：`ReportMarkdownPreview` + [`report-format.css`](./report-format.css) + [`report-heading-numbers.css`](./report-heading-numbers.css)  
> **Agent**：写稿与 Verify **必须** 遵守；样例 md 为验收标准。

---

## 1. 文档骨架（四类共用）

```markdown
# {report_name}

*副标题 · 生成日期*
*数据/场景说明（一行）*

---

## 阅读指引          ← 有则写（基金/需求报告推荐）
## 三句话读懂…       ← 有则写（blockquote）
## …速览             ← 有则写（一张总览表）

---

## 正文章节 A

**本章回答：** 本章解决什么问题（一句话）。

### 小节

| 表格 | … |

---

## 正文章节 B
…

---

## 温馨提示 / 合规与说明

---

*以上内容由系统根据公开信息整理，仅供参考，不构成任何投资建议或收益承诺。*
```

| 块 | 规则 |
|----|------|
| `#` 标题 | **第一行**；与 `report_name` 一致；**不参与** 自动编号 |
| 副标题 | `*斜体*` · 1～2 行 · 写日期/场景/数据截至 |
| `---` | **每个 `##` 章之前** 加一条（开篇第一块前已有则跳过重复） |
| 开篇 | 阅读指引 / 三句话 / 速览 |
| 正文 `##` | **禁止**「本章回答」；用 **普通开篇段**（compose） |
| 文末 | **必须** 有系统整理免责 **一行**（斜体） |

---

## 2. 标题层级

| Markdown | Preview | 用途 |
|----------|---------|------|
| `##` | 1 | 章 |
| `###` | 1.1 | 节 |
| `####` | 1.1.1 | 小节 |
| `#####` | 1.1.1.1 | 更细（少用） |
| `######` | 1.1.1.1.1 | 最深（少用） |

- **禁止** 手写「一、」「4.1」等序号（**RPT-HEADING-NUM-01**）
- **禁止** 用加粗段落冒充标题；该降级就用 `###`

---

## 3. 版式元素

| 元素 | 写法 | 说明 |
|------|------|------|
| **三句话** | `> **① …**` blockquote | 全文最前摘要；**不** 堆数字表 |
| **表格** | GFM 表 · 表头列名清晰 | 数字列可 **加粗**；避免超宽无表头 |
| **图表** | ` ```echarts ` + JSON | 图 **前** 1 句说明读什么 |
| **脚注** | `[^n]` + 文文引用表 | 仅基金报告 FK-CITE |
| **对客用语** | **RPT-COPY-FRIENDLY** | 「这只基金」不用「这只基」；不用内部字段名作标题 |

---

## 4. 四类报告 · 开篇差异

| report_type | 推荐开篇块（`##`） |
|-------------|-------------------|
| **fund** | 阅读指引 → 三句话读懂这只基金 |
| **profile** | 阅读指引 → 三句话读懂本组需求 → 需求速览 → 报告说明 | **可选** 0～2 张图（月度去向 / 目标时间线） |
| **plan** | 三句话读懂本方案 → 方案速览 |
| **portfolio** | 阅读指引 → 三句话读懂本报告 → 持仓速览 · **禁止「本章回答」** |

---

## 5. Verify 共用项（RPT-FORMAT-VERIFY）

| # | 检查 |
|---|------|
| 1 | `#` 为第一行有效内容 |
| 2 | 各 `##` 章之间有 `---` |
| 3 | 正文 `##` 章（除开篇/合规/参考）：**禁止**「本章回答」 |
| 4 | 无手写章号 · 标题层级 ≤5 级 |
| 5 | 文末含系统整理免责斜体句 |
| 6 | 无 L0/L1/chunk_id 等内部词（各类型另查） |

各类型 **章节清单、图表数、数据绑定** 仍见各自 `*-report-spec.md`。

---

## 6. 文件索引

| 文件 | 用途 |
|------|------|
| [report-format-spec.md](./report-format-spec.md) | 本文 · 四类共用格式 |
| [report-format.css](./report-format.css) | Preview 版式 |
| [report-heading-numbers.css](./report-heading-numbers.css) | 标题编号 |
| [fund-analysis-report-spec.md](./fund-analysis-report-spec.md) | 基金解读专规 |
| [plan-allocation-report-spec.md](./plan-allocation-report-spec.md) | 规划书专规 |
| [portfolio-analysis-report-spec.md](./portfolio-analysis-report-spec.md) | 持仓分析专规 |
| [portfolio-report-blueprint.md](./portfolio-report-blueprint.md) | 持仓分析蓝图 |
| PRD [06-profile.md §6.2.8](../prd/06-profile.md) | 投资需求报告专规 |
| [profile-investment-requirements-report-spec.md](./profile-investment-requirements-report-spec.md) | 投资需求专规 · 可选图表 |
