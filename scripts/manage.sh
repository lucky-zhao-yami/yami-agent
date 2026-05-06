#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
TEMPLATE_SRC="$PROJECT_DIR/templates"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}ℹ️  $*${NC}"; }
ok()    { echo -e "${GREEN}✅ $*${NC}"; }
warn()  { echo -e "${YELLOW}⚠️  $*${NC}"; }
fail()  { echo -e "${RED}❌ $*${NC}"; exit 1; }

# ── 自动检测 WORK_DIR ────────────────────────────────────────
detect_work_dir() {
  if [ -n "${WORK_DIR:-}" ]; then return; fi
  # 常见位置
  for d in /opt/yami-agent-workspace /mnt/d/workspace/cs /mnt/d/workspace/dev; do
    if [ -f "$d/.env" ] && [ -d "$d/.kiro" ]; then
      WORK_DIR="$d"
      return
    fi
  done
  read -rp "工作空间目录: " WORK_DIR
  [ -d "$WORK_DIR/.kiro" ] || fail "无效的工作空间: $WORK_DIR"
}

# ── 用法 ─────────────────────────────────────────────────────
usage() {
  cat <<EOF
用法: $0 <command> [args...]

Skills:
  add-skill <name>          从 templates 添加 skill 到工作空间
  remove-skill <name>       从工作空间移除 skill
  list-skills               列出工作空间中的 skills

Agents:
  add-agent <name>          从 templates 添加 agent 到工作空间
  remove-agent <name>       从工作空间移除 agent
  list-agents               列出工作空间中的 agents

Steering:
  add-steering <file>       从 templates 添加 steering 到工作空间
  remove-steering <file>    从工作空间移除 steering
  list-steering             列出工作空间中的 steering

MCP:
  add-mcp <name>            添加 MCP（安装依赖 + 收集凭证 + 写入 mcp.json）
  remove-mcp <name>         从 mcp.json 移除 MCP
  list-mcps                 列出已配置的 MCPs

其他:
  restart                   重启 yami-agent
  status                    查看运行状态
  sync [--profile <name>]   同步模板到工作空间
                            无 --profile: 仅更新已有文件
                            有 --profile: 全量同步（以 profile 清单为准，增删改）

环境变量:
  WORK_DIR                  工作空间目录（不设则自动检测）

示例:
  $0 add-skill central-login
  $0 add-mcp sql-query
  $0 restart
EOF
  exit 1
}

# ── Skill 管理 ───────────────────────────────────────────────
cmd_add_skill() {
  local name="$1"
  local src="$TEMPLATE_SRC/skills/$name"
  local dst="$WORK_DIR/.kiro/skills/$name"
  [ -d "$src" ] || fail "模板不存在: $src (可用: $(ls "$TEMPLATE_SRC/skills/" | tr '\n' ' '))"
  if [ -d "$dst" ]; then
    warn "$name 已存在，更新内容"
    rm -rf "$dst"
  fi
  cp -r "$src" "$dst"
  ok "skill $name 已添加"
}

cmd_remove_skill() {
  local name="$1"
  local dst="$WORK_DIR/.kiro/skills/$name"
  [ -d "$dst" ] || fail "skill 不存在: $name"
  rm -rf "$dst"
  ok "skill $name 已移除"
}

cmd_list_skills() {
  echo "已安装:"
  ls "$WORK_DIR/.kiro/skills/" 2>/dev/null | sed 's/^/  ✓ /'
  echo ""
  echo "可用模板:"
  for s in "$TEMPLATE_SRC/skills/"*/; do
    local name=$(basename "$s")
    if [ -d "$WORK_DIR/.kiro/skills/$name" ]; then
      echo -e "  ✓ $name ${GREEN}(已安装)${NC}"
    else
      echo "  · $name"
    fi
  done
}

# ── Agent 管理 ───────────────────────────────────────────────
cmd_add_agent() {
  local name="$1"
  local count=0
  for src in "$TEMPLATE_SRC/agents/$name" "$TEMPLATE_SRC/agents/${name}.json"; do
    [ -e "$src" ] || continue
    local dst="$WORK_DIR/.kiro/agents/$(basename "$src")"
    cp -r "$src" "$dst"
    count=$((count + 1))
  done
  [ "$count" -eq 0 ] && fail "模板不存在: $name (可用: $(ls "$TEMPLATE_SRC/agents/" | tr '\n' ' '))"
  ok "agent $name 已添加"
}

cmd_remove_agent() {
  local name="$1"
  rm -rf "$WORK_DIR/.kiro/agents/$name" "$WORK_DIR/.kiro/agents/${name}.json" 2>/dev/null
  ok "agent $name 已移除"
}

cmd_list_agents() {
  echo "已安装:"
  ls "$WORK_DIR/.kiro/agents/" 2>/dev/null | sed 's/^/  ✓ /'
}

# ── Steering 管理 ────────────────────────────────────────────
cmd_add_steering() {
  local name="$1"
  local src="$TEMPLATE_SRC/steering/$name"
  local dst="$WORK_DIR/.kiro/steering/$name"
  [ -f "$src" ] || fail "模板不存在: $src"
  cp "$src" "$dst"
  ok "steering $name 已添加"
}

cmd_remove_steering() {
  local name="$1"
  rm -f "$WORK_DIR/.kiro/steering/$name"
  ok "steering $name 已移除"
}

cmd_list_steering() {
  echo "已安装:"
  ls "$WORK_DIR/.kiro/steering/" 2>/dev/null | sed 's/^/  ✓ /'
}

# ── MCP 管理 ─────────────────────────────────────────────────
cmd_add_mcp() {
  local mcp_id="$1"
  local REGISTRY="$SCRIPT_DIR/mcp-registry.json"
  [ -f "$REGISTRY" ] || fail "mcp-registry.json 不存在"
  jq -e ".\"$mcp_id\"" "$REGISTRY" >/dev/null 2>&1 || fail "MCP 不存在: $mcp_id"

  source "$SCRIPT_DIR/mcp-collectors.sh"
  export WORK_DIR

  # 安装依赖
  info "安装 $mcp_id 依赖..."
  install_mcp "$mcp_id"

  # 收集凭证
  collect_mcp "$mcp_id"
  if [ "$MCP_ENABLED" != "1" ]; then
    warn "$mcp_id 未启用"
    return
  fi

  # 写入 mcp.json
  local mcp_json_file="$WORK_DIR/.kiro/settings/mcp.json"
  if [ ! -f "$mcp_json_file" ] || [ ! -s "$mcp_json_file" ]; then
    echo '{"mcpServers":{}}' > "$mcp_json_file"
  fi
  python3 -c "
import json, sys
mcp_id = sys.argv[1]
new_config = json.loads(sys.argv[2])
with open(sys.argv[3]) as f:
    data = json.load(f)
data.setdefault('mcpServers', {})[mcp_id] = new_config
with open(sys.argv[3], 'w') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
" "$mcp_id" "$MCP_JSON" "$mcp_json_file"

  ok "MCP $mcp_id 已添加到 mcp.json"
}

cmd_remove_mcp() {
  local mcp_id="$1"
  local mcp_json_file="$WORK_DIR/.kiro/settings/mcp.json"
  [ -f "$mcp_json_file" ] || fail "mcp.json 不存在"
  python3 -c "
import json, sys
with open(sys.argv[2]) as f:
    data = json.load(f)
data.get('mcpServers', {}).pop(sys.argv[1], None)
with open(sys.argv[2], 'w') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
" "$mcp_id" "$mcp_json_file"
  ok "MCP $mcp_id 已移除"
}

cmd_list_mcps() {
  local mcp_json_file="$WORK_DIR/.kiro/settings/mcp.json"
  if [ -f "$mcp_json_file" ]; then
    echo "已配置:"
    jq -r '.mcpServers | keys[] | "  ✓ " + .' "$mcp_json_file" 2>/dev/null
  else
    echo "  (无)"
  fi
}

# ── Sync ─────────────────────────────────────────────────────
cmd_sync() {
  local profile="${1:-}"

  if [ -z "$profile" ]; then
    # 无 profile：只更新已存在的（旧行为）
    info "同步模式: 仅更新已有文件（未指定 --profile）"
    _sync_update_only
    return
  fi

  # 有 profile：全量同步（清理 + 重建）
  source "$SCRIPT_DIR/profiles.sh" 2>/dev/null || fail "profiles.sh 不存在。请先：cp $SCRIPT_DIR/profiles.sh.template $SCRIPT_DIR/profiles.sh"
  local PROFILE_UPPER=$(echo "$profile" | tr '[:lower:]' '[:upper:]')

  # 合并 base + profile 清单
  eval 'local P_SKILLS=("${BASE_SKILLS[@]}" "${'"${PROFILE_UPPER}"'_SKILLS[@]}")'
  eval 'local P_AGENTS=("${BASE_AGENTS[@]}" "${'"${PROFILE_UPPER}"'_AGENTS[@]}")'
  eval 'local P_STEERING=("${BASE_STEERING[@]}" "${'"${PROFILE_UPPER}"'_STEERING[@]}")'
  eval 'local P_HOOKS=("${BASE_HOOKS[@]}" "${'"${PROFILE_UPPER}"'_HOOKS[@]}")'

  info "同步模式: 全量同步 (profile=$profile)"
  echo "  Skills:   ${#P_SKILLS[@]} 个"
  echo "  Agents:   ${#P_AGENTS[@]} 个"
  echo "  Steering: ${#P_STEERING[@]} 个"
  echo "  Hooks:    ${#P_HOOKS[@]} 个"
  echo ""

  # ── skills: 清理 → 重建 ──
  info "同步 skills..."
  local old_skills=()
  for d in "$WORK_DIR/.kiro/skills/"*/; do
    [ -d "$d" ] && old_skills+=("$(basename "$d")")
  done
  # 删除不在清单中的
  for name in "${old_skills[@]}"; do
    printf '%s\n' "${P_SKILLS[@]}" | grep -qx "$name" || {
      rm -rf "$WORK_DIR/.kiro/skills/$name"
      echo "  ✖ $name (已移除)"
    }
  done
  # 添加/更新清单中的
  for name in "${P_SKILLS[@]}"; do
    local src="$TEMPLATE_SRC/skills/$name"
    local dst="$WORK_DIR/.kiro/skills/$name"
    if [ -d "$src" ]; then
      rm -rf "$dst" && cp -r "$src" "$dst"
      echo "  ↻ $name"
    else
      warn "skill 模板不存在: $name"
    fi
  done
  # ── agents: 清理 → 重建 ──
  info "同步 agents..."
  rm -rf "$WORK_DIR/.kiro/agents/"*
  for agent in "${P_AGENTS[@]}"; do
    for src in "$TEMPLATE_SRC/agents/$agent" "$TEMPLATE_SRC/agents/${agent}.json"; do
      [ -e "$src" ] || continue
      cp -r "$src" "$WORK_DIR/.kiro/agents/$(basename "$src")"
      echo "  ↻ $(basename "$src")"
    done
  done

  # ── steering: 清理 → 重建 ──
  info "同步 steering..."
  rm -f "$WORK_DIR/.kiro/steering/"*
  for f in "${P_STEERING[@]}"; do
    local src="$TEMPLATE_SRC/steering/$f"
    if [ -f "$src" ]; then
      cp "$src" "$WORK_DIR/.kiro/steering/$f"
      echo "  ↻ $f"
    else
      warn "steering 模板不存在: $f"
    fi
  done

  # ── hooks: 清理 → 重建 ──
  info "同步 hooks..."
  rm -f "$WORK_DIR/.kiro/hooks/"*
  for h in "${P_HOOKS[@]}"; do
    local src="$TEMPLATE_SRC/hooks/$h"
    if [ -f "$src" ]; then
      cp "$src" "$WORK_DIR/.kiro/hooks/$h"
      echo "  ↻ $h"
    else
      warn "hook 模板不存在: $h"
    fi
  done

  ok "全量同步完成"

  # ── 占位符替换 ──
  _replace_placeholders
}

# 旧行为：只更新已存在的文件
# 替换模板中的占位符为实际路径
_replace_placeholders() {
  local work_dir="$WORK_DIR"
  local code_dir=""

  # 从 .env 读取 CODE_DIR
  if [ -f "$WORK_DIR/.env" ]; then
    code_dir=$(grep "^CODE_DIR=" "$WORK_DIR/.env" | cut -d= -f2 || true)
  fi

  # 从 workspace.json 推断 CODE_DIR
  if [ -z "$code_dir" ] && [ -f "$WORK_DIR/.kiro/workspace.json" ]; then
    code_dir=$(python3 -c "
import json, os
with open('$WORK_DIR/.kiro/workspace.json') as f:
    d = json.load(f)
repos = d.get('repositories', [])
if repos:
    print(os.path.dirname(repos[0]))
" 2>/dev/null || true)
  fi
  code_dir="${code_dir:-$work_dir/code}"

  info "替换占位符: WORK_DIR=$work_dir, CODE_DIR=$code_dir"
  find "$WORK_DIR/.kiro" -type f \( -name "*.md" -o -name "*.json" -o -name "*.yaml" -o -name "*.hook" \) \
    -exec sed -i "s|{{WORK_DIR}}|$work_dir|g; s|{{CODE_DIR}}|$code_dir|g" {} + 2>/dev/null || true
  ok "占位符替换完成"
}

# 旧行为：只更新已存在的文件
_sync_update_only() {
  info "同步 skills..."
  for d in "$WORK_DIR/.kiro/skills/"*/; do
    local name=$(basename "$d")
    local src="$TEMPLATE_SRC/skills/$name"
    if [ -d "$src" ]; then
      rm -rf "$d" && cp -r "$src" "$d"
      echo "  ↻ $name"
    fi
  done

  info "同步 agents..."
  for f in "$TEMPLATE_SRC/agents/"*.json; do
    local name=$(basename "$f")
    [ -f "$WORK_DIR/.kiro/agents/$name" ] && cp "$f" "$WORK_DIR/.kiro/agents/$name" && echo "  ↻ $name"
  done

  info "同步 steering..."
  for f in "$WORK_DIR/.kiro/steering/"*; do
    local name=$(basename "$f")
    local src="$TEMPLATE_SRC/steering/$name"
    [ -f "$src" ] && cp "$src" "$f" && echo "  ↻ $name"
  done

  ok "同步完成"

  # ── 占位符替换 ──
  _replace_placeholders
}

# ── 运维 ─────────────────────────────────────────────────────
cmd_restart() {
  [ -f "$WORK_DIR/restart.sh" ] || fail "restart.sh 不存在"
  bash "$WORK_DIR/restart.sh"
}

cmd_status() {
  local pid_file="$WORK_DIR/yami-agent.pid"
  if [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    local port=$(grep "^PORT=" "$WORK_DIR/.env" | cut -d= -f2)
    echo "  PID:    $(cat "$pid_file")"
    echo "  Health: $(curl -s "http://localhost:$port/health" 2>/dev/null || echo 'unreachable')"
  else
    echo "  未运行"
  fi
}

# ── 主入口 ───────────────────────────────────────────────────
[ $# -lt 1 ] && usage
CMD="$1"; shift

detect_work_dir

case "$CMD" in
  add-skill)      [ $# -lt 1 ] && fail "用法: $0 add-skill <name>"; cmd_add_skill "$1" ;;
  remove-skill)   [ $# -lt 1 ] && fail "用法: $0 remove-skill <name>"; cmd_remove_skill "$1" ;;
  list-skills)    cmd_list_skills ;;
  add-agent)      [ $# -lt 1 ] && fail "用法: $0 add-agent <name>"; cmd_add_agent "$1" ;;
  remove-agent)   [ $# -lt 1 ] && fail "用法: $0 remove-agent <name>"; cmd_remove_agent "$1" ;;
  list-agents)    cmd_list_agents ;;
  add-steering)   [ $# -lt 1 ] && fail "用法: $0 add-steering <file>"; cmd_add_steering "$1" ;;
  remove-steering) [ $# -lt 1 ] && fail "用法: $0 remove-steering <file>"; cmd_remove_steering "$1" ;;
  list-steering)  cmd_list_steering ;;
  add-mcp)        [ $# -lt 1 ] && fail "用法: $0 add-mcp <name>"; cmd_add_mcp "$1" ;;
  remove-mcp)     [ $# -lt 1 ] && fail "用法: $0 remove-mcp <name>"; cmd_remove_mcp "$1" ;;
  list-mcps)      cmd_list_mcps ;;
  sync)
    profile=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --profile) profile="$2"; shift 2 ;;
        *) fail "未知参数: $1" ;;
      esac
    done
    cmd_sync "$profile"
    ;;
  restart)        cmd_restart ;;
  status)         cmd_status ;;
  *)              fail "未知命令: $CMD"; usage ;;
esac
