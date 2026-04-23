#!/bin/bash
# Apollo Configuration Pull Script (Bash version)

APOLLO_BASE_URL="https://apollo-configservice.yamibuy.net"
PUBLIC_APP_ID="public"
PUBLIC_NAMESPACES=("public_ec" "public_central" "public_job" "public_web")
OUTPUT_DIR="apollo_config"
INCLUDE_PUBLIC=true
APP_IDS=()
WORKSPACE_PATH=""

usage() {
    echo "Usage: $0 -w <workspace_path> [-o <output_dir>] [-a <app_id1,app_id2,...>] [--no-public]"
    exit 1
}

while [[ $# -gt 0 ]]; do
    case $1 in
        -w) WORKSPACE_PATH="$2"; shift 2;;
        -o) OUTPUT_DIR="$2"; shift 2;;
        -a) IFS=',' read -ra APP_IDS <<< "$2"; shift 2;;
        --no-public) INCLUDE_PUBLIC=false; shift;;
        *) usage;;
    esac
done

[ -z "$WORKSPACE_PATH" ] && usage

# 转换 Windows 路径
[[ "$WORKSPACE_PATH" =~ ^[A-Z]: ]] && WORKSPACE_PATH=$(echo "$WORKSPACE_PATH" | sed 's|\\|/|g; s|^\([A-Z]\):|/mnt/\L\1|')

# 输出路径
if [[ "$OUTPUT_DIR" = /* ]]; then
    OUTPUT_PATH="$OUTPUT_DIR"
else
    OUTPUT_PATH="$WORKSPACE_PATH/$OUTPUT_DIR"
fi
mkdir -p "$OUTPUT_PATH"

json_to_properties() {
    python3 -c "
import json, sys
data = json.load(sys.stdin)
for k in sorted(data.keys()):
    v = str(data[k]) if data[k] is not None else ''
    print(f'{k}={v}')
"
}

fetch_config() {
    local app_id="$1" namespace="${2:-application}"
    local url="$APOLLO_BASE_URL/configfiles/json/$app_id/default/$namespace"
    echo -e "\033[33mFetching: $app_id/$namespace\033[0m" >&2
    local resp
    resp=$(curl -sf --connect-timeout 10 "$url" 2>/dev/null)
    if [ $? -eq 0 ] && [ -n "$resp" ] && [ "$resp" != "{}" ]; then
        local count=$(echo "$resp" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null)
        echo -e "  -> \033[32m${count} config items\033[0m" >&2
        echo "$resp"
        return 0
    fi
    echo -e "  -> \033[31mFailed or empty\033[0m" >&2
    return 1
}

find_app_ids() {
    local search_path="$1"
    find "$search_path" -path "*/src/main/resources/application.properties" 2>/dev/null | while read -r f; do
        grep -oP 'app\.id\s*=\s*\K.+' "$f" 2>/dev/null | tr -d '[:space:]'
    done | sort -u
}

echo -e "\033[36mApollo Configuration Sync\033[0m"
echo "Workspace: $WORKSPACE_PATH"
echo "Output: $OUTPUT_PATH"

# 收集 app.id
if [ ${#APP_IDS[@]} -eq 0 ]; then
    echo -e "\033[33mScanning workspace for app.id...\033[0m"
    mapfile -t APP_IDS < <(find_app_ids "$WORKSPACE_PATH")
fi

if [ ${#APP_IDS[@]} -eq 0 ]; then
    echo -e "\033[31mNo app.id found\033[0m"
    exit 1
fi

echo -e "\033[32mFound ${#APP_IDS[@]} app.id(s): ${APP_IDS[*]}\033[0m"

success=0; fail=0

# 拉取 public namespaces
if $INCLUDE_PUBLIC; then
    echo -e "\n\033[36mPulling public namespaces...\033[0m"
    for ns in "${PUBLIC_NAMESPACES[@]}"; do
        resp=$(fetch_config "$PUBLIC_APP_ID" "$ns")
        if [ $? -eq 0 ]; then
            echo "$resp" | json_to_properties > "$OUTPUT_PATH/$ns.properties"
            echo -e "  \033[32mSaved: $ns.properties\033[0m"
            ((success++))
        else
            ((fail++))
        fi
        sleep 0.2
    done
fi

# 拉取各服务配置
echo -e "\n\033[36mPulling app configs...\033[0m"
for app_id in "${APP_IDS[@]}"; do
    resp=$(fetch_config "$app_id")
    if [ $? -eq 0 ]; then
        echo "$resp" | json_to_properties > "$OUTPUT_PATH/$app_id.properties"
        echo -e "  \033[32mSaved: $app_id.properties\033[0m"
        ((success++))
    else
        ((fail++))
    fi
    sleep 0.2
done

echo ""
echo -e "\033[32mCompleted! Success: $success, Failed: $fail\033[0m"
ls -lh "$OUTPUT_PATH"/*.properties 2>/dev/null | awk '{print "  "$NF" ("$5")"}'
