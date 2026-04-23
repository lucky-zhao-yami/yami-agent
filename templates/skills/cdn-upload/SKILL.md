# CDN 图片上传 Skill

批量上传图片到 Yamibuy CDN（阿里云 OSS），并记录到图片库。

## 使用方式

```
帮我把 [目录] 下的图片上传到CDN
```

## 前置条件

需要 Central 后台的 token。获取方式：
1. 浏览器登录 `https://central.yamibuy.net`
2. F12 → Network → 随便找一个请求 → 复制 `token` header 的值

## 上传流程

### 两步接口

**Step 1 - 上传文件到 CDN**
```bash
curl -s 'https://rs.yamibuy.com/resource/upload/alioss' \
  -H 'token: <TOKEN>' \
  -H 'origin: https://central.yamibuy.net' \
  -H 'referer: https://central.yamibuy.net/' \
  -F "type=mkt" \
  -F "channel=Yamibuy" \
  -F "local=Yamibuy" \
  -F "file=@<FILE_PATH>;type=image/png"
```

响应：
```json
{
  "messageId": "10000",
  "success": "true",
  "body": [{
    "url": "https://cdn.yamibuy.net/mkt/<hash>_0x0.png",
    "name": "<hash>",
    "contentType": "png"
  }]
}
```

**Step 2 - 记录到图片库**
```bash
curl -s 'https://centralapi.yamibuy.net/mkt/image/insert' \
  -H 'content-type: application/json' \
  -H 'token: <TOKEN>' \
  -H 'origin: https://central.yamibuy.net' \
  -H 'referer: https://central.yamibuy.net/' \
  -H 'yami-origin: central-web' \
  -d '{"imageUrl":"<CDN_URL>","imageName":"<分类名>","describe":"<文件描述>"}'
```

### 批量上传脚本

```bash
# 用法: bash cdn-upload.sh <TOKEN> <目录> [imageName]
# 示例: bash cdn-upload.sh "eyJ..." "/mnt/d/data/download/切图/个人报告切图" "个人报告"

TOKEN="$1"
DIR="$2"
IMAGE_NAME="${3:-CDN上传}"

for file in "$DIR"/*.{png,jpg,jpeg,gif,webp}; do
  [ -f "$file" ] || continue
  filename=$(basename "$file")
  desc="${filename%.*}"
  
  # Step 1: 上传到CDN
  RESP=$(curl -s 'https://rs.yamibuy.com/resource/upload/alioss' \
    -H "token: $TOKEN" \
    -H 'origin: https://central.yamibuy.net' \
    -H 'referer: https://central.yamibuy.net/' \
    -F "type=mkt" -F "channel=Yamibuy" -F "local=Yamibuy" \
    -F "file=@${file};type=image/png")
  
  CDN_URL=$(echo "$RESP" | python3 -c "import sys,json;print(json.load(sys.stdin)['body'][0]['url'])" 2>/dev/null)
  
  if [ -z "$CDN_URL" ]; then
    echo "❌ $filename - 上传失败: $RESP"
    continue
  fi
  
  # Step 2: 记录到图片库
  curl -s 'https://centralapi.yamibuy.net/mkt/image/insert' \
    -H 'content-type: application/json' \
    -H "token: $TOKEN" \
    -H 'origin: https://central.yamibuy.net' \
    -H 'referer: https://central.yamibuy.net/' \
    -H 'yami-origin: central-web' \
    -d "{\"imageUrl\":\"$CDN_URL\",\"imageName\":\"$IMAGE_NAME\",\"describe\":\"$desc\"}" > /dev/null
  
  echo "✅ $filename → $CDN_URL"
done
```

## 参数说明

| 参数 | 说明 |
|------|------|
| type | 固定 `mkt` |
| channel | 固定 `Yamibuy` |
| local | 固定 `Yamibuy` |
| imageName | 图片分类名（在图片库中显示） |
| describe | 图片描述（一般用文件名） |

## Token 说明

- Token 来自 Central 后台的 Google OAuth 登录
- 有效期较长，但会过期
- 过期后需要重新从浏览器获取
