# Stop Next.js dev servers on ports 3000 / 3001.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_encoding.ps1"

Write-Host "==> Stopping dev servers (ports 3000, 3001)"
Stop-DevServerPorts
Write-Host "[OK] Ports released"
