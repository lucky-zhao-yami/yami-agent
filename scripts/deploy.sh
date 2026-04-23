#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
source "$SCRIPT_DIR/profiles.sh"
source "$SCRIPT_DIR/mcp-collectors.sh"

# ── 颜色 ─────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}ℹ️  $*${NC}"; }
ok()    { echo -e "${GREEN}✅ $*${NC}"; }
warn()  { echo -e "${YELLOW}⚠️  $*${NC}"; }
fail()  { echo -e "${RED}❌ $*${NC}"; exit 1; }

# ── 用法 ─────────────────────────────────────────────────────
usage() {
  echo "用法: $0 --profile <dev|cs|ops>"
  echo ""
  echo "  --profile   团队 profile (必填)"
  echo "  --work-dir  工作空间目录 (交互式询问)"
  echo "  --code-dir  代码仓库目录 (交互式询问)"
  echo ""
  echo "示例:"
  echo "  $0 --profile dev"
  echo "  $0 --profile cs"
  exit 1
}

# ── 参数解析 ──────────────────────────────────────────────────
PROFILE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2 ;;
    --help|-h) usage ;;
    *) fail "未知参数: $1" ;;
  esac
done
[ -z "$PROFILE" ] && usage

# 验证 profile
case "$PROFILE" in
  dev|cs|ops) ;;
  *) fail "未知 profile: $PROFILE (可选: dev, cs, ops)" ;;
esac

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║     yami-agent 一键部署 [$PROFILE]       ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Step 0: 检查前置依赖 ─────────────────────────────────────
info "检查前置依赖..."
MISSING=()
for cmd in git node npm python3 jq; do
  command -v "$cmd" &>/dev/null || MISSING+=("$cmd")
done
if ! command -v kiro-cli &>/dev/null; then
  fail "kiro-cli 未安装。请先安装: https://kiro.dev/docs/install"
fi
if [ ${#MISSING[@]} -gt 0 ]; then
  fail "缺少依赖: ${MISSING[*]}"
fi
ok "依赖检查通过"

# ── Step 1: 基础信息 ─────────────────────────────────────────
echo ""
info "Step 1: 基础信息"
read -rp "  工作空间目录 WORK_DIR [/mnt/d/workspace/$PROFILE]: " WORK_DIR
WORK_DIR="${WORK_DIR:-/mnt/d/workspace/$PROFILE}"

read -rp "  代码仓库目录 CODE_DIR [/mnt/d/code/yami]: " CODE_DIR
CODE_DIR="${CODE_DIR:-/mnt/d/code/yami}"

echo ""
info "Step 1.5: 企微机器人凭证"
read -rp "  bot_id: " BOT_ID
[ -z "$BOT_ID" ] && fail "bot_id 不能为空"
read -rsp "  secret: " BOT_SECRET; echo
[ -z "$BOT_SECRET" ] && fail "secret 不能为空"
read -rp "  欢迎语 [👋 你好！我是 AI 助手]: " WELCOME_MSG
WELCOME_MSG="${WELCOME_MSG:-👋 你好！我是 AI 助手}"

read -rp "  HTTP 端口 [8900]: " PORT
PORT="${PORT:-8900}"

# ── Step 2: 拉取代码仓库 ─────────────────────────────────────
echo ""
info "Step 2: 拉取代码仓库"
mkdir -p "$CODE_DIR"

REPOS=(
  central-activity-service central-crm-web central-customer-service
  central-distributor-service central-fp-service central-fp-web
  central-payment-service central-rma-service central-rma-web
  central-so-service central-so-web
  ec-activity-service ec-customer-service ec-distributor-service
  ec-inventory-service ec-payment-service ec-rma-service
  ec-so-service ec-tax-service
  mail-service-job public purchase-tool
  yami-agent kiro-wecom-bridge
)

for repo in "${REPOS[@]}"; do
  target="$CODE_DIR/$repo"
  if [ -d "$target/.git" ]; then
    echo "  ↻ $repo (pull)"
    git -C "$target" pull --ff-only --quiet 2>/dev/null || warn "$repo pull 失败，跳过"
  else
    echo "  ↓ $repo (clone)"
    git clone --quiet "git@git.yamibuy.com:yami/${repo}.git" "$target" 2>/dev/null || warn "$repo clone 失败，跳过"
  fi
done
ok "代码仓库就绪"

# ── Step 3: 初始化工作空间 ────────────────────────────────────
echo ""
info "Step 3: 初始化工作空间"
mkdir -p "$WORK_DIR"/{sessions,.kiro/{steering,skills,agents,settings,hooks}}

# 合并 profile: base + 选定 profile
PROFILE_UPPER=$(echo "$PROFILE" | tr '[:lower:]' '[:upper:]')
eval 'P_SKILLS=("${BASE_SKILLS[@]}" "${'"${PROFILE_UPPER}"'_SKILLS[@]}")'
eval 'P_AGENTS=("${BASE_AGENTS[@]}" "${'"${PROFILE_UPPER}"'_AGENTS[@]}")'
eval 'P_MCPS=("${BASE_MCPS[@]}" "${'"${PROFILE_UPPER}"'_MCPS[@]}")'
eval 'P_STEERING=("${BASE_STEERING[@]}" "${'"${PROFILE_UPPER}"'_STEERING[@]}")'
eval 'P_HOOKS=("${BASE_HOOKS[@]}" "${'"${PROFILE_UPPER}"'_HOOKS[@]}")'

# 模板来源：当前运行的 all 工作空间，或 yami-agent 仓库中的 templates
TEMPLATE_SRC="/mnt/d/workspace/all/.kiro"
if [ ! -d "$TEMPLATE_SRC" ]; then
  TEMPLATE_SRC="$CODE_DIR/yami-agent/templates"
fi

# 复制 skills
for skill in "${P_SKILLS[@]}"; do
  src="$TEMPLATE_SRC/skills/$skill"
  dst="$WORK_DIR/.kiro/skills/$skill"
  if [ -d "$src" ] && [ ! -d "$dst" ]; then
    cp -r "$src" "$dst"
    echo "  + skill: $skill"
  fi
done

# 复制 agents (目录 + json)
for agent in "${P_AGENTS[@]}"; do
  for src in "$TEMPLATE_SRC/agents/$agent" "$TEMPLATE_SRC/agents/${agent}.json"; do
    [ ! -e "$src" ] && continue
    dst="$WORK_DIR/.kiro/agents/$(basename "$src")"
    if [ ! -e "$dst" ]; then
      cp -r "$src" "$dst"
      echo "  + agent: $(basename "$src")"
    fi
  done
done

# 复制 steering
for s in "${P_STEERING[@]}"; do
  src="$TEMPLATE_SRC/steering/$s"
  dst="$WORK_DIR/.kiro/steering/$s"
  [ -f "$src" ] && [ ! -f "$dst" ] && cp "$src" "$dst" && echo "  + steering: $s"
done

# 复制 hooks
for h in "${P_HOOKS[@]}"; do
  src="$TEMPLATE_SRC/hooks/$h"
  dst="$WORK_DIR/.kiro/hooks/$h"
  [ -f "$src" ] && [ ! -f "$dst" ] && cp "$src" "$dst" && echo "  + hook: $h"
done

# workspace.json
cat > "$WORK_DIR/.kiro/workspace.json" <<EOFWS
{
  "repositories": [
$(for repo in "${REPOS[@]}"; do echo "    \"$CODE_DIR/$repo\","; done | sed '$ s/,$//')
  ]
}
EOFWS
echo "  + workspace.json"

ok "工作空间初始化完成"

# ── Step 4: 安装 MCP 服务器依赖 ───────────────────────────────
echo ""
info "Step 4: 安装 MCP 依赖"

# memory (所有 profile 都需要)
if [ ! -d "$WORK_DIR/node_modules/@modelcontextprotocol/server-memory" ]; then
  echo "  📦 memory MCP..."
  (cd "$WORK_DIR" && npm init -y --silent 2>/dev/null && npm install --silent @modelcontextprotocol/server-memory 2>/dev/null)
  ok "memory MCP"
else
  echo "  ✓ memory MCP (已安装)"
fi

# github
if printf '%s\n' "${P_MCPS[@]}" | grep -qx "github"; then
  if [ ! -d "$WORK_DIR/mcp-servers/github/node_modules" ]; then
    echo "  📦 github MCP..."
    mkdir -p "$WORK_DIR/mcp-servers/github"
    (cd "$WORK_DIR/mcp-servers/github" && npm init -y --silent 2>/dev/null && npm install --silent @modelcontextprotocol/server-github 2>/dev/null)
    ok "github MCP"
  else
    echo "  ✓ github MCP (已安装)"
  fi
fi

# kibana
if printf '%s\n' "${P_MCPS[@]}" | grep -qx "kibana"; then
  if [ ! -d "$WORK_DIR/mcp-servers/kibana-mcp" ]; then
    echo "  📦 kibana MCP..."
    git clone --quiet "git@git.yamibuy.com:yami/kibana-mcp.git" "$WORK_DIR/mcp-servers/kibana-mcp" 2>/dev/null || warn "kibana-mcp clone 失败"
    if [ -d "$WORK_DIR/mcp-servers/kibana-mcp" ]; then
      (cd "$WORK_DIR/mcp-servers/kibana-mcp" && python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt 2>/dev/null) || warn "kibana pip install 失败"
      ok "kibana MCP"
    fi
  else
    echo "  ✓ kibana MCP (已安装)"
  fi
fi

# openproject
if printf '%s\n' "${P_MCPS[@]}" | grep -qx "openproject"; then
  if [ ! -d "$WORK_DIR/mcp-servers/openproject/node_modules" ]; then
    echo "  📦 openproject MCP..."
    mkdir -p "$WORK_DIR/mcp-servers/openproject"
    # 如果有源码就复制，否则 npm init
    if [ -f "$TEMPLATE_SRC/../mcp-servers/openproject/index.js" ]; then
      cp "$TEMPLATE_SRC/../mcp-servers/openproject/"*.{js,json} "$WORK_DIR/mcp-servers/openproject/" 2>/dev/null || true
    fi
    (cd "$WORK_DIR/mcp-servers/openproject" && [ ! -f package.json ] && npm init -y --silent 2>/dev/null; npm install --silent 2>/dev/null) || true
    ok "openproject MCP"
  else
    echo "  ✓ openproject MCP (已安装)"
  fi
fi

# zentao
if printf '%s\n' "${P_MCPS[@]}" | grep -qx "zentao"; then
  if [ ! -d "$WORK_DIR/mcp-servers/zentao/node_modules" ]; then
    echo "  📦 zentao MCP..."
    mkdir -p "$WORK_DIR/mcp-servers/zentao"
    if [ -f "$TEMPLATE_SRC/../mcp-servers/zentao/index.js" ]; then
      cp "$TEMPLATE_SRC/../mcp-servers/zentao/"*.{js,json} "$WORK_DIR/mcp-servers/zentao/" 2>/dev/null || true
    fi
    (cd "$WORK_DIR/mcp-servers/zentao" && [ ! -f package.json ] && npm init -y --silent 2>/dev/null; npm install --silent 2>/dev/null) || true
    ok "zentao MCP"
  else
    echo "  ✓ zentao MCP (已安装)"
  fi
fi

ok "MCP 依赖安装完成"

# ── Step 5: 交互式收集 MCP 凭证 ──────────────────────────────
echo ""
info "Step 5: 配置 MCP 凭证 (不需要的直接回车跳过)"

MCP_FRAGMENTS=()

# 自动配置的 MCP (无需凭证)
MCP_FRAGMENTS+=("$(generate_mcp_memory)")
MCP_FRAGMENTS+=("$(generate_mcp_kiro_bridge)")

# 按 profile 需要的 MCP 逐个收集
for mcp in "${P_MCPS[@]}"; do
  MCP_ENABLED=0
  MCP_JSON=""
  case "$mcp" in
    memory|kiro-bridge) continue ;; # 已自动配置
    github)        collect_mcp_github ;;
    kibana)        collect_mcp_kibana ;;
    openproject)   collect_mcp_openproject ;;
    google-sheets) collect_mcp_google_sheets ;;
    zentao)        collect_mcp_zentao ;;
    sql-query)     collect_mcp_sql_query ;;
    ops-agent)     collect_mcp_ops_agent ;;
    *) warn "未知 MCP: $mcp, 跳过" ;;
  esac
  if [ "$MCP_ENABLED" = "1" ] && [ -n "$MCP_JSON" ]; then
    MCP_FRAGMENTS+=("$MCP_JSON")
  fi
done

# ── Step 6: 生成配置文件 ─────────────────────────────────────
echo ""
info "Step 6: 生成配置文件"

# config.json
IFS=' ' read -ra ARGS_ARR <<< "acp --trust-all-tools"
ARGS_JSON=$(printf '%s\n' "${ARGS_ARR[@]}" | jq -R . | jq -s .)

cat > "$WORK_DIR/config.json" <<EOFC
{
  "bot_id": "$BOT_ID",
  "secret": "$BOT_SECRET",
  "welcome_msg": "$WELCOME_MSG",
  "agent": {
    "command": "kiro-cli",
    "args": $ARGS_JSON
  },
  "chats": {
    "default": { "mode": "full" }
  },
  "memory": {
    "layers": [{ "type": "conversation", "enabled": true }]
  }
}
EOFC
echo "  + config.json"

# .env
cat > "$WORK_DIR/.env" <<EOFE
WORK_DIR=$WORK_DIR
PORT=$PORT
MAX_PROCS=10
WARM_POOL_SIZE=1
IDLE_TIMEOUT=1800
PROMPT_TIMEOUT=300
SESSION_SIZE_LIMIT=2097152
MEMORY_SUMMARY_INTERVAL=30
MEMORY_RECALL_DAYS=7
EOFE
echo "  + .env"

# mcp.json
{
  echo '{ "mcpServers": {'
  for i in "${!MCP_FRAGMENTS[@]}"; do
    echo "${MCP_FRAGMENTS[$i]}"
    [ "$i" -lt $((${#MCP_FRAGMENTS[@]} - 1)) ] && echo ","
  done
  echo '} }'
} > "$WORK_DIR/.kiro/settings/mcp.json"
# 格式化
python3 -c "import json,sys; d=json.load(open(sys.argv[1])); json.dump(d,open(sys.argv[1],'w'),indent=2,ensure_ascii=False)" "$WORK_DIR/.kiro/settings/mcp.json" 2>/dev/null || true
echo "  + mcp.json"

ok "配置文件生成完成"

# ── Step 7: 构建 yami-agent ──────────────────────────────────
echo ""
info "Step 7: 构建 yami-agent"
cd "$CODE_DIR/yami-agent"
npm install --silent 2>&1
npm run build --silent 2>&1
ok "yami-agent 构建完成"

# ── Step 8: 生成启动脚本 ─────────────────────────────────────
echo ""
info "Step 8: 生成启动/重启脚本"

cat > "$WORK_DIR/restart.sh" <<'EOFR'
#!/bin/bash
set -e
WORK_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_DIR="AGENT_DIR_PLACEHOLDER"
PID_FILE="$WORK_DIR/yami-agent.pid"
LOG_FILE="$WORK_DIR/yami-agent.log"
PORT=$(grep "^PORT=" "$WORK_DIR/.env" | cut -d= -f2)

echo "🔄 yami-agent 安全重启"

echo "📦 编译..."
cd "$AGENT_DIR" && npm run build --silent

if [ -f "$PID_FILE" ] && kill -0 "$(cat $PID_FILE)" 2>/dev/null; then
    echo "⏳ 等待当前请求完成..."
    curl -s -X POST "http://localhost:$PORT/shutdown" > /dev/null 2>&1 || true
    PID=$(cat "$PID_FILE")
    for i in $(seq 1 30); do
        kill -0 "$PID" 2>/dev/null || break
        [ "$i" = "30" ] && kill -9 "$PID" 2>/dev/null
        sleep 1
    done
    echo "✅ 旧进程已退出"
fi

echo "🚀 启动..."
nohup node --env-file="$WORK_DIR/.env" "$AGENT_DIR/dist/index.js" > "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

for i in $(seq 1 15); do
    curl -s "http://localhost:$PORT/health" > /dev/null 2>&1 && break
    sleep 1
done
echo "✅ yami-agent 已启动 (PID: $(cat $PID_FILE))"
EOFR
sed -i "s|AGENT_DIR_PLACEHOLDER|$CODE_DIR/yami-agent|" "$WORK_DIR/restart.sh"
chmod +x "$WORK_DIR/restart.sh"
echo "  + restart.sh"

# systemd service
NODE_PATH="$(which node)"
cat > "$WORK_DIR/yami-agent.service" <<EOFS
[Unit]
Description=yami-agent ($PROFILE)
After=network.target

[Service]
Type=simple
WorkingDirectory=$WORK_DIR
ExecStart=$NODE_PATH --env-file=$WORK_DIR/.env $CODE_DIR/yami-agent/dist/watchdog/watchdog.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOFS
echo "  + yami-agent.service"

ok "启动脚本生成完成"

# ── 完成 ─────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║           🎉 部署完成！                   ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  Profile:     $PROFILE"
echo "  工作空间:     $WORK_DIR"
echo "  代码目录:     $CODE_DIR"
echo "  Skills:      ${#P_SKILLS[@]} 个"
echo "  Agents:      ${#P_AGENTS[@]} 个"
echo "  MCPs:        ${#MCP_FRAGMENTS[@]} 个"
echo ""
echo "  启动:        $WORK_DIR/restart.sh"
echo "  查看日志:     tail -f $WORK_DIR/yami-agent.log"
echo "  systemd:     sudo cp $WORK_DIR/yami-agent.service /etc/systemd/system/"
echo "               sudo systemctl enable --now yami-agent"
