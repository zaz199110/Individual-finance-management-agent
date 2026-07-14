param(
  [switch]$SkipUnitAndBuild
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $Root

$validate = Join-Path $PSScriptRoot "validate_registry.py"

if (-not $SkipUnitAndBuild) {
  Write-Host "==> 1/5 Registry validation"
  node (Join-Path $PSScriptRoot "run-python.mjs") $validate
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  Write-Host "==> 2/5 Source encoding check (UTF-8 / unclosed strings)"
  node (Join-Path $PSScriptRoot "check_source_encoding.mjs")
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  Write-Host "==> 3/5 Unit tests (vitest)"
  npm test
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  Write-Host "==> 4/5 Production build"
  npm run build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
  Write-Host "==> API smoke only (skipped unit + build)"
}

Write-Host "==> 5/5 API smoke (requires dev server on :3000)"
$devRunning = $false
$devPort = 3000
try {
  $r = Invoke-WebRequest -Uri "http://localhost:3000/api/settings/readiness" -UseBasicParsing -TimeoutSec 3
  $devRunning = $true
  Write-Host "  readiness:" $r.Content
} catch {
  try {
    $r301 = Invoke-WebRequest -Uri "http://localhost:3001/api/settings/readiness" -UseBasicParsing -TimeoutSec 3
    Write-Host "  WARN: dev is on :3001 but smoke expects :3000 — run npm run dev:clean"
    Write-Host "  readiness (3001):" $r301.Content
  } catch {
    Write-Host "  SKIP: dev server not running (run npm run dev:clean to start on :3000)"
  }
}

if ($devRunning) {
  $cmds = Invoke-WebRequest -Uri "http://localhost:3000/api/commands?scene=chat&slash_only=true" -UseBasicParsing
  Write-Host "  commands:" $cmds.Content.Substring(0, [Math]::Min(120, $cmds.Content.Length)) "..."
}

Write-Host "`n[OK] Self-test passed"
exit 0
