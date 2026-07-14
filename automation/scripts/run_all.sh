#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

bash "$ROOT/automation/scripts/run_acceptance.sh"

echo ""
echo "=== Production build ==="
npm run build

echo ""
echo "=== API smoke (optional, needs npm run dev) ==="
bash "$ROOT/automation/scripts/self_test.sh" --skip-unit-and-build
