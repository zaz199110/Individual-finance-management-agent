> [← PRD 索引](../PRD.md) · **4. 报告与定时持仓**

## 4. 报告与定时持仓分析

### 模块说明

侧栏 **我的报告**、**定时持仓分析** 两个独立页（§1.2.3）。已发布报告只在 `/reports` 看；草稿在对话模式 B（§4.1.0 · §1.2.5）。定时持仓分析到点直发报告（RPT-SCHED-01）。

### 4.0 两块对照

| 块 | 用户一句话 | 入口 | Done | 详细 PRD |
|----|------------|------|------|----------|
| **① 我的报告** | 「看已发布的规划书 / 持仓 / 基金报告，复制链接讨论」 | 侧栏 → **我的报告** `/reports` | 列表可读、Preview、深链可用 | [**04-my-reports.md**](./04-my-reports.md) · §4.1 |
| **② 定时持仓分析** | 「每月/每周自动跑持仓分析」 | 侧栏 → **定时持仓分析** `/scheduled-jobs` | 配置经用户确认保存；到点直发报告 | [**04-scheduled-tasks.md**](./04-scheduled-tasks.md) · §4.2 |

**与聊天 / 布局的关系**

```
场景对话（plan/portfolio/fund/profile）
  ├─ Verify 通过 → 待确认草稿 → 模式 B（§1.2.5）
  ├─ 用户确认发布 → report_index + 本模块 ① 列表
  └─ 定时持仓（②）→ 无草稿卡，Verify 后直接发布（RPT-SCHED-01）
```

| 规则 | 说明 |
|------|------|
| **草稿不在本页** | `pending_report_draft` 只在对话内模式 B；规格 → [§4.1.0](./04-my-reports.md) |
| **四 Tab 顺序** | 需求梳理 → 投资规划 → 持仓分析 → 基金解读（§4.1.1） |
| **自选 / 知识库** | **不属于**模块 4 → [09-fund-watchlist §9.3](./09-fund-watchlist.md)、[09-fund-knowledge §9.2](./09-fund-knowledge.md) |
| **持仓报告章节** | 内容骨架 → [08-portfolio §8.3–§8.4.1](./08-portfolio.md) |

### 4.0.1 跨块决项索引

> **需求梳理 ↔ 我的报告**：列表「当前」与 §7 准入均走 [§6.0.1 PH-PROFILE-ENC-01](./06-profile.md#601-完善的投资需求n-的定义--p0) · 细则 [§4.1.0e](./04-my-reports.md#410e-投资需求--当前版本rpt-profile-0103--p0) · 文案自检 [§6.14](./06-profile.md#614-跨模块衔接与文案通则p0--审视清单)。

| ID | 块 | 摘要 | 位置 |
|----|-----|------|------|
| RPT-DRAFT-01 | ① | 每对话最多 1 份活跃草稿 | [§4.1.0](./04-my-reports.md) |
| RPT-PUB-01 | ① | 确认发布才写 `report_index` | [§4.1.0](./04-my-reports.md) |
| RPT-LINK-01 | ① | 聊天引用报告用复制链接 | [§4.1.2](./04-my-reports.md) |
| RPT-PREVIEW-LINK-01 | ① | 待确认草稿 Preview 链接可点规则 | [§4.1.0f](./04-my-reports.md) |
| RPT-CHAT-ROUTE-01 | ① | 确认前 chat：报告-only / 改库分流 | [§4.1.0g](./04-my-reports.md) |
| RPT-OVERLAY-01 | ① | 报告-only 增量 overlay · 重生不丢 | [§4.1.0h](./04-my-reports.md) |
| RPT-EDIT-01 | ① | 已发布 md 外部编辑 + 刷新 | [§4.1.1](./04-my-reports.md) |
| RPT-SCHED-01 | ② | 定时持仓无确认卡、直发 | [§4.2](./04-scheduled-tasks.md) · §8.4 |
| RPT-PROFILE-01～03 | ① | 投资需求列表「当前」= **ENC-01 对齐**；完善 ≠ 有任意报告行 | [§4.1.0e](./04-my-reports.md#410e-投资需求--当前版本rpt-profile-0103--p0) · [§6.0.1](./06-profile.md#601-完善的投资需求n-的定义--p0) |
| RPT-PROFILE-04～05 | ①↔⑥ | 完善须确认发布；M 续接禁止 silent 草稿 | [§6.0.1](./06-profile.md) · [§6.0.2](./06-profile.md) |
| SCH-01～SCH-12 | ② | 自然日 × 最近交易日、卡片+日志 UI、执行/并发/日历 | [§4.2](./04-scheduled-tasks.md) |

**子文档**

1. [04-my-reports.md](./04-my-reports.md) — 我的报告（§4.1）  
2. [04-scheduled-tasks.md](./04-scheduled-tasks.md) — 定时持仓分析（§4.2）
