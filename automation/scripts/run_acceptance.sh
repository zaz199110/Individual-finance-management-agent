#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "=== Bootstrap env ==="
bash "$ROOT/automation/scripts/bootstrap_env.sh"

echo ""
echo "=== Apply app core migration ==="
if ! node "$ROOT/automation/scripts/run-migrate.mjs"; then
  echo "[WARN] apply_app_core failed — continuing if tables exist"
fi

echo ""
echo "=== Unit tests ==="
npm test -- --run src

echo ""
echo "=== PRD gap tests ==="
npm test -- --run automation/tests/acceptance/gaps.acceptance.test.ts

echo ""
echo "=== PRD acceptance (sequential) ==="
npm test -- --run automation/tests/acceptance/prd.acceptance.test.ts
