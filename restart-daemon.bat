@echo off
REM === AgentFlow Daemon 重启脚本 ===

echo Stopping daemon...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F 2>nul
)
timeout /t 3 /nobreak >nul

echo Starting daemon...
call "%~dp0start-daemon.bat"
