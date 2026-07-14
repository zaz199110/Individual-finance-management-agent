$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $root

Write-Host "=== Bootstrap env ==="
& "$PSScriptRoot\bootstrap_env.ps1"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n=== Apply app core migration ==="
node "$PSScriptRoot\run-migrate.mjs"
if ($LASTEXITCODE -ne 0) {
  Write-Host "[WARN] apply_app_core failed — continuing if tables exist"
}

Write-Host "`n=== Unit tests ==="
npm test -- --run src
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n=== PRD gap tests ==="
npm test -- --run automation/tests/acceptance/gaps.acceptance.test.ts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n=== PRD acceptance (sequential) ==="
npm test -- --run automation/tests/acceptance/prd.acceptance.test.ts
exit $LASTEXITCODE
