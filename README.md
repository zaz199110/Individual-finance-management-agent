# 智能投顾助手

> AI 基金理财顾问应用 — Next.js + Supabase + TypeScript

## 环境要求

- Node.js 18+（推荐 20+）
- npm 9+
- Docker Desktop（仅本地演示模式）
- Python 3.9+（可选，高级功能需要）

## 快速开始

```bash
# 1. 复制配置文件
cp .env.example .env.local
# 编辑 .env.local 填入你的 API 密钥

# 2. 安装依赖
npm install --legacy-peer-deps

# 3. 启动数据库（本地演示模式，需 Docker）
npm run supabase:start

# 4. 同步设置
npm run supabase:sync-settings

# 5. 初始化数据
npm run data:init

# 6. 启动开发服务器
npm run dev
```

应用启动后访问 http://localhost:3000

## 部署模式

| 模式 | 说明 | 需要 Docker |
|------|------|-------------|
| 本地演示 | 本机 Supabase 容器 | 是 |
| 云端数据库 | 使用已有 Supabase 项目 | 否 |

在 `.env.local` 中设置 `SUPABASE_URL` 切换模式：
- 本地演示：`SUPABASE_URL=http://127.0.0.1:54321`
- 云端：`SUPABASE_URL=https://your-project.supabase.co`

## 技术栈

- **框架**: Next.js 15 + React 19
- **数据库**: Supabase (PostgreSQL)
- **样式**: Tailwind CSS 4
- **图表**: ECharts
- **测试**: Vitest + Playwright
- **类型**: TypeScript 5.8

## 开发命令

| 命令 | 用途 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产构建 |
| `npm test` | 运行单元测试 |
| `npm run test:e2e` | 运行端到端测试 |

## 环境变量

参考 `.env.example` 配置以下变量：
- `SUPABASE_URL` - Supabase 项目 URL
- `SUPABASE_ANON_KEY` - Supabase 匿名密钥
- `LLM_API_KEY` - 大语言模型 API 密钥
- `APP_SECRET` - 应用密钥

## License

MIT
