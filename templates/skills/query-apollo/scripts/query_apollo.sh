#!/bin/bash
# Apollo 配置查询工具（轻量版，用于 CS Agent 排查）
# 用法:
#   bash query_apollo.sh <app_id> [key] [namespace]
#   bash query_apollo.sh ec-so-service                         # 查所有配置
#   bash query_apollo.sh ec-so-service order.note.maxLen       # 查指定 key
#   bash query_apollo.sh ec-so-service "" public_ec            # 查 public namespace

APOLLO_URL="https://apollo-configservice.yamibuy.net"

APP_ID="${1:-}"
KEY="${2:-}"
NAMESPACE="${3:-application}"

if [ -z "$APP_ID" ]; then
  echo "用法: $0 <app_id> [key] [namespace]"
  echo "  app_id:    服务名（如 ec-so-service）"
  echo "  key:       配置项名称（可选，不填返回全部）"
  echo "  namespace: 命名空间（默认 application，可选 public_ec/public_central）"
  exit 1
fi

URL="$APOLLO_URL/configfiles/json/$APP_ID/default/$NAMESPACE"
RESP=$(curl -sf --connect-timeout 10 "$URL" 2>/dev/null)

if [ $? -ne 0 ] || [ -z "$RESP" ] || [ "$RESP" = "{}" ]; then
  echo "❌ 查询失败或配置为空 (app_id=$APP_ID, namespace=$NAMESPACE)"
  exit 1
fi

if [ -n "$KEY" ]; then
  # 查指定 key
  VALUE=$(echo "$RESP" | python3 -c "
import json, sys
data = json.load(sys.stdin)
key = '$KEY'
if key in data:
    print(f'{key} = {data[key]}')
else:
    # 模糊匹配
    matches = [(k, v) for k, v in data.items() if key.lower() in k.lower()]
    if matches:
        for k, v in sorted(matches):
            print(f'{k} = {v}')
    else:
        print(f'❌ 未找到配置项: {key}')
        print(f'提示: 该 namespace 共有 {len(data)} 个配置项')
        sys.exit(1)
" 2>/dev/null)
  echo "$VALUE"
else
  # 返回全部（格式化为 properties）
  echo "$RESP" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(f'# {\"$APP_ID\"}/{\"$NAMESPACE\"} ({len(data)} 项)')
print()
for k in sorted(data.keys()):
    v = data[k] if data[k] is not None else ''
    print(f'{k}={v}')
" 2>/dev/null
fi
