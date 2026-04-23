#!/usr/bin/env bash
# MCP credential collection and config generation

# Ask for a credential, return empty if skipped
ask() {
  local prompt="$1" default="$2" secret="$3" val
  if [ "$secret" = "secret" ]; then
    read -rsp "  $prompt: " val; echo
  elif [ -n "$default" ]; then
    read -rp "  $prompt [$default]: " val
    val="${val:-$default}"
  else
    read -rp "  $prompt: " val
  fi
  echo "$val"
}

# Ask if MCP should be enabled, collect credentials if yes
# Sets MCP_ENABLED=1/0 and MCP_JSON with the config fragment
collect_mcp_github() {
  echo ""; echo "=== GitHub MCP ==="
  read -rp "  启用? [Y/n]: " yn
  if [[ "${yn,,}" == "n" ]]; then MCP_ENABLED=0; return; fi
  MCP_ENABLED=1
  local token; token=$(ask "GITHUB_PERSONAL_ACCESS_TOKEN" "" "secret")
  MCP_JSON=$(cat <<EOFJ
    "github": {
      "command": "node",
      "args": ["${WORK_DIR}/mcp-servers/github/node_modules/@modelcontextprotocol/server-github/dist/index.js"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${token}" },
      "disabled": false, "autoApprove": []
    }
EOFJ
)
}

collect_mcp_kibana() {
  echo ""; echo "=== Kibana MCP ==="
  read -rp "  启用? [Y/n]: " yn
  if [[ "${yn,,}" == "n" ]]; then MCP_ENABLED=0; return; fi
  MCP_ENABLED=1
  MCP_JSON=$(cat <<EOFJ
    "kibana": {
      "command": "${WORK_DIR}/mcp-servers/kibana-mcp/.venv/bin/python",
      "args": ["${WORK_DIR}/mcp-servers/kibana-mcp/server.py"],
      "disabled": false,
      "autoApprove": ["list_services", "search_logs", "search_errors", "search_by_order"]
    }
EOFJ
)
}

collect_mcp_openproject() {
  echo ""; echo "=== OpenProject MCP ==="
  read -rp "  启用? [Y/n]: " yn
  if [[ "${yn,,}" == "n" ]]; then MCP_ENABLED=0; return; fi
  MCP_ENABLED=1
  local url key
  url=$(ask "OPENPROJECT_BASE_URL" "https://openproject.yamibuy.net")
  key=$(ask "OPENPROJECT_API_KEY" "" "secret")
  MCP_JSON=$(cat <<EOFJ
    "openproject": {
      "command": "node",
      "args": ["${WORK_DIR}/mcp-servers/openproject/index.js"],
      "env": {
        "OPENPROJECT_BASE_URL": "${url}",
        "OPENPROJECT_API_KEY": "${key}",
        "OPENPROJECT_URL": "${url}"
      },
      "disabled": false, "autoApprove": []
    }
EOFJ
)
}

collect_mcp_google_sheets() {
  echo ""; echo "=== Google Sheets MCP ==="
  read -rp "  启用? [Y/n]: " yn
  if [[ "${yn,,}" == "n" ]]; then MCP_ENABLED=0; return; fi
  MCP_ENABLED=1
  local cred_path token_path
  cred_path=$(ask "CREDENTIALS_PATH (gcp-oauth.keys.json)")
  token_path=$(ask "TOKEN_PATH (token.json)")
  MCP_JSON=$(cat <<EOFJ
    "google-sheets": {
      "command": "uvx",
      "args": ["mcp-google-sheets@latest"],
      "env": { "CREDENTIALS_PATH": "${cred_path}", "TOKEN_PATH": "${token_path}" },
      "disabled": false, "autoApprove": []
    }
EOFJ
)
}

collect_mcp_zentao() {
  echo ""; echo "=== 禅道 MCP ==="
  read -rp "  启用? [Y/n]: " yn
  if [[ "${yn,,}" == "n" ]]; then MCP_ENABLED=0; return; fi
  MCP_ENABLED=1
  local url user pass
  url=$(ask "ZENTAO_URL" "https://bugs.yamibuy.tech")
  user=$(ask "ZENTAO_USERNAME")
  pass=$(ask "ZENTAO_PASSWORD" "" "secret")
  MCP_JSON=$(cat <<EOFJ
    "zentao": {
      "command": "node",
      "args": ["${WORK_DIR}/mcp-servers/zentao/index.js"],
      "env": { "ZENTAO_URL": "${url}", "ZENTAO_USERNAME": "${user}", "ZENTAO_PASSWORD": "${pass}" },
      "disabled": false, "autoApprove": [],
      "toolAliases": { "list_projects": "zentao_list_projects" }
    }
EOFJ
)
}

collect_mcp_sql_query() {
  echo ""; echo "=== SQL Query MCP ==="
  read -rp "  启用? [Y/n]: " yn
  if [[ "${yn,,}" == "n" ]]; then MCP_ENABLED=0; return; fi
  MCP_ENABLED=1
  local host port name user pass
  host=$(ask "DB_HOST")
  port=$(ask "DB_PORT" "3306")
  name=$(ask "DB_NAME")
  user=$(ask "DB_USER")
  pass=$(ask "DB_PASSWORD" "" "secret")
  MCP_JSON=$(cat <<EOFJ
    "sql-query": {
      "command": "uvx",
      "args": ["--index-url", "https://nexus.yamibuy.net/repository/pypi-public/simple/", "yami-sql-mcp"],
      "env": { "DB_HOST": "${host}", "DB_PORT": "${port}", "DB_NAME": "${name}", "DB_USER": "${user}", "DB_PASSWORD": "${pass}", "SQL_MCP_DATA_DIR": "" },
      "disabled": false, "autoApprove": []
    }
EOFJ
)
}

collect_mcp_ops_agent() {
  echo ""; echo "=== OPS Agent MCP ==="
  read -rp "  启用? [Y/n]: " yn
  if [[ "${yn,,}" == "n" ]]; then MCP_ENABLED=0; return; fi
  MCP_ENABLED=1
  local host user key
  host=$(ask "OPS_HOST")
  user=$(ask "OPS_USER" "root")
  key=$(ask "OPS_KEY" "~/.ssh/id_rsa")
  MCP_JSON=$(cat <<EOFJ
    "ops-agent": {
      "command": "python3",
      "args": ["${WORK_DIR}/mcp-servers/ops-agent/server.py"],
      "env": { "OPS_HOST": "${host}", "OPS_USER": "${user}", "OPS_KEY": "${key}" },
      "disabled": false, "autoApprove": []
    }
EOFJ
)
}

# Memory and kiro-bridge are auto-configured, no credentials needed
generate_mcp_memory() {
  echo "    \"memory\": {
      \"command\": \"node\",
      \"args\": [\"${WORK_DIR}/node_modules/@modelcontextprotocol/server-memory/dist/index.js\"],
      \"env\": { \"MEMORY_FILE_PATH\": \"${WORK_DIR}/.kiro/memory.db\" },
      \"disabled\": false,
      \"autoApprove\": [\"read_graph\", \"create_entities\", \"search_nodes\", \"create_relations\", \"open_nodes\", \"add_observations\", \"delete_observations\", \"delete_entities\"]
    }"
}

generate_mcp_kiro_bridge() {
  echo "    \"kiro-bridge\": {
      \"command\": \"python3\",
      \"args\": [\"${CODE_DIR}/kiro-wecom-bridge/mcp_server.py\"],
      \"env\": { \"KIRO_BRIDGE_URL\": \"http://localhost:${PORT}\" },
      \"disabled\": false,
      \"autoApprove\": [\"reply_user\"]
    }"
}
