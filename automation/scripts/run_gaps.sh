#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "=== PRD gap tests (sequential) ==="
npm test -- --run automation/tests/acceptance/gaps.acceptance.test.ts

echo ""
echo "=== PRD core acceptance ==="
npm test -- --run automation/tests/acceptance/prd.acceptance.test.ts
