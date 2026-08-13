#!/bin/bash
# yami-agent-flow daemon 停止脚本

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

PID_FILE="$SCRIPT_DIR/.daemon.pid"

if [ ! -f "$PID_FILE" ]; then
    echo "Daemon 未运行 (没有找到 PID 文件)"
    
    # 尝试通过进程名查找
    PIDS=$(pgrep -f "node.*dist/index.js" 2>/dev/null)
    if [ -n "$PIDS" ]; then
        echo "发现可能的 daemon 进程: $PIDS"
        echo "如需强制停止，请执行: kill $PIDS"
    fi
    exit 0
fi

PID=$(cat "$PID_FILE")

if ps -p "$PID" > /dev/null 2>&1; then
    echo "停止 Daemon (PID: $PID)..."
    kill "$PID"
    
    # 等待进程退出
    for i in {1..10}; do
        if ! ps -p "$PID" > /dev/null 2>&1; then
            break
        fi
        sleep 1
    done
    
    # 如果还没退出，强制杀死
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "进程未响应，强制终止..."
        kill -9 "$PID"
    fi
    
    rm -f "$PID_FILE"
    echo "✅ Daemon 已停止"
else
    echo "Daemon 进程不存在 (PID: $PID)"
    rm -f "$PID_FILE"
fi
