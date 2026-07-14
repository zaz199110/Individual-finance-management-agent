> [← PRD 索引](../PRD.md) · **5. 聊天（总览）**

## 5. 聊天（总览）

### 模块说明

五场景共用 **一个聊天壳**（[shared](./05-chat-shared.md)）；**自由问答** 为默认 Tab（[qa](./05-chat-qa.md)）。需求梳理/资产配置/持仓/基金流程见 §6–§9，不在此重复。

### 5.0 两块对照

| 块 | 用户理解 | 适用 Tab | 详细 PRD |
|----|----------|----------|----------|
| **① 聊天共有** | 侧栏、历史、底栏 Tab、**Planner 路由（短问 vs 场景流程）**、流式、跳转卡、占位符、历史删改 | **全部五 Tab** | [**05-chat-shared.md**](./05-chat-shared.md) |
| **② 自由问答** | 默认 Tab；不写业务表；能力介绍、chat Command、截图建议 | **仅 `chat`** | [**05-chat-qa.md**](./05-chat-qa.md) |

**与其它模块关系**

```
侧栏 [+ 新对话] ──→ 默认 Tab = 自由问答（②）
       │
       ├── ① 共有：Planner / 历史 / 角标 / 模式 A·B
       │
       └── 底栏五 Tab ──┬── ② 自由问答  → 05-chat-qa
                        ├── 需求梳理    → 06-profile
                        ├── 资产配置    → 07-allocation-plan
                        ├── 持仓分析    → 08-portfolio
                        └── 基金解读    → 09-fund-analysis
```

| 规则 | 说明 |
|------|------|
| **壳只有一个** | 消息流 + 底栏组件 **一套**；差异靠 `conversation_type` 参数（§1.2.4） |
| **§7 / §8 分工** | **资产配置**（§7）：**第一步** 投资需求 md → 大类；**第二步** 公开资讯 + 基金知识库（**无优先推荐权**）→ 明细与规划书 · **不读持仓**。**持仓分析**（§8）：读持仓 + 可选对照 §7 方案 |
| **一线程一场景** | 锁定后一条对话一种类型；侧栏场景副标题（§5.3.14 · **CH-CONV-01**） |
| **五场景发图** | Vision 就绪时 **五 Tab 均可**截图提问（**VISION-ALL-01** · §5.3.13）；聊天区仍 **不支持** PDF/Excel |
| **跨场景** | 须 **先问 + 跳转卡**（HANDOFF-CONFIRM-01）；**仅**点「前往」才开目标对话；**禁止**静默写库 |
| **四业务场景** | 各自 PRD（§6–§9）；**不在**本模块重复 |

### 5.0.1 功能 ID 归属

| 归属 | ID | 所在文件 |
|------|-----|----------|
| 共有 · 壳导航 | SH-01～SH-08 · CH-FIRST-01 | [shared §5.1](./05-chat-shared.md) · §5.1.3a |
| 共有 · 交互 | CH-01～CH-09、CH-14、CH-16、CH-22、CH-25～CH-27 | [shared §5.1.4](./05-chat-shared.md) · §5.3 |
| 共有 · Planner 路由 | PLANNER-ROUTER-01 · §5.6.2 | [shared §5.6](./05-chat-shared.md) |
| 共有 · 跨场景跳转卡 | CH-13 · §5.6.3 | shared |
| 自由问答专属 | CH-10、CH-12、CH-18；QA-03～QA-06 | [qa §5.5](./05-chat-qa.md) |

### 5.0.2 跨块决项索引

| ID | 块 | 摘要 | 位置 |
|----|-----|------|------|
| SHELL-NAV-01 | ① | **导航均不拦截 pending**（含切 Tab）；侧栏角标找回来；删对话除外 | [shared §5.1.2](./05-chat-shared.md) |
| CH-NEW-01 | ① | **+ 新对话** 立即 POST；UI 默认自由问答；`type_locked=false` | [shared §5.1.3](./05-chat-shared.md) |
| CH-TYPE-01 | ① | **首句**或 **Handoff 前往** 锁定类型；未锁定只写 `active_tab` | [shared §5.1.3b](./05-chat-shared.md) |
| CH-FIRST-01 | ① | 无 `?c=` → 最近历史或 POST 新建 | [shared §5.1.3](./05-chat-shared.md) |
| CH-DEL-01 | ① | 仅逐条删除；有草稿/待确认 → 加强二次确认；无「清空全部」 | [shared §5.8.3](./05-chat-shared.md) |
| CH-03b | ① | 场景 Tab 随时切换，不因 pending 弹窗 | shared |
| RPT-LAYOUT-01 | ① | 模式 A/B | §1.2.5 · shared |
| G-08 | ① | 侧栏无五场景快捷新建 | §1.2.4 |
| CH-CMD-01 | ① | **五 Tab 各自** `/` Command；registry `scenes` + 使用说明同源 | [shared §5.3.9a](./05-chat-shared.md) |
| **PLANNER-ROUTER-01** | ① | **五 Tab** Planner；**短问**不启 §6–§9 场景流程 | [shared §5.6.2](./05-chat-shared.md) |
| **HANDOFF-CONFIRM-01** | ① | 跨场景 **先问 + 出卡**；**仅**点「前往」；可不点继续聊 | [shared §5.6.3](./05-chat-shared.md) |
| **VISION-ALL-01** | ① | **五 Tab** 聊天发图 + `vision_parse`（须 Vision 槽位） | [shared §5.3.13](./05-chat-shared.md) · §0.4 |
| SET-DB-01 | ② | chat 不要求 DB；四业务 Tab 须 DB | [02-settings §2.0.2](./02-settings.md) |
