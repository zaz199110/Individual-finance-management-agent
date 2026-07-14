> [← PRD 索引](../PRD.md) · **附录 C：参考路径**

## 附录 C：参考文件全路径索引

> **需求仓根目录**：**`D:\CursorProjects\agent-demo\`**  
> **编码仓根目录**：**`D:\CursorProjects\agent-demo-app\`**（待建；正文仍可用 `{APP_ROOT}` 占位）  
> 复制到其他项目时：替换盘符/根目录名，**保持相对目录结构**。

### C.1 需求与规格

| 绝对路径 | 说明 |
|----------|------|
| `D:\CursorProjects\agent-demo\requirement\PRD.md` | **PRD 总索引**（文档树 + 模块清单） |
| `D:\CursorProjects\agent-demo\requirement\prd\CONVENTIONS.md` | **PRD 撰写规范**（单版本 · 引用优先） |
| `D:\CursorProjects\agent-demo\requirement\prd\appendix-e-conflicts-pending.md` | **待确认冲突**（拍板后删行） |
| `D:\CursorProjects\agent-demo\requirement\prd\00-overview.md` | §0 产品定位 |
| `D:\CursorProjects\agent-demo\requirement\prd\01-global-design.md` | §1 全局设计（IA、Preview 共用组件） |
| `D:\CursorProjects\agent-demo\requirement\prd\02-settings.md` | §2 设置（**总览**） |
| `D:\CursorProjects\agent-demo\requirement\prd\02-settings-models.md` | §2.2 模型五槽位 |
| `D:\CursorProjects\agent-demo\requirement\prd\02-settings-database.md` | §2.3 Supabase |
| `D:\CursorProjects\agent-demo\requirement\prd\02-settings-datasources.md` | §2.8 数据源 · Tushare / AKShare |
| `D:\CursorProjects\agent-demo\requirement\prd\02-settings-memory.md` | §2.4 聊天记忆 |
| `D:\CursorProjects\agent-demo\requirement\prd\03-data-architecture.md` | §3 数据架构 |
| `D:\CursorProjects\agent-demo\requirement\prd\04-my-reports.md` | §4.1 我的报告 **独立页 · 四 Tab** |
| `D:\CursorProjects\agent-demo\requirement\prd\04-scheduled-tasks.md` | §4.2 定时持仓分析 |
| `D:\CursorProjects\agent-demo\requirement\prd\04-reports-and-tasks.md` | §4 报告与定时（**Hub**） |
| `D:\CursorProjects\agent-demo\requirement\prd\05-chat.md` | §5 聊天（**Hub**） |
| `D:\CursorProjects\agent-demo\requirement\prd\05-chat-shared.md` | §5.1 聊天共有（全场景壳） |
| `D:\CursorProjects\agent-demo\requirement\prd\05-chat-qa.md` | §5.5 自由问答场景 |
| `D:\CursorProjects\agent-demo\requirement\prd\06-profile.md` | §6 需求梳理 |
| `D:\CursorProjects\agent-demo\requirement\prd\07-allocation-plan.md` | §7 资产配置 |
| `D:\CursorProjects\agent-demo\requirement\prd\08-portfolio.md` | §8 持仓分析 |
| `D:\CursorProjects\agent-demo\requirement\prd\09-fund.md` | §9 基金域（**Hub**） |
| `D:\CursorProjects\agent-demo\requirement\prd\09-fund-analysis.md` | §9.1 基金解析 |
| `D:\CursorProjects\agent-demo\requirement\prd\09-fund-knowledge.md` | §9.2 基金知识库 |
| `D:\CursorProjects\agent-demo\requirement\prd\09-fund-watchlist.md` | §9.3 我的自选 |
| `D:\CursorProjects\agent-demo\requirement\prd\appendix-c-paths.md` | 附录 C：路径索引 |
| `D:\CursorProjects\agent-demo\requirement\prd\appendix-d-decisions.md` | 附录 D：已定决项 |
| `D:\CursorProjects\agent-demo\requirement\prd\appendix-e-conflicts-pending.md` | 附录 E：待确认冲突 |
| `D:\CursorProjects\agent-demo\requirement\README.md` | 需求目录说明、协作约定 |
| `D:\CursorProjects\agent-demo\requirement\HARNESS.md` | Agent Harness 标准与审查清单（含 §6 压缩、§7 重注入） |
| `D:\CursorProjects\agent-demo\requirement\CODING.md` | 编码仓实现约束 |
| `D:\claudecode-project\learn-claude-code\` | Harness 教学参考（s01–s20；**s08 上下文压缩**必读） |
| `D:\CursorProjects\agent-demo\requirement\config\env.template` | 环境变量模板（无密钥） |
| `D:\CursorProjects\agent-demo\requirement\config\secrets.env` | 本地真实密钥（**不提交 Git**） |
| `D:\CursorProjects\agent-demo\requirement\config\model-defaults.md` | 模型槽位建议默认值 |
| `D:\CursorProjects\agent-demo\requirement\config\README.md` | config 使用说明 |

### C.1a 面试 · 演示 · 答辩（`需求仓/interview-qa/`）

| 绝对路径 | 说明 |
|----------|------|
| `D:\CursorProjects\agent-demo\interview-qa\README.md` | **本目录索引**（录屏、待办、答辩材料） |
| `D:\CursorProjects\agent-demo\interview-qa\00-demo-interview-todo.md` | Demo 收尾清单 |
| `D:\CursorProjects\agent-demo\interview-qa\01-fund-knowledge-retrieval-strategy.md` | 基金检索选型答辩 |
| `D:\CursorProjects\agent-demo\interview-qa\02-optimization-roadmap.md` | 可优化方向（待 demo 后定稿） |
| `D:\CursorProjects\agent-demo\interview-qa\demo\demo-walkthrough.mp4` | 演示录屏（待录制） |

### C.2 调研

| 绝对路径 | 说明 |
|----------|------|
| `D:\CursorProjects\agent-demo\research\README.md` | 调研目录索引 |
| `D:\CursorProjects\agent-demo\research\07-mythinking.md` | **未定事项** |
| `D:\CursorProjects\agent-demo\research\01-product-benchmark.md` | 五产品对标 |
| `D:\CursorProjects\agent-demo\research\02-anthropic-wm-workflows.md` | Anthropic WM Skill |
| `D:\CursorProjects\agent-demo\research\04-scenario-driven-product-trial.md` | 场景体验清单 |
| `D:\CursorProjects\agent-demo\research\05-anthropic-kyc-onboarding-workflows.md` | KYC 合规参考 |
| `D:\CursorProjects\agent-demo\research\06-Value-cell-research.md` | ValueCell 编排参考 |
| `D:\CursorProjects\agent-demo\research\08-Trading-Agent.md` | TradingAgents 多 Agent 参考 |
| `D:\CursorProjects\agent-demo\research\09-wealth-management.md` | **WM 插件体验**（financial-plan 等提问与输出） |
| `D:\CursorProjects\agent-demo\research\10-Anthropic-financial-services-plugins.md` | **Anthropic 金融插件全套**架构说明 |

### C.3 设计

| 绝对路径 | 说明 |
|----------|------|
| `D:\CursorProjects\agent-demo\design\type\notion\DESIGN.md` | Notion 光明版设计规范 |
| `D:\CursorProjects\agent-demo\design\type\notion\preview.html` | 光明版预览 |
| `D:\CursorProjects\agent-demo\design\type\notion\preview-dark.html` | 暗色预览（本期不用） |
| `D:\CursorProjects\agent-demo\design\type\notion\README.md` | 设计目录说明 |

### C.4 参考工程

| 绝对路径 | 说明 |
|----------|------|
| `D:\CursorProjects\agent-demo\reference-project\financial-services-plugins\` | Claude 官方金融插件本地副本；Skill/Command 编写母版（§0.11） |
| `D:\CursorProjects\agent-demo\reference-project\financial-services-plugins\ai_analysis\APPENDIX_A_SKILL_COMMAND_PLAIN.md` | 全垂直 Skill/Command **通俗详解** |
| `D:\CursorProjects\agent-demo\reference-project\financial-services-plugins\ai_analysis\AI_MODEL_USAGE_ANALYSIS.md` | 插件内模型用法分析 |
| `D:\CursorProjects\agent-demo\reference-project\financial-services-plugins\test\` | **徐美丽**报告样例（需求梳理/资产配置/持仓/报告） |
| `D:\CursorProjects\agent-demo\reference-project\financial-services-plugins\test\徐美丽_客户画像.md` | 投资需求报告 md 版式参考（历史文件名含「客户画像」· §6.6） |
| `D:\CursorProjects\agent-demo\reference-project\ask-wealth\ask-wealth-function.xmind` | **问财**四场景体验脑图 |
| `D:\CursorProjects\agent-demo\reference-project\ant-fortune\ant-fortune-function.xmind` | **蚂小财**四场景体验脑图 |
| `D:\CursorProjects\agent-demo\reference-project\TradingAgents\` | TradingAgents 源码 |
| `D:\CursorProjects\agent-demo\reference-project\TradingAgents\ai_analysis\AI_MODEL_USAGE_ANALYSIS.md` | 模型用法分析 |
| `D:\CursorProjects\agent-demo\reference-project\valuecell\` | ValueCell 源码（可选本地跑） |
| `D:\CursorProjects\Pi-Agent\codegraph\` | **CodeGraph 源码母版**（ContextBuilder · explore · budget） |
| `D:\CursorProjects\Pi-Agent\ai_Analysis\codegraph\上下文工程拆解.md` | 上下文工程人话拆解（CG-01） |
| `D:\CursorProjects\agent-demo\reference-project\learn-from-codeGraph.md` | CodeGraph → 个人知识库迁移笔记 |
| `D:\CursorProjects\agent-demo\reference-project\local-memory-wiki\` | 扫目录、文档转 md、增量 hash（KB-01 转换管线） |

### C.5 编码实现仓（待建）

| 绝对路径 | 说明 |
|----------|------|
| `D:\CursorProjects\agent-demo-app\src\harness\` | planner、scenes、infra、tools、context、prompt、tasks、background、runs、hooks、verify、loop |
| `D:\CursorProjects\agent-demo-app\src\harness\prompt\` | s10 + s10a：blocks / normalize / assemble |
| `D:\CursorProjects\agent-demo-app\src\harness\tasks\` | s12 任务图落盘与 `workflow_tasks` 同步 |
| `D:\CursorProjects\agent-demo-app\src\harness\background\` | s13 后台执行与 `job_done` |
| `D:\CursorProjects\agent-demo-app\src\app\api\chat\` | 聊天 SSE 薄路由 |
| `D:\CursorProjects\agent-demo\agents\registry.yaml` | **Command 单一数据源**（复制至编码仓；`/ ` 补全 + 使用说明同源） |
| `D:\CursorProjects\agent-demo\docs\DEPLOY.md` | 部署与基金域验收 checklist |
| `D:\CursorProjects\agent-demo\scripts\validate_registry.py` | 校验 registry 与 PRD [shared §5.3.9a](./05-chat-shared.md) |
| `D:\CursorProjects\agent-demo-app\agents\registry.yaml` | 编码仓 Agent / Skill / Command 注册表（自上一行复制） |
| `D:\CursorProjects\agent-demo-app\agents\*.md` | Agent 系统提示（对标官方 `agents/*.md`） |
| `D:\CursorProjects\agent-demo-app\skills\{scene}\*.md` | 场景 Skill（对标官方 `skills/*/SKILL.md`） |
| `D:\CursorProjects\agent-demo-app\supabase\migrations\*.sql` | 数据库 migration |
| `D:\CursorProjects\agent-demo-app\data\fund-knowledge\` | 单基金知识库根目录（[knowledge §9.2.0a](./09-fund-knowledge.md)） |
| `D:\CursorProjects\agent-demo-app\data\fund-knowledge\index.db` | FTS5 搜索索引 |
| `D:\CursorProjects\agent-demo-app\scripts\fund-knowledge\` | CLI：`explore` / `index` / 转换管线 |
| `D:\CursorProjects\agent-demo-app\src\harness\infra\fund_knowledge\` | explore · ContextBuilder · index |
| `D:\CursorProjects\agent-demo-app\src\harness\infra\fund_knowledge\context\` | 情报卡片排版 · `getExploreOutputBudget` |
| `D:\CursorProjects\agent-demo-app\src\harness\infra\fund_knowledge\index\chunks.ts` | `knowledge_chunks` + FTS5（FK-CITE） |
| `D:\CursorProjects\agent-demo-app\src\app\api\fund-knowledge\` | 知识库管理页 API |
| `D:\CursorProjects\agent-demo-app\docs\DEPLOY.md` | 编码仓部署引导（可自需求仓 `docs/DEPLOY.md` 复制） |
| `D:\CursorProjects\agent-demo\requirement\docs\samples\mermaid-smoke.mmd` | 需求仓 smoke 样例（编码仓同步至 `docs/samples/`） |
| `D:\CursorProjects\agent-demo\requirement\docs\samples\fund-analysis-report-sample.md` | **单只基金解读报告 · 对客样例**（FK-18 · **3× `echarts`** · 无雷达 · 无「本章回答」） |
| `D:\CursorProjects\agent-demo\requirement\docs\samples\fund-analysis-report-spec.md` | 单只基金报告 **实现说明**（Agent / 研发 · **§6 ECharts 契约**） |
| `D:\CursorProjects\agent-demo\requirement\docs\samples\portfolio-report-blueprint.md` | 持仓分析报告 **填空蓝图**（定稿 2026-06-22） |
| `D:\CursorProjects\agent-demo\requirement\docs\samples\portfolio-analysis-report-sample-variant-a.md` | **持仓分析报告 · 变体 A**（无方案 · 2× `echarts` · 无「本章回答」） |
| `D:\CursorProjects\agent-demo\requirement\docs\samples\portfolio-analysis-report-sample.md` | **持仓分析报告 · 变体 B**（对照方案 · 3× `echarts`） |
| `D:\CursorProjects\agent-demo\requirement\docs\samples\portfolio-analysis-report-spec.md` | 持仓分析报告 **实现说明** |
| `D:\CursorProjects\agent-demo\requirement\docs\samples\holdings-propose-payload.examples.json` | 持仓 `holdings_propose` JSON 样例 |
| `D:\CursorProjects\agent-demo\skills\portfolio\report.template.zh.md` | 持仓分析报告 **Agent 模板**（RPT-PORT-TPL） |
| `D:\CursorProjects\agent-demo\skills\portfolio\portfolio_skill.md` | 持仓录入与分析编排 Skill |
| `D:\CursorProjects\agent-demo\skills\portfolio\portfolio_workflow_tasks.zh.yaml` | 持仓分析 **任务图**（阶段条） |
| `D:\CursorProjects\agent-demo\skills\portfolio\portfolio_verify.yaml` | 持仓提议 + 报告 **Verify 规则** |
| `D:\CursorProjects\agent-demo\seed\migrations\005_holdings_versions.sql` | `holdings_versions` 表迁移 |
| `D:\CursorProjects\agent-demo\requirement\docs\samples\plan-allocation-report-blueprint.md` | **五 goal_type 填空蓝图**（定稿 · 初筛/Hook/LLM/§六） |
| `D:\CursorProjects\agent-demo\requirement\docs\samples\plan-allocation-report-sample.md` | **资产配置方案 · 对客样例**（退休养老 · **3× `echarts`**） |
| `D:\CursorProjects\agent-demo\requirement\docs\samples\plan-allocation-report-spec.md` | 资产配置方案 **实现说明**（Agent / 研发 · PL-REPORT-EC · Verify） |
| `D:\CursorProjects\agent-demo\skills\fund\report.template.zh.md` | 基金解读 **Agent 模板入口**（RPT-FUND-TPL · 不替代 spec/sample） |
| `D:\CursorProjects\agent-demo\skills\plan\report.template.zh.md` | 投资规划书 **Agent 模板入口**（RPT-PLAN-TPL · 不替代 spec/sample） |
| `D:\CursorProjects\agent-demo\skills\profile\report.template.zh.md` | 投资需求 **Agent 模板**（RPT-PROFILE-TPL · **无 echarts**） |
| `D:\CursorProjects\agent-demo\skills\profile\profile_skill.md` | 需求梳理编排 Skill（客户信息 + 投资需求） |
| `D:\CursorProjects\agent-demo\skills\profile\profile_verify.yaml` | 客户信息 / 约束 / 报告 **Verify 规则** |
| `D:\CursorProjects\agent-demo\skills\profile\profile_workflow_tasks.zh.yaml` | 需求梳理 **任务图**（阶段条） |
| `D:\CursorProjects\agent-demo\requirement\docs\samples\profile-propose-payload.examples.json` | `profile_propose` JSON 样例 |
| `D:\CursorProjects\agent-demo\seed\migrations\006_profile_core.sql` | `profile_versions` · 约束主表 · 修订表 |
| `D:\CursorProjects\agent-demo\seed\migrations\007_report_index.sql` | `report_index` 四类报告索引 |
| `D:\CursorProjects\agent-demo\skills\fund\fund_skill.md` | 基金解读编排 Skill（简答 + 完整报告） |
| `D:\CursorProjects\agent-demo\requirement\docs\samples\echarts-smoke.json` | ECharts Option JSON 片段 |
| `D:\CursorProjects\agent-demo\requirement\docs\samples\echarts-smoke-test.md` | ECharts 单图冒烟 md |
| `D:\CursorProjects\agent-demo\requirement\docs\samples\preview-report.html` | **开发期** Markdown+ECharts 预览（逻辑对齐 §1.3.4 组件） |
| `D:\CursorProjects\agent-demo\requirement\docs\samples\open-preview.cmd` | 一键 localhost 打开 preview-report |
| `D:\CursorProjects\agent-demo\.crossnote\` | MPE 可选配置（非产品 Preview） |
| `D:\CursorProjects\agent-demo-app\src\components\report-markdown-preview\` | **`ReportMarkdownPreview` 共用组件**（编码仓 · PREVIEW-01） |
| `D:\CursorProjects\agent-demo-app\docs\samples\mermaid-smoke.mmd` | 编码仓 Mermaid 安装 smoke 样例图 |
| `D:\CursorProjects\agent-demo-app\data\reports\{plan\|portfolio\|fund}\` | 报告 md **定稿**目录 |
| `D:\CursorProjects\agent-demo-app\data\runs\{conversation_id}\{run_id}\` | s18 Run Workspace（草稿与中间文件） |
| `D:\CursorProjects\agent-demo-app\src\harness\runs\` | 分配 `run_id`、定稿搬运 |

---

