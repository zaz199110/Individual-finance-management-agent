@echo off
cd /d "%~dp0"
echo Starting preview server on http://localhost:8765 ...
start "fund-report-preview" cmd /c "npx --yes serve . -p 8765"
timeout /t 3 /nobreak >nul
start http://localhost:8765/preview-report.html
echo Browser opened. Keep the "fund-report-preview" window running while previewing.
