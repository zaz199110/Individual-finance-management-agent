#!/usr/bin/env bash
# 启动 Claude Code CLI 并路由到 DeepSeek v4-pro
# 使用前请先设置环境变量：
#   export ANTHROPIC_AUTH_TOKEN="sk-your-deepseek-key"
# 用法：./scripts/start-claude-deepseek.sh [extra-claude-args...]

set -euo pipefail

if [ -z "${ANTHROPIC_AUTH_TOKEN:-}" ]; then
  echo "错误：请先设置 ANTHROPIC_AUTH_TOKEN 环境变量：export ANTHROPIC_AUTH_TOKEN='sk-your-deepseek-key'" >&2
  exit 1
fi
export ANTHROPIC_BASE_URL="https://api.deepseek.com/anthropic"
export ANTHROPIC_MODEL="deepseek-v4-pro[1m]"
export ANTHROPIC_DEFAULT_OPUS_MODEL="deepseek-v4-pro[1m]"
export ANTHROPIC_DEFAULT_SONNET_MODEL="deepseek-v4-pro[1m]"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="deepseek-v4-flash"
export CLAUDE_CODE_SUBAGENT_MODEL="deepseek-v4-flash"
export CLAUDE_CODE_EFFORT_LEVEL="max"

# 优先使用项目本地安装的 claude-code，否则用全局 claude
if command -v claude >/dev/null 2>&1; then
  exec claude "$@"
else
  echo "错误：找不到 claude 命令。请先安装 Claude Code CLI：" >&2
  echo "  npm install -g @anthropic-ai/claude-code" >&2
  exit 1
fi
