# === AgentFlow Daemon 启动脚本 (PowerShell) ===
# 使用前请修改以下配置：

$env:WORK_DIR = "D:\workspace\agentflow-pipeline"          # 工作空间路径
$env:AGENTFLOW_SERVER_URL = "ws://10.30.110.61:3001"       # 平台地址
$env:AGENTFLOW_DAEMON_NAME = "your-name"                   # daemon 名称
$env:PORT = "8903"                                          # HTTP 端口
$env:AGENTFLOW_ENABLED = "true"

Write-Host "=== AgentFlow Daemon ===" -ForegroundColor Cyan
Write-Host "  WORK_DIR: $env:WORK_DIR"
Write-Host "  SERVER:   $env:AGENTFLOW_SERVER_URL"
Write-Host "  NAME:     $env:AGENTFLOW_DAEMON_NAME"
Write-Host "  PORT:     $env:PORT"
Write-Host ""

Set-Location $PSScriptRoot
node dist/index.js
