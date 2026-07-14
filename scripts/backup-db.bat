@echo off
REM Supabase 本地数据库自动备份脚本
REM 用法: scripts\backup-db.bat
REM 计划任务: 每天凌晨 2 点执行

setlocal enabledelayedexpansion

set "PROJECT_DIR=%~dp0.."
set "BACKUP_DIR=%PROJECT_DIR%\data\backups"
set "CONTAINER=supabase_db_agent-demo-coding"
set "TIMESTAMP=%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%"
set "TIMESTAMP=%TIMESTAMP: =0%"
set "BACKUP_FILE=%BACKUP_DIR%\supabase_backup_%TIMESTAMP%.sql"
set "KEEP_DAYS=7"

REM 创建备份目录
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

REM 检查容器是否运行
docker inspect -f "{{.State.Running}}" %CONTAINER% 2>nul | findstr "true" >nul
if %errorlevel% neq 0 (
    echo [SKIP] %date% %time% - 容器 %CONTAINER% 未运行，跳过备份
    exit /b 0
)

REM 执行备份
echo [RUN] %date% %time% - 开始备份...
docker exec %CONTAINER% pg_dump -U postgres postgres > "%BACKUP_FILE%" 2>&1
if %errorlevel% neq 0 (
    echo [ERR] %date% %time% - 备份失败
    del "%BACKUP_FILE%" 2>nul
    exit /b 1
)

echo [OK]  %date% %time% - 备份成功: %BACKUP_FILE%

REM 清理旧备份（保留最近 N 天）
forfiles /p "%BACKUP_DIR%" /m "supabase_backup_*.sql" /d -%KEEP_DAYS% /c "cmd /c echo [DEL] 删除旧备份: @file && del @file" 2>nul

exit /b 0
