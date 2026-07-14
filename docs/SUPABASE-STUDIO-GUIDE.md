# 本地 Supabase Studio 使用指南

## 打开 Studio

1. 确保 Docker Desktop 在运行
2. 项目根目录执行：`npm run supabase:status`（或 `npx supabase status`）
3. 浏览器打开：**http://127.0.0.1:54323**

本地 Studio 无需登录，数据只在你的电脑上。

## 看表结构（推荐路径）

### 方式 A：Table Editor（最直观）

1. 左侧 **Table Editor**
2. 顶部 schema 选 **`public`**
3. 点表名（如 `conversations`、`messages`）
4. 右侧 **Definition** / 列头可看到字段类型
5. 若 migration 写了 `COMMENT ON`，部分版本在列详情里显示 **Description**（中文说明）

### 方式 B：Database → Schema Visualizer

1. 左侧 **Database** → **Schema Visualizer**
2. 查看表之间外键关系（对话 → 消息 → workflow_tasks 等）

### 方式 C：SQL Editor 查注释

在 **SQL Editor** 运行：

```sql
SELECT
  c.table_name,
  obj_description(format('%I.%I', c.table_schema, c.table_name)::regclass, 'pg_class') AS table_comment,
  c.column_name,
  col_description(format('%I.%I', c.table_schema, c.table_name)::regclass, c.ordinal_position) AS column_comment
FROM information_schema.columns c
WHERE c.table_schema = 'public'
ORDER BY c.table_name, c.ordinal_position;
```

可导出结果，作为「字段字典」。

## 本项目的表分组（public）

| 分组 | 表 |
|------|-----|
| 对话 | `conversations`, `messages`, `workflow_tasks`, `background_jobs`, `propose_artifacts`, `workflow_locks` |
| 设置 | `model_settings`, `app_settings` |
| 需求梳理 | `profile_versions`, `investment_goal_constraints`, `goal_constraint_revisions` |
| 资产配置 | `allocation_plans` |
| 持仓 | `holdings_versions` |
| 报告 | `report_index` |
| 基金 | `fund_watchlist`, `fund_semantic_entries` |
| 定时 | `trading_calendar`, `scheduled_jobs`, `scheduled_job_runs` |

字段权威规格见 PRD：`requirement/prd/03-data-architecture.md` 及各模块 PRD 字段节。

## 看数据

- **Table Editor** → 选表 → 浏览/筛选行
- 例：`conversations` 应有侧栏对话；`messages` 为消息正文

## 常用 CLI

```powershell
npm run supabase:status   # Studio URL、API URL、密钥
npx supabase stop         # 停止本地栈（数据在 Docker volume）
npx supabase start        # 再启动
```

## 恢复连云端

```powershell
Copy-Item .env.local.cloud.bak .env.local -Force
npm run dev:clean
```
