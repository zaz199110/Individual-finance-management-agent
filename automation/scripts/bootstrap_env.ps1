$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$dest = Join-Path $root ".env.local"

$sources = @(
  (Join-Path $root "requirement\config\secrets.env"),
  (Join-Path (Split-Path $root -Parent) "agent-demo\requirement\config\secrets.env")
)

$src = $null
foreach ($p in $sources) {
  if (Test-Path $p) { $src = $p; break }
}

if (-not $src) {
  Write-Error "secrets.env not found"
  exit 1
}

Copy-Item -Path $src -Destination $dest -Force

$patch = @{
  "MIMO_API_URL" = "https://token-plan-cn.xiaomimimo.com/anthropic"
  "MIMO_MODEL_NAME" = "mimo-v2.5"
  "MIMO_API_PROTOCOL" = "anthropic"
  "PRIMARY_REASONING_PROVIDER" = "mimo"
  "PRIMARY_DEEP_PROVIDER" = "mimo"
  "PRIMARY_VISION_PROVIDER" = "mimo"
  "PRIMARY_WEB_PROVIDER" = "zhipu"
  "ZHIPU_WEB_API_URL" = "https://open.bigmodel.cn/api"
  "ZHIPU_WEB_SEARCH_ENGINE" = "search_std"
  "ZHIPU_EMBEDDING_API_URL" = "https://open.bigmodel.cn/api/paas/v4"
  "ZHIPU_EMBEDDING_MODEL" = "embedding-3"
}

$lines = Get-Content $dest -Encoding UTF8 | Where-Object {
  $line = $_
  $drop = $false
  foreach ($key in $patch.Keys) {
    if ($line -match "^$key=") { $drop = $true; break }
  }
  -not $drop
}

foreach ($key in $patch.Keys) {
  $lines += "$key=$($patch[$key])"
}

Set-Content -Path $dest -Value $lines -Encoding UTF8
Write-Host "bootstrapped .env.local (Mimo v2.5 + Zhipu Search-Std + Embedding-3)"
