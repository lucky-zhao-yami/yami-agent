#!/bin/bash
# yami-agent-flow daemon 重启脚本

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== 重启 yami-agent-flow daemon ==="
echo ""

# 停止
./stop-daemon.sh

sleep 2

# 启动
./start-daemon.sh
