@echo off
REM === AgentFlow Daemon 启动脚本 (Windows) ===
REM 使用前请修改以下配置：

REM 你的工作空间路径（包含 .kiro/agents/ 的目录）
set WORK_DIR=D:\workspace\agentflow-pipeline

REM AgentFlow 平台地址
set AGENTFLOW_SERVER_URL=ws://10.30.110.61:3001

REM 你的 daemon 名称（显示在平台上的名字）
set AGENTFLOW_DAEMON_NAME=your-name

REM HTTP 端口
set PORT=8903

REM 启用 AgentFlow
set AGENTFLOW_ENABLED=true

echo Starting AgentFlow Daemon...
echo   WORK_DIR: %WORK_DIR%
echo   SERVER:   %AGENTFLOW_SERVER_URL%
echo   NAME:     %AGENTFLOW_DAEMON_NAME%
echo   PORT:     %PORT%
echo.

cd /d %~dp0
node dist/index.js

pause
