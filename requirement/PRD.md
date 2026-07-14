# 金融顾问 Agent — 产品需求（PRD）

> **v0.1-draft** · 界面：简体中文  
> **规范**：[CONVENTIONS](./prd/CONVENTIONS.md) · **名词**：[GLOSSARY](./prd/GLOSSARY.md) · **决项**：[appendix-d](./prd/appendix-d-decisions.md) · **待确认**：[appendix-e](./prd/appendix-e-conflicts-pending.md) · **未定**：`需求仓/research/07-mythinking.md`

| 仓库 | 路径 |
|------|------|
| 需求仓 | `D:\CursorProjects\agent-demo\` |
| 编码仓 | `{APP_ROOT}` = `D:\CursorProjects\agent-demo-app\` |

---

## 怎么用

1. **改一个功能** → 只打开对应 **一个** `prd/*.md`（见下表）。  
2. **不懂名词** → [GLOSSARY](./prd/GLOSSARY.md)。  
3. **同一规则只写一处**；别处 `§x.y` 或链接（[CONVENTIONS](./prd/CONVENTIONS.md)）。**表字段**在各模块「字段规格」，§3 只有索引。
4. **实现**另读 [CODING.md](./CODING.md)、[HARNESS.md](./HARNESS.md)；业务以 `prd/` 为准。

**建议阅读顺序**：  
[00 定位](./prd/00-overview.md) → [01 界面](./prd/01-global-design.md) → [02 设置](./prd/02-settings.md) → [05 聊天](./prd/05-chat.md) → [06 需求梳理](./prd/06-profile.md) → [07 资产配置](./prd/07-allocation-plan.md) → [08 持仓](./prd/08-portfolio.md) → [09 基金](./prd/09-fund.md) → [04 报告](./prd/04-reports-and-tasks.md)

---

## 模块索引

| § | 模块 | 文件 | 一句话 |
|---|------|------|--------|
| 0 | 产品定位 | [00-overview.md](./prd/00-overview.md) | 三条主线、边界、MVP、**跨平台开发环境 §0.14** |
| 1 | 全局设计 | [01-global-design.md](./prd/01-global-design.md) | 布局、Preview |
| 2 | 设置 | [02-settings.md](./prd/02-settings.md) | 模型 / 库 / 数据源 / 记忆 |
| 3 | 数据架构 | [03-data-architecture.md](./prd/03-data-architecture.md) | 存储分层、实体关系、表索引（字段在各模块） |
| 4 | 报告·定时 | [04-reports-and-tasks.md](./prd/04-reports-and-tasks.md) | 我的报告、定时持仓 |
| 5 | 聊天 | [05-chat.md](./prd/05-chat.md) | 共有壳 + 自由问答 |
| 6 | 需求梳理 | [06-profile.md](./prd/06-profile.md) | 投资需求（客户信息层 + 目标投资约束） |
| 7 | 资产配置 | [07-allocation-plan.md](./prd/07-allocation-plan.md) | 两步配置、规划书 |
| 8 | 持仓分析 | [08-portfolio.md](./prd/08-portfolio.md) | 录入、诊断、再平衡 |
| 9 | 基金域 | [09-fund.md](./prd/09-fund.md) | 解析、自选、知识库 |

**Hub 子文件**：  
§2 → [models](./prd/02-settings-models.md) · [database](./prd/02-settings-database.md) · [datasources](./prd/02-settings-datasources.md) · [memory](./prd/02-settings-memory.md)  
§4 → [my-reports](./prd/04-my-reports.md) · [scheduled-tasks](./prd/04-scheduled-tasks.md)  
§5 → [shared](./prd/05-chat-shared.md) · [qa](./prd/05-chat-qa.md)  
§9 → [analysis](./prd/09-fund-analysis.md) · [knowledge](./prd/09-fund-knowledge.md) · [watchlist](./prd/09-fund-watchlist.md)

**附录**：[paths](./prd/appendix-c-paths.md) · [decisions](./prd/appendix-d-decisions.md) · [conflicts](./prd/appendix-e-conflicts-pending.md)

**关联**：[HARNESS.md](./HARNESS.md) · [CODING.md](./CODING.md) · [../需求仓/docs/CODING-BOOTSTRAP.md](../需求仓/docs/CODING-BOOTSTRAP.md) · [CONSISTENCY-AUDIT.md](./CONSISTENCY-AUDIT.md)
