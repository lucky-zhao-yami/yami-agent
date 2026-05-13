@echo off
REM === AgentFlow Daemon 升级并重启 ===

echo Pulling latest code...
cd /d %~dp0
git pull
if errorlevel 1 (
    echo Git pull failed!
    pause
    exit /b 1
)

echo Building...
call npm run build
if errorlevel 1 (
    echo Build failed!
    pause
    exit /b 1
)

echo Restarting...
call "%~dp0restart-daemon.bat"
