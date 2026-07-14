$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $root

& "$PSScriptRoot\run_acceptance.ps1"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n=== Production build ==="
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n=== API smoke (optional, needs npm run dev) ==="
& "$PSScriptRoot\self_test.ps1" -SkipUnitAndBuild
exit $LASTEXITCODE
