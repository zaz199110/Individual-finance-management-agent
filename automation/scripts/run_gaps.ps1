$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $root

Write-Host "=== PRD gap tests (sequential) ==="
npm test -- --run automation/tests/acceptance/gaps.acceptance.test.ts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n=== PRD core acceptance ==="
npm test -- --run automation/tests/acceptance/prd.acceptance.test.ts
exit $LASTEXITCODE
