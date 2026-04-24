#!/usr/bin/env bash
# MCP installer + credential collector — driven by mcp-registry.json

REGISTRY="$SCRIPT_DIR/mcp-registry.json"

# ── 安装单个 MCP 的依赖 ──────────────────────────────────────
install_mcp() {
  local mcp_id="$1"
  local install_type install_pkg install_dir install_repo install_python

  install_type=$(jq -r ".\"$mcp_id\".install.type // empty" "$REGISTRY")
  [ -z "$install_type" ] && return 0  # 无需安装

  install_dir=$(jq -r ".\"$mcp_id\".install.dir // empty" "$REGISTRY")
  local target="${WORK_DIR}/${install_dir}"

  case "$install_type" in
    npm)
      install_pkg=$(jq -r ".\"$mcp_id\".install.package" "$REGISTRY")
      if [ -n "$install_dir" ]; then
        [ -d "$target/node_modules" ] && return 0
        mkdir -p "$target"
        (cd "$target" && npm init -y --silent 2>/dev/null && npm install --silent "$install_pkg" 2>/dev/null)
      else
        [ -d "$WORK_DIR/node_modules/$install_pkg" ] && return 0
        (cd "$WORK_DIR" && [ ! -f package.json ] && npm init -y --silent 2>/dev/null; npm install --silent "$install_pkg" 2>/dev/null)
      fi
      ;;
    npm-local)
      [ -d "$target/node_modules" ] && return 0
      mkdir -p "$target"
      # 从模板源复制源码
      local tmpl_src="$TEMPLATE_SRC/../mcp-servers/$(basename "$install_dir")"
      if [ ! -d "$tmpl_src" ]; then
        tmpl_src="$PROJECT_DIR/templates/mcp-servers/$(basename "$install_dir")"
      fi
      if [ -d "$tmpl_src" ]; then
        cp -rn "$tmpl_src/"* "$target/" 2>/dev/null || true
      fi
      (cd "$target" && [ ! -f package.json ] && npm init -y --silent 2>/dev/null; npm install --silent 2>/dev/null)
      ;;
    git)
      [ -d "$target" ] && return 0
      install_repo=$(jq -r ".\"$mcp_id\".install.repo" "$REGISTRY")
      install_python=$(jq -r ".\"$mcp_id\".install.python // false" "$REGISTRY")
      git clone --quiet "$install_repo" "$target" 2>/dev/null || { warn "$mcp_id clone 失败"; return 1; }
      if [ "$install_python" = "true" ] && [ -f "$target/requirements.txt" ]; then
        (cd "$target" && python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt 2>/dev/null) || warn "$mcp_id pip install 失败"
      fi
      ;;
  esac
  return 0
}

# ── 交互式收集单个 MCP 的凭证，生成 JSON 片段 ─────────────────
# 输出: MCP_ENABLED=0/1, MCP_JSON=配置片段
collect_mcp() {
  local mcp_id="$1"
  MCP_ENABLED=0
  MCP_JSON=""

  local name auto
  name=$(jq -r ".\"$mcp_id\".name" "$REGISTRY")
  auto=$(jq -r ".\"$mcp_id\".auto // false" "$REGISTRY")

  # auto MCP 不需要交互
  if [ "$auto" = "true" ]; then
    MCP_ENABLED=1
    MCP_JSON=$(generate_mcp_json "$mcp_id")
    return
  fi

  echo ""
  echo "=== $name MCP ==="
  read -rp "  启用? [Y/n]: " yn
  if [[ "${yn,,}" == "n" ]]; then return; fi

  # 收集需要用户输入的 env 变量
  local env_keys env_json="{}"
  env_keys=$(jq -r ".\"$mcp_id\".env | keys[]" "$REGISTRY")

  for key in $env_keys; do
    local prompt default secret value_tpl val
    prompt=$(jq -r ".\"$mcp_id\".env.\"$key\".prompt // empty" "$REGISTRY")
    default=$(jq -r ".\"$mcp_id\".env.\"$key\".default // empty" "$REGISTRY")
    secret=$(jq -r ".\"$mcp_id\".env.\"$key\".secret // false" "$REGISTRY")
    value_tpl=$(jq -r ".\"$mcp_id\".env.\"$key\".value // \"__UNSET__\"" "$REGISTRY")

    # 固定值（包括空字符串），不需要交互
    if [ "$value_tpl" != "__UNSET__" ]; then
      val=$(expand_vars "$value_tpl")
      env_json=$(echo "$env_json" | jq --arg k "$key" --arg v "$val" '. + {($k): $v}')
      continue
    fi

    # 交互式收集
    local optional
    optional=$(jq -r ".\"$mcp_id\".env.\"$key\".optional // false" "$REGISTRY")

    if [ "$secret" = "true" ]; then
      read -rsp "  $prompt: " val; echo
    elif [ -n "$default" ]; then
      read -rp "  $prompt [$default]: " val
      val="${val:-$default}"
    else
      read -rp "  $prompt: " val
    fi

    if [ -z "$val" ]; then
      if [ "$optional" = "true" ]; then
        env_json=$(echo "$env_json" | jq --arg k "$key" --arg v "" '. + {($k): $v}')
        continue
      else
        warn "$key 为空，跳过此 MCP"
        return
      fi
    fi
    env_json=$(echo "$env_json" | jq --arg k "$key" --arg v "$val" '. + {($k): $v}')
  done

  # 处理 credentials_files（粘贴内容并保存为文件）
  local cred_files
  cred_files=$(jq -r ".\"$mcp_id\".credentials_files // empty | keys[]" "$REGISTRY" 2>/dev/null)
  for file_path_tpl in $cred_files; do
    local file_path prompt
    file_path=$(expand_vars "$file_path_tpl")
    prompt=$(jq -r ".\"$mcp_id\".credentials_files.\"$file_path_tpl\".prompt" "$REGISTRY")

    if [ -f "$file_path" ]; then
      echo "  ✓ $file_path 已存在，跳过"
      continue
    fi

    echo "  $prompt:"
    local content=""
    local empty_count=0
    while IFS= read -r line; do
      if [ -z "$line" ]; then
        empty_count=$((empty_count + 1))
        [ "$empty_count" -ge 1 ] && [ -n "$content" ] && break
      else
        empty_count=0
      fi
      content="${content}${line}"$'\n'
    done

    if [ -z "$content" ]; then
      warn "内容为空，跳过"
      return
    fi

    mkdir -p "$(dirname "$file_path")"
    echo "$content" > "$file_path"
    chmod 600 "$file_path"
    echo "  ✓ 已保存到 $file_path"
  done

  MCP_ENABLED=1
  MCP_JSON=$(generate_mcp_json "$mcp_id" "$env_json")
}

# ── 生成单个 MCP 的 JSON 配置片段 ────────────────────────────
generate_mcp_json() {
  local mcp_id="$1"
  local env_override="${2:-}"

  local command args_json env_json auto_approve_json aliases_json
  command=$(jq -r ".\"$mcp_id\".command" "$REGISTRY")
  command=$(expand_vars "$command")

  args_json=$(jq -c "[.\"$mcp_id\".args[] | $(expand_vars_jq)]" "$REGISTRY")
  auto_approve_json=$(jq -c ".\"$mcp_id\".autoApprove // []" "$REGISTRY")
  aliases_json=$(jq -c ".\"$mcp_id\".toolAliases // null" "$REGISTRY")

  if [ -n "$env_override" ]; then
    env_json="$env_override"
  else
    # 自动 MCP: 展开所有 value 模板
    env_json=$(jq -c ".\"$mcp_id\".env | to_entries | map({key: .key, value: (.value.value // \"\")}) | from_entries" "$REGISTRY")
    # 展开变量
    env_json=$(echo "$env_json" | python3 -c "
import sys, json, os
d = json.load(sys.stdin)
vars = {'WORK_DIR': os.environ.get('WORK_DIR',''), 'CODE_DIR': os.environ.get('CODE_DIR',''), 'PORT': os.environ.get('PORT','')}
for k,v in d.items():
    for vk,vv in vars.items():
        v = v.replace('{'+vk+'}', vv)
    d[k] = v
json.dump(d, sys.stdout)
")
  fi

  # 组装
  local result
  result=$(jq -n \
    --arg cmd "$command" \
    --argjson args "$args_json" \
    --argjson env "$env_json" \
    --argjson aa "$auto_approve_json" \
    '{command: $cmd, args: $args, env: $env, disabled: false, autoApprove: $aa}')

  if [ "$aliases_json" != "null" ]; then
    result=$(echo "$result" | jq --argjson ta "$aliases_json" '. + {toolAliases: $ta}')
  fi

  echo "$result"
}

# ── 变量展开辅助 ─────────────────────────────────────────────
expand_vars() {
  local s="$1"
  s="${s//\{WORK_DIR\}/$WORK_DIR}"
  s="${s//\{CODE_DIR\}/$CODE_DIR}"
  s="${s//\{PORT\}/$PORT}"
  s="${s//\{GIT_BASE\}/$GIT_BASE}"
  echo "$s"
}

# jq 内的变量展开表达式
expand_vars_jq() {
  echo "gsub(\"{WORK_DIR}\"; \"$WORK_DIR\") | gsub(\"{CODE_DIR}\"; \"$CODE_DIR\") | gsub(\"{PORT}\"; \"$PORT\") | gsub(\"{GIT_BASE}\"; \"$GIT_BASE\")"
}
