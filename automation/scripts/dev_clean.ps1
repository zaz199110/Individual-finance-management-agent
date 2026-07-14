# Prep for manual verification: stop stale dev, clear .next, start fresh dev on :3000.
param(
    [switch]$NoStart
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $Root
. "$PSScriptRoot\_encoding.ps1"

Write-Host "==> 1/3 Stop dev servers (3000, 3001)"
Stop-DevServerPorts

Write-Host "==> 2/3 Remove .next build cache"
if (Test-Path ".next") {
    Remove-Item -Recurse -Force ".next"
    Write-Host "  Removed .next"
} else {
    Write-Host "  .next not present (skip)"
}

if ($NoStart) {
    Write-Host "[OK] Ready — run: npm run dev"
    exit 0
}

Write-Host "==> 3/3 Start npm run dev (foreground)"
Write-Host "  Open http://localhost:3000"
npm run dev
