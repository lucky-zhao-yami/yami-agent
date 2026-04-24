---
inclusion: auto
---

# Central 自动登录 Skill

## 用途
自动登录 Central 后台获取 API token，避免每次对话都需要用户手动提供 token。

## 登录接口

### URL
```
POST https://centralapi.yamibuy.net/hub/admin/login
```

### 请求头
```
Content-Type: application/json
```

### 请求体
```json
{
  "email": "${CENTRAL_EMAIL}",
  "password": "${CENTRAL_PASSWORD}"
}
```

### 返回格式
```json
{
  "body": {
    "token": "xxxxxxxx"
  }
}
```

Token 在 `body.token` 字段中。

## 使用流程

### 当需要调用 Central API 时（如通过邮箱查 user_id）：

1. 先检查本地缓存文件 `.kiro/token-cache.json` 是否存在且 token 未过期
2. 如果 token 有效（获取时间不超过 12 小时），直接使用缓存的 token
3. 如果 token 过期或不存在，执行以下命令登录获取新 token：

```bash
TOKEN=$(curl -s -X POST https://centralapi.yamibuy.net/hub/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"'"${CENTRAL_EMAIL}"'","password":"'"${CENTRAL_PASSWORD}"'"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['body']['token'])")
```

4. 将获取到的 token 和当前时间戳写入 `.kiro/token-cache.json`：

```bash
python3 -c "
import json, datetime
json.dump({
    'token': '$TOKEN',
    'obtained_at': datetime.datetime.now().isoformat(),
    'email': '${CENTRAL_EMAIL}'
}, open('.kiro/token-cache.json', 'w'))
"
```

5. 使用 token 调用后续 API

### Token 缓存规则
- 缓存文件路径：`.kiro/token-cache.json`
- 有效期：12 小时（与 Central 后台 session 一致）
- 判断过期：比较 `obtained_at` 与当前时间，超过 12 小时则重新登录
- 登录失败时：提示用户检查网络或账号状态

### 注意事项
- 如果登录接口返回非 200 或无 token，提示用户手动登录获取
- 此账号为共用管理账号，仅用于只读查询
- 环境变量 `CENTRAL_EMAIL` 和 `CENTRAL_PASSWORD` 在 `.env` 中配置
