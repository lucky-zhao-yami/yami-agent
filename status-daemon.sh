#!/bin/bash
# yami-agent-flow daemon 状态查询脚本

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

PID_FILE="$SCRIPT_DIR/.daemon.pid"

echo "=== yami-agent-flow Daemon 状态 ==="
echo ""

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "状态: ✅ 运行中"
        echo "PID:  $PID"
        echo ""
        echo "进程信息:"
        ps -p "$PID" -o pid,ppid,user,%cpu,%mem,etime,cmd --no-headers
        echo ""
        echo "最近日志 (最后 10 行):"
        tail -10 daemon.log 2>/dev/null || echo "(无日志文件)"
    else
        echo "状态: ❌ 未运行 (PID 文件存在但进程不存在)"
        rm -f "$PID_FILE"
    fi
else
    echo "状态: ❌ 未运行"
    
    # 检查是否有遗留进程
    PIDS=$(pgrep -f "node.*dist/index.js" 2>/dev/null)
    if [ -n "$PIDS" ]; then
        echo ""
        echo "⚠️  发现可能的遗留 daemon 进程: $PIDS"
        echo "如需清理，请执行: kill $PIDS"
    fi
fi

echo ""
echo "---"
echo "启动: ./start-daemon.sh"
echo "停止: ./stop-daemon.sh"
echo "重启: ./restart-daemon.sh"
echo "日志: tail -f daemon.log"
