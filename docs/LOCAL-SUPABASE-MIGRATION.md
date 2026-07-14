# 云端 Supabase → 本地 Supabase（复制数据）

> 适用：本机开发、降低网络延迟；**Supabase 软件与 Docker 运行均免费**（模型 API 另计）。

## 当前环境检测结果

| 项 | 状态 |
|----|------|
| Docker Desktop | 已安装，**需手动启动**（托盘 Running 后再迁移） |
| Supabase CLI | 未全局安装；项目用 `npx supabase`（`package.json` 已加脚本） |
| 云端配置 | 已在 `.env.local` 中配置（迁移前会自动备份为 `.env.local.cloud.bak`） |

## 费用

- **本地 Supabase**：$0
- **Docker Desktop**：个人使用通常 $0
- **云端 Supabase**：迁移后应用改连本地；云端项目可保留作备份（免费档不删也不收费）

## 数据范围

| 会复制到本地 Postgres | 本来就在本机、不经过 Supabase |
|----------------------|------------------------------|
| 对话、消息、workflow_tasks | `data/fund-knowledge/` + `index.db` |
| profile / plan / holdings / 自选 | `data/reports/` 报告 md |
| L2 FAQ 向量（pgvector） | `data/runs/` 草稿 |

复制完成后是 **独立一份库**；云端不会自动同步，除非你再手动 dump/restore。

## 一键迁移（推荐）

1. **启动 Docker Desktop**，等到完全 Running  
2. 在项目根目录执行：

```powershell
npm run supabase:migrate-local
```

脚本会依次：

1. `supabase start` — 起本地 Postgres + Studio  
2. `supabase db reset` — 用 `supabase/migrations/` 建表  
3. 从 `.env.local` 的 `DATABASE_URL` **导出云端 data-only**  
4. 导入本地 `127.0.0.1:54322`  
5. 更新 `.env.local` 为本地 URL / anon / service_role  
6. 更新库内 `app_settings.database`（避免仍指向云端）

## 迁移后验收

1. 打开 Studio：http://127.0.0.1:54323 — 看 `conversations`、`messages` 等是否有数据  
2. `npm run supabase:sync-settings`（或迁移脚本已自动执行）— 同步 `database_settings.json` 与 `app_settings.database`  
3. `npm run dev:clean` — 应用启动时会自动探活数据库，**无需**在设置页手填 BYOK  
4. 可选 `npm run selftest`

## 常用命令

```powershell
npm run supabase:status    # 本地 URL、密钥
npx supabase stop          # 停本地栈（数据在 Docker volume 里）
npx supabase start         # 再启动
```

## 恢复连云端

```powershell
Copy-Item .env.local.cloud.bak .env.local -Force
npm run dev:clean
```

## 手动分步（脚本失败时）

```powershell
npx supabase start
npx supabase db reset --yes
npx supabase db dump --db-url "%DATABASE_URL%" --data-only --use-copy -f automation/tmp/cloud_data.sql
docker run --rm -v "${PWD}/automation/tmp/cloud_data.sql:/tmp/d.sql:ro" postgres:17 `
  psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f /tmp/d.sql
npx supabase status -o env
# 按输出更新 .env.local 的 SUPABASE_* 与 DATABASE_URL
```

## 注意事项

- 首次 `npx supabase` 会下载 CLI，需联网  
- 导入时若有个别扩展/权限告警，可在 Studio 核对核心表是否齐全  
- **勿把 `.env.local` 提交 Git**（含密钥）  
- 两个 `003_*.sql` migration 文件名并列；若 `db reset` 报 migration 冲突，需合并/重命名后再跑（已重命名为 `008_scheduled_and_trading_calendar.sql`）
