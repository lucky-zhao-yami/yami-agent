#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== yami-agent 部署脚本 ==="
echo ""

# 1. WORK_DIR
read -rp "工作目录 WORK_DIR [/mnt/d/workspace/all]: " WORK_DIR
WORK_DIR="${WORK_DIR:-/mnt/d/workspace/all}"

# 2. Bot credentials
read -rp "企微 bot_id: " BOT_ID
read -rp "企微 secret: " BOT_SECRET
read -rp "欢迎语 [👋 你好！]: " WELCOME_MSG
WELCOME_MSG="${WELCOME_MSG:-👋 你好！}"

# 3. Agent command
read -rp "Agent 命令 [kiro-cli]: " AGENT_CMD
AGENT_CMD="${AGENT_CMD:-kiro-cli}"
read -rp "Agent 参数 [acp --trust-all-tools]: " AGENT_ARGS
AGENT_ARGS="${AGENT_ARGS:-acp --trust-all-tools}"

# 4. Port
read -rp "HTTP 端口 [8900]: " PORT
PORT="${PORT:-8900}"

# 5. WeChat WS host
read -rp "企微 WS Host [localhost]: " WS_HOST
WS_HOST="${WS_HOST:-localhost}"
read -rp "企微 WS Port [18887]: " WS_PORT
WS_PORT="${WS_PORT:-18887}"

echo ""
echo "--- 配置确认 ---"
echo "WORK_DIR:  $WORK_DIR"
echo "BOT_ID:    $BOT_ID"
echo "AGENT:     $AGENT_CMD $AGENT_ARGS"
echo "PORT:      $PORT"
echo "WS:        $WS_HOST:$WS_PORT"
echo ""
read -rp "确认部署? [Y/n]: " CONFIRM
if [[ "${CONFIRM,,}" == "n" ]]; then echo "已取消"; exit 0; fi

# Create directories
mkdir -p "$WORK_DIR"/{sessions,.kiro/{steering,skills,agents}}

# Copy templates if they exist
TMPL_DIR="$PROJECT_DIR/templates"
if [ -d "$TMPL_DIR/steering" ]; then
  cp -rn "$TMPL_DIR/steering/"* "$WORK_DIR/.kiro/steering/" 2>/dev/null || true
fi
if [ -d "$TMPL_DIR/skills" ]; then
  cp -rn "$TMPL_DIR/skills/"* "$WORK_DIR/.kiro/skills/" 2>/dev/null || true
fi
if [ -d "$TMPL_DIR/agents" ]; then
  cp -rn "$TMPL_DIR/agents/"* "$WORK_DIR/.kiro/agents/" 2>/dev/null || true
fi
if [ -f "$TMPL_DIR/settings.json.template" ]; then
  cp -n "$TMPL_DIR/settings.json.template" "$WORK_DIR/.kiro/settings.json" 2>/dev/null || true
fi

# Generate config.json
IFS=' ' read -ra ARGS_ARR <<< "$AGENT_ARGS"
ARGS_JSON=$(printf '%s\n' "${ARGS_ARR[@]}" | jq -R . | jq -s .)

cat > "$WORK_DIR/config.json" <<EOF
{
  "bot_id": "$BOT_ID",
  "secret": "$BOT_SECRET",
  "welcome_msg": "$WELCOME_MSG",
  "agent": {
    "command": "$AGENT_CMD",
    "args": $ARGS_JSON
  },
  "chats": {
    "default": { "mode": "full" }
  },
  "memory": {
    "layers": [{ "type": "conversation", "enabled": true }]
  }
}
EOF
echo "✅ config.json 已生成"

# Generate .env
cat > "$WORK_DIR/.env" <<EOF
WORK_DIR=$WORK_DIR
PORT=$PORT
WECOM_WS_HOST=$WS_HOST
WECOM_WS_PORT=$WS_PORT
WECOM_TOKEN=$BOT_SECRET
MAX_PROCS=10
IDLE_TIMEOUT=1800
SESSION_SIZE_LIMIT=2097152
MEMORY_SUMMARY_INTERVAL=30
MEMORY_RECALL_DAYS=7
EOF
echo "✅ .env 已生成"

# Build project
echo "🔨 构建项目..."
cd "$PROJECT_DIR"
npm run build

# Generate systemd service
SERVICE_FILE="$WORK_DIR/yami-agent.service"
NODE_PATH="$(which node)"
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=yami-agent
After=network.target

[Service]
Type=simple
WorkingDirectory=$WORK_DIR
ExecStart=$NODE_PATH $PROJECT_DIR/dist/watchdog/watchdog.js
Restart=on-failure
RestartSec=5
EnvironmentFile=$WORK_DIR/.env

[Install]
WantedBy=multi-user.target
EOF
echo "✅ systemd service 文件已生成: $SERVICE_FILE"

echo ""
echo "=== 部署完成 ==="
echo "启动: node $PROJECT_DIR/dist/watchdog/watchdog.js"
echo "或安装 systemd: sudo cp $SERVICE_FILE /etc/systemd/system/ && sudo systemctl enable --now yami-agent"
