# Supabase 本地数据库自动备份脚本
# 用法: .\scripts\backup-db.ps1
# 计划任务: 每天凌晨 2 点执行

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir
$backupDir = Join-Path $projectDir "data\backups"

# 创建备份目录
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = Join-Path $backupDir "supabase_backup_${timestamp}.sql"
$containerName = "supabase_db_agent-demo-coding"
$dbUser = "postgres"
$dbName = "postgres"
$keepDays = 7

# 检查容器是否运行
$runningContainers = docker ps --format "{{.Names}}" 2>$null
if ($LASTEXITCODE -ne 0 -or $runningContainers -notmatch [regex]::Escape($containerName)) {
    Write-Host "[SKIP] $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - 容器 $containerName 未运行，跳过备份"
    Write-Host "        当前运行容器: $($runningContainers -replace '\n', ', ')"
    exit 0
}

try {
    # 执行 pg_dump
    docker exec $containerName pg_dump -U $dbUser $dbName > $backupFile
    
    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump 失败，退出码: $LASTEXITCODE"
    }
    
    $fileSize = (Get-Item $backupFile).Length
    $fileSizeKB = [math]::Round($fileSize / 1KB, 1)
    Write-Host "[OK] $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - 备份成功: $backupFile ($fileSizeKB KB)"
    
    # 清理旧备份（保留最近 N 天）
    $cutoff = (Get-Date).AddDays(-$keepDays)
    Get-ChildItem $backupDir -Filter "supabase_backup_*.sql" | 
        Where-Object { $_.LastWriteTime -lt $cutoff } | 
        ForEach-Object {
            Remove-Item $_.FullName
            Write-Host "[DEL] 已删除过期备份: $($_.Name)"
        }
    
} catch {
    Write-Host "[ERR] $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - 备份失败: $_"
    exit 1
}
