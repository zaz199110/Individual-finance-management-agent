# 启动 Claude Code CLI 并路由到 DeepSeek v4-pro
# 使用前请先设置环境变量：
#   $env:ANTHROPIC_AUTH_TOKEN = "sk-your-deepseek-key"
# 用法（PowerShell）: .\scripts\start-claude-deepseek.ps1
# 用法（CMD）       : powershell -ExecutionPolicy Bypass -File .\scripts\start-claude-deepseek.ps1

if (-not $env:ANTHROPIC_AUTH_TOKEN) {
  Write-Error "请先设置 ANTHROPIC_AUTH_TOKEN 环境变量：`$env:ANTHROPIC_AUTH_TOKEN = 'sk-your-deepseek-key'"
  exit 1
}
$env:ANTHROPIC_BASE_URL = "https://api.deepseek.com/anthropic"
$env:ANTHROPIC_MODEL = "deepseek-v4-pro[1m]"
$env:ANTHROPIC_DEFAULT_OPUS_MODEL = "deepseek-v4-pro[1m]"
$env:ANTHROPIC_DEFAULT_SONNET_MODEL = "deepseek-v4-pro[1m]"
$env:ANTHROPIC_DEFAULT_HAIKU_MODEL = "deepseek-v4-flash"
$env:CLAUDE_CODE_SUBAGENT_MODEL = "deepseek-v4-flash"
$env:CLAUDE_CODE_EFFORT_LEVEL = "max"

$claude = Get-Command claude -ErrorAction SilentlyContinue
if (-not $claude) {
  Write-Error "找不到 claude 命令。请先安装 Claude Code CLI：npm install -g @anthropic-ai/claude-code"
  exit 1
}

& $claude.Source @args
