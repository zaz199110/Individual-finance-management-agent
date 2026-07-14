# 自动化测试索引

> 面向产品、测试与项目协作同学。说明「跑什么、代表什么、什么时候用」。  
> 所有脚本与用例已集中在 **`automation/`** 目录。

---

## 一、30 秒快速上手

| 你想做什么 | 在项目根目录执行 |
|------------|------------------|
| 第一次在本机跑通（配密钥 + 建表 + 全量验收） | `npm run test:acceptance` |
| 只跑 PRD 核心验收（16 条） | `npm test -- automation/tests/acceptance/prd.acceptance.test.ts` |
| 只跑「缺口 / 扩展」验收（18 条） | `npm run test:gaps` |
| 发版前冒烟（含编译 + 可选在线 API） | `npm run selftest` |
| 人工验收前启动 dev（停旧进程 + 清 .next） | `npm run dev:clean` |
| 仅释放 3000/3001 端口 | `npm run dev:stop` |
| 一键：验收 + 编译 + 在线冒烟 | `npm run test:all` |
| 仅生成/更新本地密钥文件 | `npm run env:bootstrap` |
| 检测全部模型是否可用 | `npm run probe:models` |
| 检测单个模型槽位 | `npm run probe:web` 等（见 §3.1） |

**通过标准**：命令结束时无报错、终端显示测试通过（绿色 ✓）。  
**前提**：本机已有 `secrets.env` 或 `.env.local`（含 Mimo、智谱 Search-Std、Supabase 等密钥）。  
**模型栈定稿表**：[`requirement/config/model-defaults.md`](../requirement/config/model-defaults.md)（后续不再重复口头约定）。

---

## 二、目录结构

```
automation/
├── INDEX.md                 ← 本文件（索引说明）
├── scripts/                 ← 可执行的自动化脚本（PowerShell / Python）
│   ├── bootstrap_env.ps1    ← 生成本地环境配置
│   ├── apply_app_core.py    ← 初始化数据库表
│   ├── validate_registry.py ← 校验命令注册表
│   ├── run_acceptance.ps1   ← 完整验收流水线
│   ├── run_gaps.ps1         ← 缺口验收
│   ├── run_all.ps1          ← 验收 + 编译 + 冒烟
│   └── self_test.ps1        ← 发版自检
└── tests/
    ├── setup.ts             ← 测试环境加载（自动读 .env.local）
    ├── helpers/               ← 测试辅助工具
    ├── acceptance/            ← PRD 验收用例（按条执行）
    │   ├── manifest.ts        ← 核心 16 条用例清单
    │   ├── gaps.manifest.ts   ← 扩展 18 条用例清单
    │   ├── prd.acceptance.test.ts
    │   └── gaps.acceptance.test.ts
    └── chat/                  ← 对话侧栏专项（标题/搜索/单置顶互斥）
        ├── conversation-sidebar.acceptance.test.ts
        └── conversation-pin.acceptance.test.ts
```

单元测试（开发自测，不依赖外网）仍在 `src/**/*.test.ts`，由 `npm test` 一并执行。

---

## 三、脚本说明（`automation/scripts/`）

### 1. `bootstrap_env.ps1` — 准备本地环境

**作用**：从 `secrets.env` 复制并生成项目根目录的 `.env.local`，写入本地联调默认模型栈：

| 槽位 | 默认模型 |
|------|----------|
| 快推理 / 深度推理 / 图片理解 | Mimo v2.5 |
| 联网搜索 | 智谱 Search-Std |
| 文本嵌入（可选） | 智谱 Embedding-3 |

**何时跑**：新同事入职、换机器、密钥更新后。

**npm 命令**：`npm run env:bootstrap`

---

### 1b. 模型探针 CLI — `probe-models.ts` / `probe_models.ps1`

**作用**：与设置页「检测可用性」同源，按槽位调用真实 API（不经过 LLM 对话）。

| npm 命令 | 槽位 |
|----------|------|
| `npm run probe:models` | 全部五槽位 |
| `npm run probe:reasoning` | 推理（Mimo） |
| `npm run probe:deep` | 深度推理 |
| `npm run probe:vision` | 图片理解 |
| `npm run probe:web` | 联网（Search-Std） |
| `npm run probe:embedding` | 文本嵌入（Embedding-3） |

**何时跑**：改密钥后、发版前、PM 确认「能不能开聊」。

---

### 2. `apply_app_core.py` — 初始化应用数据库

**作用**：在 Supabase 上创建聊天与设置相关表（对话、消息、模型配置、工作流任务等）。

**何时跑**：首次连接 Supabase，或数据库被清空后。通常由 `run_acceptance.ps1` 自动调用。

**手动执行**：`python automation/scripts/apply_app_core.py`

---

### 3. `validate_registry.py` — 校验「斜杠命令」注册表

**作用**：检查 `agents/registry.yaml` 是否与 PRD 一致（例如：自由问答 Tab 下 `/` 只能补全 `web_search`、`vision_parse`）。

**何时跑**：修改命令注册表后；验收流水线第一步也会跑。

**手动执行**：`python automation/scripts/validate_registry.py`

---

### 4. `run_acceptance.ps1` — **主验收流水线（推荐）**

**作用**：按顺序自动完成：

1. 生成 `.env.local`
2. 初始化数据库表
3. 单元测试（`src/` 下）
4. 缺口验收 18 条
5. 核心 PRD 验收 16 条

**何时跑**：每日构建、合并代码前、演示前。

**npm 命令**：`npm run test:acceptance`

---

### 5. `run_gaps.ps1` — 缺口 / 扩展验收

**作用**：只跑 `gaps.acceptance.test.ts`（18 条）+ `prd.acceptance.test.ts`（16 条），不重复跑单元测试与 bootstrap。

**何时跑**：改完聊天、Handoff、联网等功能后快速回归。

**npm 命令**：`npm run test:gaps`

---

### 6. `run_all.ps1` — 一键全量

**作用**：`run_acceptance` + 生产编译 + 在线 API 冒烟（需先 `npm run dev`）。

**何时跑**：发版前最后一轮。

**npm 命令**：`npm run test:all`

---

### 7. `self_test.ps1` — 发版自检

**作用**：

1. 注册表校验  
2. 全部测试（含验收）  
3. `next build` 生产编译  
4. 若本地已开 `npm run dev`，探测 `/api/settings/readiness` 与 `/api/commands`

**何时跑**：CI 或发版前；dev 未启动时第 4 步会跳过，不影响通过。

**npm 命令**：`npm run selftest`

---

### 7b. `dev_clean.ps1` / `stop_dev.ps1` — 开发服务器（Windows）

**作用**：

| 脚本 | 命令 | 说明 |
|------|------|------|
| `dev_clean.ps1` | `npm run dev:clean` | 停止 3000/3001 上的旧 dev → 删除 `.next` → 前台启动 `npm run dev` |
| `stop_dev.ps1` | `npm run dev:stop` | 仅释放 3000/3001 端口 |

**何时跑**：人工验收前、`.next` 损坏（`ENOENT _document.js`）、或 dev 被挤到 3001 时。

**注意**：自动化脚本 **禁止** 用无 `-Encoding UTF8` 的 `Get-Content` 读取 `src/` 源码；见 `.cursor/rules/automation-scripts.mdc` 与 `_encoding.ps1`。

---

### 7c. `check_source_encoding.mjs` — 源码 UTF-8 护栏

**作用**：扫描 `src/**/*.ts(x)`，检测 U+FFFD 替换符与未闭合字符串（防止 PowerShell 乱码再次破坏编译）。

**何时跑**：`self_test.ps1` 第 2 步自动执行；可手动：`node automation/scripts/check_source_encoding.mjs`

---

## 四、验收用例清单

### A. 核心验收（19 条）— `manifest.ts`

| 编号 | 产品含义 | 验证什么 |
|------|----------|----------|
| REG-01 | 命令表合法 | 注册表与 PRD 一致 |
| REG-02 | `/` 补全数据源 | 接口能列出 chat 斜杠命令 |
| SET-MIMO-01 | 推理模型可用 | Mimo v2.5 能正常回复 |
| SET-MIMO-DEEP | 深度推理同栈 | 与快推理相同且探针通过 |
| SET-ZHIPU-WEB | 联网模型可用 | 智谱 Search-Std 探针通过 |
| SET-MIMO-VISION | 看图模型可用 | Mimo 多模态槽位探针通过 |
| SET-ZHIPU-EMB | 嵌入模型可用 | 智谱 Embedding-3 探针通过 |
| CLI-PROBE-01 | 探针 CLI 同源 | probeModelSlot 与 API 一致 |
| SET-SUPA-01 | 数据库可连 | Supabase 对话表可访问 |
| SET-READINESS | 可以开始聊天 | 设置页 readiness 为「可聊天」 |
| PLAN-Q2 | 懂「最大回撤」 |  Planner 识别为简单问答 |
| PLAN-Q6 | 懂「你能做什么」 | 识别为能力介绍 |
| PLAN-Q4 | 懂「要做理财规划」 | 识别为跳转需求梳理 |
| PLAN-D2 | 持仓 Tab 短问 | 非 chat Tab 也能短问 |
| PLAN-PROFILE | 需求梳理流程 | profile 场景识别正式流程 |
| PROMPT-COMPLIANCE | 合规话术 | 系统提示含合规要求 |
| CHAT-STREAM-Q6 | 能力介绍能聊通 | 真实对话闭环（能力问句） |
| CHAT-STREAM-Q2 | 短问能聊通 | 真实对话闭环（最大回撤） |

---

### B. 缺口 / 扩展验收（19 条）— `gaps.manifest.ts`

| 编号 | 产品含义 | 验证什么 | 备注 |
|------|----------|----------|------|
| GAP-HTTP-01 | 流式接口契约 | HTTP POST 聊天流 SSE 正常 | |
| GAP-Q1 | 新建对话默认值 | 标题、Tab、未锁定状态 | |
| GAP-Q1b | 空状态文案 | MessageList 含「理财助手」与能力说明 | |
| GAP-Q3 | 联网有引用 | 智谱 Search-Std + 参考来源 ≤5 条 | 需外网 |
| GAP-Q4 | 跳转确认卡 | 说「理财规划」出现 Handoff 卡片 | |
| GAP-Q5 | 「暂不」按钮 | **UI 尚未实现** | 仅记录缺口 |
| GAP-Q5b | 忽略卡片继续聊 | 新问题走简单问答 | |
| GAP-Q5c | 说「好的」不跳转 | 不会误触发跳转 | |
| GAP-Q7 | 截图解读 | 工具仍为占位 | |
| GAP-Q8 | 自动跳转持仓 | 空消息 + autostart 不报错 | |
| GAP-Q9 | 停止生成 | **功能尚未实现** | 仅记录缺口 |
| GAP-Q10 | 模型未配禁用输入 | 未就绪时不能发消息 | |
| GAP-Q11 | Vision 可配置 | Mimo 多模态槽位存在 | |
| GAP-Q12 | `/` 只有两条命令 | web_search + vision_parse | |
| GAP-Q13 | 橙点提醒 | 有未确认草稿时显示逻辑 | |
| GAP-Q14 | 大图拦截 | 超过 10MB 报错码 | |
| GAP-S12 | 阶段条落库 | 工作流任务写入数据库 / SSE | |
| GAP-S13 | 后台任务 | **暂未写入 background_jobs** | 仅记录缺口 |
| GAP-PROFILE | 需求梳理能跑 | profile 场景对话闭环 | |

**图例**：

- 无备注：已实现，测试应通过  
- 「仅记录缺口」：测试通过表示「确认尚未实现」，便于排期，不是 bug

### C. 对话侧栏专项 — `automation/tests/chat/`

| 文件 | 产品含义 | 验证什么 |
|------|----------|----------|
| `conversation-sidebar.acceptance.test.ts` | 标题格式 / 搜索 / 排序 | 结构化标题、摘要重命名、置顶项排最前 |
| `conversation-pin.acceptance.test.ts` | **单置顶互斥（CH-PIN-01）** | 置顶 B 取消 A；取消置顶；排序 |

**单元**：`src/lib/chat/conversation-entry.test.ts` — CH-FIRST-01 首屏/无效 `?c=` 定位最近对话，无历史才 POST，防 Strict Mode 重复创建。

**运行**：`npm test -- automation/tests/chat/conversation-pin.acceptance.test.ts`

---

## 五、与 npm 命令对照

| npm 命令 | 实际脚本 | 适合角色 |
|----------|----------|----------|
| `npm run env:bootstrap` | `bootstrap_env.ps1` | 所有人 |
| `npm run test:acceptance` | `run_acceptance.ps1` | 测试 / 研发（主流程） |
| `npm run test:gaps` | `run_gaps.ps1` | 测试 / 研发（快速回归） |
| `npm run test:all` | `run_all.ps1` | 发版负责人 |
| `npm run selftest` | `self_test.ps1` | CI / 发版 |
| `npm test` | vitest 全部 | 研发日常 |

---

## 六、常见问题

**Q：没有密钥能跑吗？**  
A：单元测试可以；带 `SET-*`、`CHAT-*`、`GAP-Q3` 的用例需要 `.env.local` 里配置 Mimo、智谱 Search-Std 与 Supabase。

**Q：测试很慢？**  
A：含真实调用 Mimo / 数据库的用例约 1～3 分钟/条，属正常。可只跑单条：  
`npm test -- -t "PLAN-Q2"`

**Q：`scripts/` 旧目录还能用吗？**  
A：可以，已改为转发到 `automation/scripts/`，建议新同学只看 `automation/`。

**Q：和 seed 脚本什么关系？**  
A：`seed/scripts/` 负责基金数据种子；本目录负责**应用功能验收**，二者分开。

---

## 七、推荐阅读顺序（产品经理）

1. 本文 **第一节** — 知道跑哪条命令  
2. **第四节 A** — 核心 16 条 = 当前承诺可交付能力  
3. **第四节 B** — 扩展 18 条 = 含已知未做项，用于排期对齐  
4. 需求原文：`requirement/prd/05-chat-qa.md` §5.15  
5. **开发进度（PM）**：[`需求仓/docs/DEVELOPMENT-PROGRESS.md`](../需求仓/docs/DEVELOPMENT-PROGRESS.md)

---

*最后更新：快推理 / 深度 / 多模态 = Mimo v2.5；联网 = 智谱 Search-Std；嵌入 = 可选 Embedding-3。*
