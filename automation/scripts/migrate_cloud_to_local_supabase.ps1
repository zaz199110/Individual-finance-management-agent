# Cloud Supabase -> local Supabase: schema, data copy, .env.local update
# Requires Docker Desktop running
# Usage: npm run supabase:migrate-local

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "_encoding.ps1")

$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $root

function Require-Docker {
  docker info *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker is not running. Start Docker Desktop, then run: npm run supabase:migrate-local"
  }
}

function Read-DotEnv([string]$path) {
  $map = @{}
  if (-not (Test-Path $path)) { return $map }
  foreach ($line in ((Read-Utf8File $path) -split "`r?`n")) {
    $t = $line.Trim()
    if (-not $t -or $t.StartsWith("#")) { continue }
    $i = $t.IndexOf("=")
    if ($i -lt 1) { continue }
    $k = $t.Substring(0, $i).Trim()
    $v = $t.Substring($i + 1).Trim()
    if ($v.StartsWith('"') -and $v.EndsWith('"')) { $v = $v.Substring(1, $v.Length - 2) }
    $map[$k] = $v
  }
  return $map
}

function Write-DotEnvKeys([string]$path, [hashtable]$updates) {
  $lines = [System.Collections.Generic.List[string]]@()
  if (Test-Path $path) {
    foreach ($line in ((Read-Utf8File $path) -split "`r?`n")) { [void]$lines.Add($line) }
  }

  foreach ($key in $updates.Keys) {
    $val = $updates[$key]
    $pattern = "^$([regex]::Escape($key))="
    $idx = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
      if ($lines[$i] -match $pattern) { $idx = $i; break }
    }
    $newLine = "$key=$val"
    if ($idx -ge 0) { $lines[$idx] = $newLine }
    else { $lines.Add($newLine) }
  }
  Write-Utf8File $path ($lines -join "`n")
}

function Invoke-Supabase([string[]]$SupabaseArgs) {
  & npx --yes supabase @SupabaseArgs
  if ($LASTEXITCODE -ne 0) { throw "supabase $($SupabaseArgs -join ' ') failed (exit $LASTEXITCODE)" }
}

Require-Docker

$envFile = Join-Path $root ".env.local"
$envMap = Read-DotEnv $envFile
$cloudDbUrl = $envMap["DATABASE_URL"]
if (-not $cloudDbUrl) {
  Write-Error "Missing DATABASE_URL in .env.local"
}

# Supabase CLI parses .env.local and chokes on UTF-8 BOM / non-ASCII; hide during CLI steps.
$envHidePath = Join-Path $root ".env.local.supabase-hide"
if (Test-Path $envFile) {
  if (Test-Path $envHidePath) { Remove-Item $envHidePath -Force }
  Rename-Item $envFile $envHidePath -Force
}

function Restore-EnvFile {
  if (Test-Path $envHidePath) {
    if (Test-Path $envFile) { Remove-Item $envFile -Force }
    Rename-Item $envHidePath $envFile -Force
  }
}

try {

Write-Host "==> 1/6 Starting local Supabase..."
Invoke-Supabase @("start")

Write-Host "==> 2/6 Applying migrations (local empty schema)..."
Invoke-Supabase @("db", "reset", "--yes")

$tmpDir = Join-Path $root "automation\tmp"
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
$dumpFile = Join-Path $tmpDir "cloud_data.sql"

Write-Host "==> 3/6 Dumping cloud data (public schema only)..."
$dbContainer = "supabase_db_agent-demo-coding"
docker exec $dbContainer pg_dump $cloudDbUrl `
  --data-only --no-owner --no-privileges `
  --schema=public `
  --exclude-table-data=public.model_settings `
  --exclude-table-data=public.scheduled_jobs `
  -f /tmp/cloud_data.sql
if ($LASTEXITCODE -ne 0) {
  Write-Error "Cloud dump failed. Check DATABASE_URL and network."
}
docker cp "${dbContainer}:/tmp/cloud_data.sql" $dumpFile
docker exec $dbContainer rm -f /tmp/cloud_data.sql *> $null

if (-not (Test-Path $dumpFile) -or (Get-Item $dumpFile).Length -lt 10) {
  Write-Error "Cloud dump failed or empty. Check DATABASE_URL and network."
}

Write-Host "==> 4/6 Importing data into local Postgres..."
$localDbInternal = "postgresql://postgres:postgres@127.0.0.1:5432/postgres"
$localDbUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
docker cp $dumpFile "${dbContainer}:/tmp/cloud_data.sql"
docker exec $dbContainer psql $localDbInternal -v ON_ERROR_STOP=0 -f /tmp/cloud_data.sql
docker exec $dbContainer rm -f /tmp/cloud_data.sql *> $null
Write-Warning "Review import output above; verify core tables in Studio if needed."

Write-Host "==> 5/6 Reading local API URL and keys..."
$statusEnv = & npx --yes supabase status -o env 2>$null
if ($LASTEXITCODE -ne 0) { throw "supabase status failed" }
$local = @{}
foreach ($line in $statusEnv) {
  if ($line -match '^([A-Z_]+)=(.*)$') {
    $local[$Matches[1]] = $Matches[2].Trim().Trim('"')
  }
}

$apiUrl = $local["API_URL"]
$anonKey = $local["ANON_KEY"]
$serviceKey = $local["SERVICE_ROLE_KEY"]
if (-not $apiUrl -or -not $anonKey) {
  throw "Could not parse API_URL / ANON_KEY from supabase status"
}

$backup = Join-Path $root ".env.local.cloud.bak"
Restore-EnvFile
if (Test-Path $envFile) {
  Copy-Item $envFile $backup -Force
  Write-Host "Backed up cloud config -> .env.local.cloud.bak"
}

Write-Host "==> 6/6 Updating .env.local for local Supabase..."
Write-DotEnvKeys $envFile @{
  SUPABASE_URL              = $apiUrl
  SUPABASE_ANON_KEY         = $anonKey
  SUPABASE_SERVICE_ROLE_KEY = $serviceKey
  SUPABASE_DB_PASSWORD      = "postgres"
  DATABASE_URL              = $localDbUrl
  VECTOR_SUPABASE_URL       = $apiUrl
  VECTOR_SUPABASE_ANON_KEY  = $anonKey
}

node (Join-Path $PSScriptRoot "patch_app_settings_database.mjs") $apiUrl $anonKey $serviceKey $dbContainer passed
if ($LASTEXITCODE -ne 0) {
  Write-Warning "app_settings.database patch failed; run: npm run supabase:sync-settings"
}

Write-Host ""
Write-Host "Done. Next:"
Write-Host "  Studio: http://127.0.0.1:54323"
Write-Host "  Settings -> Database -> Test connection"
Write-Host "  npm run dev:clean"
Write-Host "Restore cloud: Copy-Item .env.local.cloud.bak .env.local -Force"

} finally {
  Restore-EnvFile
}
