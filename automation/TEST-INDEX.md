# 自动化测试脚本索引

> **最后更新**：2026-06-18  
> **用途**：记录所有自动化测试脚本的用途、运行方式和覆盖范围

---

## 一、测试脚本分类

### 1. 单元测试（Unit Tests）

| 文件 | 用途 | 运行方式 |
|------|------|----------|
| `src/lib/kb/kb-intent.test.ts` | 测试知识库意图分类逻辑 | `npm test` |
| `src/lib/chat/input-policy.test.ts` | 测试输入框策略（禁用/占位符） | `npm test` |
| `src/lib/chat/conversation-ui.test.ts` | 测试对话 UI 状态（橙点等） | `npm test` |
| `src/lib/chat/conversation-entry.test.ts` | CH-FIRST-01：首屏/无效 ?c= 定位最近对话；无历史才 POST；防重复创建 | `npm test -- src/lib/chat/conversation-entry.test.ts` |
| `src/lib/chat/conversation-pin.test.ts` | 单置顶 metadata 与列表状态合并 | `npm test` |
| `src/lib/chat/report-publish-card.test.ts` | 报告确认卡预览键、最新版判定、草稿 URL | `npm test` |
| `src/lib/reports/draft-path-guard.test.ts` | 草稿路径归属校验（按 run 读指定版本） | `npm test` |
| `src/lib/chat/conversation-pin.server.test.ts` | 单置顶后端 unpin 其它对话 | `npm test` |
| `src/lib/chat/stop-generation.test.ts` | 测试停止生成功能 | `npm test` |
| `src/lib/chat/citation-display.test.ts` | 引用展示：标题格式化、自由问答 Tab 隐藏引用 | `npm test` |
| `src/lib/fund/lookup.test.ts` | 测试基金查询功能 | `npm test` |
| `src/lib/portfolio/validate.test.ts` | 测试持仓验证逻辑 | `npm test` |
| `src/lib/profile/basic-info.test.ts` | 测试客户信息验证 | `npm test` |
| `src/lib/profile/goal-constraint.test.ts` | 测试投资目标约束验证 | `npm test` |
| `src/lib/plan/detail-builder.test.ts` | 测试资产配置明细构建 | `npm test` |
| `src/lib/plan/placeholder.test.ts` | 测试资产配置占位符 | `npm test` |
| `src/lib/reports/parse-report-link.test.ts` | 测试报告链接解析 | `npm test` |
| `src/lib/reports/mermaid-verify.test.ts` | 测试 Mermaid 校验 | `npm test` |
| `src/lib/reports/deep-link.test.ts` | 测试报告深链接 | `npm test` |
| `src/lib/validation/image-upload.test.ts` | 测试图片上传验证 | `npm test` |
| `src/lib/usage/build-usage-guide.test.ts` | 对客使用说明 API 载荷（无内部术语） | `npm test` |
| `src/lib/usage/usage-guide-customer.test.ts` | 对客使用说明五场景文案结构 | `npm test` |
| `src/lib/config/model-providers.test.ts` | 测试模型提供者配置 | `npm test` |
| `src/lib/zhipu/web-search.test.ts` | 测试智谱联网搜索 | `npm test` |
| `src/lib/zhipu/embedding.test.ts` | 测试智谱嵌入功能 | `npm test` |
| `src/lib/embedding/rerank.test.ts` | 测试嵌入重排功能 | `npm test` |
| `src/lib/embedding/settings.test.ts` | 测试嵌入设置 | `npm test` |
| `src/lib/scheduled/tick-logic.test.ts` | 测试定时任务逻辑 | `npm test` |
| `src/lib/l0/tushare-client.test.ts` | 测试 Tushare 客户端 | `npm test` |
| `src/lib/l0/web-fallback.test.ts` | 测试网络降级逻辑 | `npm test` |
| `src/lib/settings/user-memory.test.ts` | 测试用户记忆功能 | `npm test` |
| `src/harness/loop.test.ts` | 测试 Harness 循环 | `npm test` |
| `src/harness/context/compact.test.ts` | 测试上下文压缩 | `npm test` |
| `src/harness/context/compact-history.test.ts` | 测试历史压缩 | `npm test` |
| `src/harness/skills/loader.test.ts` | 测试 Skill 加载器 | `npm test` |
| `src/harness/tools/list_commands.test.ts` | 测试命令列表 | `npm test` |
| `src/harness/tools/router.test.ts` | 测试工具路由器 | `npm test` |
| `src/harness/planner/planner_rules.test.ts` | 测试 Planner 规则 | `npm test` |
| `src/harness/permission/check.test.ts` | 测试权限检查 | `npm test` |
| `src/harness/background/eligibility.test.ts` | 测试后台任务资格 | `npm test` |
| `src/harness/locks/eligibility.test.ts` | 测试锁机制 | `npm test` |

### 2. 验收测试（Acceptance Tests）

| 文件 | 用途 | 运行方式 |
|------|------|----------|
| `automation/tests/acceptance/prd.acceptance.test.ts` | PRD 核心验收点测试 | `npm run test:acceptance` |
| `automation/tests/acceptance/gaps.acceptance.test.ts` | PRD 缺口项验收测试 | `npm run test:gaps` |
| `automation/tests/fund/fund-knowledge.acceptance.test.ts` | 基金知识库验收测试 | `npm run test:acceptance` |
| `automation/tests/fund/echarts-skeleton.acceptance.test.ts` | ECharts 骨架验收测试 | `npm run test:acceptance` |
| `automation/tests/fund/fmt-convert.acceptance.test.ts` | 格式转换验收测试 | `npm run test:acceptance` |
| `automation/tests/portfolio/vision-parse.acceptance.test.ts` | 视觉解析验收测试 | `npm run test:acceptance` |
| `automation/tests/reports/markdown-render.acceptance.test.ts` | Markdown 渲染验收测试 | `npm run test:acceptance` |
| `automation/tests/chat/conversation-sidebar.acceptance.test.ts` | 对话侧栏：标题格式、搜索、置顶排序、重命名摘要 | `npm test -- automation/tests/chat/conversation-sidebar.acceptance.test.ts` |
| `automation/tests/chat/conversation-pin.acceptance.test.ts` | **单置顶互斥**：置顶 B 自动取消 A、取消置顶、排序 | `npm test -- automation/tests/chat/conversation-pin.acceptance.test.ts` |

### 3. CLI 工具（可复用）

| 文件 | 用途 | 运行方式 |
|------|------|----------|
| `automation/cli/verify-config.ts` | 配置验证（环境变量/数据库/模型） | `npx tsx automation/cli/verify-config.ts [all\|env\|db\|models]` |
| `automation/cli/probe-models.ts` | 模型探针 | `npm run probe:models` |
| `automation/cli/system-verify.ts` | 系统验证（含 206007 · l0_sync_log · 7-2-E2E） | `npm run verify:system` |
| `automation/cli/fund-report-e2e.ts` | 基金解读草稿 + FK-18 六类型/股债货回归 | `npm run fund:e2e-demo` |
| `e2e/fund-preview-smoke.spec.ts` | 基金 Preview ECharts 冒烟 | `npm run test:e2e:preview` |
| `automation/cli/init-data.ts` | 数据初始化 | `npm run data:init` |

### 3. 测试辅助工具

| 文件 | 用途 |
|------|------|
| `automation/tests/helpers/load-env.ts` | 加载环境变量 |
| `automation/tests/helpers/sse.ts` | SSE 流解析工具 |
| `automation/tests/helpers/supabase-test.ts` | Supabase 测试辅助函数 |
| `automation/tests/setup.ts` | 测试环境设置 |
| `automation/tests/stubs/server-only.ts` | 服务端模块 stub |

---

## 二、测试脚本索引

### 测试清单

| # | 测试类型 | 脚本名称 | 用途说明 | 覆盖范围 |
|---|----------|----------|----------|----------|
| 1 | 单元测试 | `npm test` | 运行所有单元测试 | 全部模块 |
| 2 | 验收测试 | `npm run test:acceptance` | 运行 PRD 验收测试 | 核心功能 |
| 3 | 缺口测试 | `npm run test:gaps` | 运行缺口项验收测试 | 缺口功能 |
| 4 | 全量测试 | `npm run test:all` | 运行所有测试 | 全部 |
| 5 | 系统验证 | `npm run verify:system` | 系统级验证 | 环境配置 |
| 6 | 模型探针 | `npm run probe:models` | 探测模型可用性 | 模型配置 |
| 7 | 注册表校验 | `python scripts/validate_registry.py` | 校验注册表格式 | 注册表 |

### 运行命令速查

```bash
# 运行所有单元测试
npm test

# 运行验收测试
npm run test:acceptance

# 运行缺口测试
npm run test:gaps

# 运行全量测试（单元 + 验收 + 缺口）
npm run test:all

# 系统验证
npm run verify:system

# 模型探针
npm run probe:models

# 注册表校验
python automation/scripts/validate_registry.py
```

---

## 三、测试覆盖矩阵

| 功能模块 | 单元测试 | 验收测试 | 缺口测试 |
|----------|----------|----------|----------|
| 聊天 (§5) | ✅ | ✅ | ✅ |
| 需求梳理 (§6) | ✅ | ✅ | ✅ |
| 资产配置 (§7) | ✅ | ✅ | ✅ |
| 持仓分析 (§8) | ✅ | ✅ | ✅ |
| 基金解读 (§9) | ✅ | ✅ | ✅ |
| 设置 (§2) | ✅ | ✅ | - |
| 报告 (§4) | ✅ | ✅ | - |
| 知识库 (§9.2) | ✅ | ✅ | ✅ |

---

## 四、测试数据管理

### 测试环境变量

测试需要以下环境变量（在 `.env.local` 中配置）：

- `SUPABASE_URL` - Supabase 项目 URL
- `SUPABASE_ANON_KEY` - Supabase 匿名密钥
- `MIMO_API_KEY` - Mimo API 密钥
- `ZHIPU_API_KEY` - 智谱 API 密钥

### 测试数据清理

测试会自动创建和清理测试数据，无需手动干预。

---

## 五、新增测试脚本规范

### 1. 单元测试

- 文件位置：`src/lib/**/*.test.ts` 或 `src/harness/**/*.test.ts`
- 命名规范：`{功能名}.test.ts`
- 必须覆盖核心逻辑和边界情况

### 2. 验收测试

- 文件位置：`automation/tests/**/*.acceptance.test.ts`
- 命名规范：`{功能名}.acceptance.test.ts`
- 必须对应 PRD 验收点

### 3. 添加到索引

新增测试脚本后，必须：
1. 更新本文件的测试脚本列表
2. 在 `automation/tests/acceptance/manifest.ts` 中添加验收用例（如适用）
3. 运行测试确保通过
