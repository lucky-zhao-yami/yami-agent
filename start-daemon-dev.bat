@echo off
REM === AgentFlow Daemon 开发模式 (热重载) ===

set WORK_DIR=D:\workspace\agentflow-pipeline
set AGENTFLOW_SERVER_URL=ws://10.30.110.61:3001
set AGENTFLOW_DAEMON_NAME=your-name
set PORT=8903
set AGENTFLOW_ENABLED=true
set NODE_ENV=development

echo Starting AgentFlow Daemon (dev mode)...
cd /d %~dp0
npx tsx --watch src/index.ts
