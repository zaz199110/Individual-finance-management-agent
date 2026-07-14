#!/usr/bin/env bash
# 已迁移至 automation/scripts/ — 请使用 npm run env:bootstrap
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec bash "$SCRIPT_DIR/../automation/scripts/bootstrap_env.sh" "$@"
