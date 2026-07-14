#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

SKIP_UNIT_AND_BUILD=false
if [[ "${1:-}" == "--skip-unit-and-build" ]]; then
  SKIP_UNIT_AND_BUILD=true
fi

VALIDATE="$ROOT/automation/scripts/validate_registry.py"
RUN_PY="node $ROOT/automation/scripts/run-python.mjs"

if [[ "$SKIP_UNIT_AND_BUILD" == "false" ]]; then
  echo "==> 1/4 Registry validation"
  $RUN_PY "$VALIDATE"

  echo "==> 2/4 Unit tests (vitest)"
  npm test

  echo "==> 3/4 Production build"
  npm run build
else
  echo "==> API smoke only (skipped unit + build)"
fi

echo "==> 4/4 API smoke (requires dev server on :3000)"
if curl -sf --max-time 3 "http://localhost:3000/api/settings/readiness" >/dev/null 2>&1; then
  echo "  readiness:" "$(curl -sf http://localhost:3000/api/settings/readiness)"
  cmds="$(curl -sf 'http://localhost:3000/api/commands?scene=chat&slash_only=true')"
  echo "  commands:" "${cmds:0:120}" "..."
else
  echo "  SKIP: dev server not running (start with npm run dev to enable smoke tests)"
fi

echo "self_test done"
