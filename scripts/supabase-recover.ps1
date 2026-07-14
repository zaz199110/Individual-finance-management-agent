<# 
  Supabase Recovery Script
  Detects and recovers from Docker Desktop crash/restart where compose metadata is lost.
  Usage: npm run supabase:recover   or   .\scripts\supabase-recover.ps1
#>

$ErrorActionPreference = "Stop"
$ProjectId = "agent-demo-coding"

Write-Host "=== Supabase Recovery ===" -ForegroundColor Cyan

# 1. Check Docker is running
Write-Host "[1/4] Checking Docker Engine..." -ForegroundColor Gray
try {
    docker info 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Docker Engine is not running. Please start Docker Desktop first." -ForegroundColor Red
        exit 1
    }
    Write-Host "  Docker Engine is running." -ForegroundColor Green
} catch {
    Write-Host "ERROR: Docker is not available. Please install and start Docker Desktop." -ForegroundColor Red
    exit 1
}

# 2. Check for Supabase config
if (-not (Test-Path "supabase\config.toml")) {
    Write-Host "ERROR: supabase/config.toml not found. Are you in the project root?" -ForegroundColor Red
    exit 1
}

# 3. Detect orphaned containers (exist but no compose project)
Write-Host "[2/4] Checking for orphaned containers..." -ForegroundColor Gray
$containers = docker ps -a --filter "name=supabase_$ProjectId" --format "{{.Names}}" 2>&1
$composeProjects = docker compose ls --format "{{.Name}}" 2>&1 | Where-Object { $_ -eq $ProjectId }

if ($containers) {
    if (-not $composeProjects) {
        Write-Host "  Found orphaned containers (compose project '$ProjectId' missing)." -ForegroundColor Yellow
        Write-Host "  Cleaning up orphaned containers..." -ForegroundColor Gray
        
        # Stop and remove all containers for this project
        docker ps -a --filter "name=supabase_$ProjectId" --format "{{.Names}}" | ForEach-Object {
            docker rm -f $_ 2>&1 | Out-Null
            Write-Host "    Removed: $_" -ForegroundColor DarkGray
        }
        Write-Host "  Cleanup complete." -ForegroundColor Green
    } else {
        # Containers exist and compose project exists - check if running
        $running = docker ps --filter "name=supabase_$ProjectId" --format "{{.Names}}" 2>&1
        if ($running) {
            Write-Host "  Supabase containers are already running:" -ForegroundColor Green
            $running | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
        } else {
            Write-Host "  Containers exist but are stopped. Starting them..." -ForegroundColor Yellow
            npx supabase start 2>&1
            exit $LASTEXITCODE
        }
    }
} else {
    Write-Host "  No existing containers found. Fresh start needed." -ForegroundColor Gray
}

# 4. Start Supabase
Write-Host "[3/4] Starting Supabase..." -ForegroundColor Gray
npx supabase start 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: npx supabase start failed (exit code: $LASTEXITCODE)" -ForegroundColor Red
    exit $LASTEXITCODE
}

# 5. Sync settings
Write-Host "[4/4] Syncing database settings..." -ForegroundColor Gray
node automation/scripts/sync_local_database_settings.mjs 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: Settings sync had issues, but Supabase is running. Try 'npm run supabase:sync-settings' manually." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Supabase is ready ===" -ForegroundColor Green
Write-Host "  Studio:  http://127.0.0.1:54323" -ForegroundColor Gray
Write-Host "  API:     http://127.0.0.1:54321" -ForegroundColor Gray
Write-Host "  DB:      postgresql://postgres:postgres@127.0.0.1:54322/postgres" -ForegroundColor Gray
Write-Host ""
Write-Host "Refresh your app page to reconnect." -ForegroundColor Cyan
