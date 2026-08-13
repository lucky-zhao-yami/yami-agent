#!/bin/bash
# yami-agent-flow daemon 启动脚本

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 检查是否已在运行
PID_FILE="$SCRIPT_DIR/.daemon.pid"
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "Daemon 已在运行 (PID: $PID)"
        echo "如需重启，请先执行 ./stop-daemon.sh"
        exit 1
    else
        rm -f "$PID_FILE"
    fi
fi

# 检查 config.json
if [ ! -f "config.json" ]; then
    echo "错误: config.json 不存在"
    echo "请复制 .env.example 并配置"
    exit 1
fi

# 检查 dist 目录
if [ ! -d "dist" ]; then
    echo "编译中..."
    npm run build
fi

# 启动 daemon
echo "启动 yami-agent-flow daemon..."
nohup node dist/index.js > daemon.log 2>&1 &
DAEMON_PID=$!
echo $DAEMON_PID > "$PID_FILE"

sleep 2

# 检查是否启动成功
if ps -p $DAEMON_PID > /dev/null 2>&1; then
    echo "✅ Daemon 启动成功 (PID: $DAEMON_PID)"
    echo "日志文件: $SCRIPT_DIR/daemon.log"
    echo ""
    echo "查看日志: tail -f daemon.log"
    echo "停止服务: ./stop-daemon.sh"
else
    echo "❌ Daemon 启动失败，请查看 daemon.log"
    rm -f "$PID_FILE"
    exit 1
fi
