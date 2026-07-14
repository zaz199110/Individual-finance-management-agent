# ============================================================
# 智能投顾助手 — 一键部署脚本（仅 Windows）
# 用法: powershell -ExecutionPolicy Bypass -File setup.ps1
# ============================================================
$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
Set-Location $Root

function Write-Step($msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-OK($msg) { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  [!] $msg" -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host "  [X] $msg" -ForegroundColor Red }

$Banner = @"
╔══════════════════════════════════════════════╗
║         智能投顾助手 · 一键部署              ║
║         平台：Windows 10 / 11                ║
╚══════════════════════════════════════════════╝
"@
Write-Host $Banner -ForegroundColor Green

# ---- 1. 检查前置条件 ----
Write-Step "1/6 检查前置条件"

$nodeVer = $null
try { $nodeVer = (node --version 2>&1).ToString() } catch {}
if (-not $nodeVer) { Write-Err "未检测到 Node.js，请从 https://nodejs.org 安装 (18+)"; exit 1 }
Write-OK "Node.js $nodeVer"

$npmVer = $null
try { $npmVer = (npm --version 2>&1).ToString() } catch {}
if (-not $npmVer) { Write-Err "未检测到 npm"; exit 1 }
Write-OK "npm $npmVer"

# ---- 2. 配置环境变量 ----
Write-Step "2/6 配置环境变量 (.env.local)"

if (Test-Path ".env.local") {
    Write-OK ".env.local 已存在，跳过创建"
} else {
    Copy-Item ".env.example" ".env.local" -ErrorAction Stop
    Write-OK "已从 .env.example 创建 .env.local"
    Write-Warn "请编辑 .env.local 填入你的 API 密钥，然后再次运行此脚本"
    Write-Host "  提示：如果只想快速体验（本地演示模式），仅需填入 DeepSeek Key"
    Write-Host "  编辑器：notepad .env.local"
    exit 0
}

# ---- 3. 安装依赖 ----
Write-Step "3/6 安装 Node.js 依赖"
npm install --legacy-peer-deps
Write-OK "依赖安装完成"

# ---- 4. 选择部署模式 ----
Write-Step "4/6 选择部署模式"
Write-Host "  [A] 本地演示（需 Docker Desktop）— 推荐首次使用"
Write-Host "  [B] 自有 Supabase 云端数据库"
$mode = Read-Host "  请输入 A 或 B (默认 A)"
if (-not $mode) { $mode = "A" }

if ($mode -eq "B" -or $mode -eq "b") {
    # ---- 路径 B：BYOK 云端 ----
    Write-Step "5/6 初始化知识库"
    npm run data:init
    Write-OK "知识库初始化完成"

    Write-Step "6/6 应用数据库迁移"
    npm run data:migrate
    Write-OK "数据库迁移完成"

    Write-Host ""
    Write-Host "┌────────────────────────────────────────┐" -ForegroundColor Green
    Write-Host "│  部署完成！                            │" -ForegroundColor Green
    Write-Host "│  启动：npm run dev                     │" -ForegroundColor Green
    Write-Host "│  打开：http://localhost:3000           │" -ForegroundColor Green
    Write-Host "│  设置页 → 我的数据 → 完成数据库连接     │" -ForegroundColor Green
    Write-Host "└────────────────────────────────────────┘" -ForegroundColor Green
} else {
    # ---- 路径 A：本地演示 ----
    Write-Step "5/6 检查 Docker Desktop"
    $dockerOk = $false
    try { docker info 2>&1 | Out-Null; $dockerOk = $true } catch {}
    if (-not $dockerOk) {
        Write-Err "未检测到 Docker Desktop 运行中，请先启动 Docker Desktop"
        exit 1
    }
    Write-OK "Docker Desktop 运行中"

    Write-Host "  正在启动本地 Supabase（首次可能需要下载镜像，约 2-5 分钟）..."
    npm run supabase:start
    Write-OK "本地 Supabase 启动完成"

    Write-Step "6/6 初始化数据"
    npm run supabase:sync-settings
    Write-OK "数据库设置同步完成"

    npm run data:init
    Write-OK "知识库初始化完成"

    Write-Host ""
    Write-Host "┌────────────────────────────────────────┐" -ForegroundColor Green
    Write-Host "│  部署完成！                            │" -ForegroundColor Green
    Write-Host "│  启动：npm run dev:clean               │" -ForegroundColor Green
    Write-Host "│  打开：http://localhost:3000           │" -ForegroundColor Green
    Write-Host "│  本地模式无需登录                      │" -ForegroundColor Green
    Write-Host "└────────────────────────────────────────┘" -ForegroundColor Green
}
