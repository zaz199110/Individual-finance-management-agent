#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

SRC=""
for p in "$ROOT/requirement/config/secrets.env" "$(dirname "$ROOT")/agent-demo/requirement/config/secrets.env"; do
  if [[ -f "$p" ]]; then SRC="$p"; break; fi
done

if [[ -z "$SRC" ]]; then
  echo "secrets.env not found" >&2
  exit 1
fi

cp "$SRC" "$ROOT/.env.local"

patch_keys=(
  "MIMO_API_URL=https://token-plan-cn.xiaomimimo.com/anthropic"
  "MIMO_MODEL_NAME=mimo-v2.5"
  "MIMO_API_PROTOCOL=anthropic"
  "PRIMARY_REASONING_PROVIDER=mimo"
  "PRIMARY_DEEP_PROVIDER=mimo"
  "PRIMARY_VISION_PROVIDER=mimo"
  "PRIMARY_WEB_PROVIDER=zhipu"
  "ZHIPU_WEB_API_URL=https://open.bigmodel.cn/api"
  "ZHIPU_WEB_SEARCH_ENGINE=search_std"
  "ZHIPU_EMBEDDING_API_URL=https://open.bigmodel.cn/api/paas/v4"
  "ZHIPU_EMBEDDING_MODEL=embedding-3"
)

tmp="$(mktemp)"
grep -v -E '^(MIMO_API_URL|MIMO_MODEL_NAME|MIMO_API_PROTOCOL|PRIMARY_REASONING_PROVIDER|PRIMARY_DEEP_PROVIDER|PRIMARY_VISION_PROVIDER|PRIMARY_WEB_PROVIDER|ZHIPU_WEB_API_URL|ZHIPU_WEB_SEARCH_ENGINE|ZHIPU_EMBEDDING_API_URL|ZHIPU_EMBEDDING_MODEL)=' "$ROOT/.env.local" > "$tmp" || true
{
  cat "$tmp"
  printf '%s\n' "${patch_keys[@]}"
} > "$ROOT/.env.local"
rm -f "$tmp"

echo "bootstrapped .env.local (Mimo v2.5 + Zhipu Search-Std + Embedding-3)"
