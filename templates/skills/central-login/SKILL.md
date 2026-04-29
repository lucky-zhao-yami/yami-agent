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
  "email": "admin.fp",
  "password": "yami@123"
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
3. 如果 token 过期或不存在，执行登录获取新 token：

```powershell
$body = '{"email":"admin.fp","password":"yami@123"}'
$resp = Invoke-RestMethod -Uri "https://centralapi.yamibuy.net/hub/admin/login" -Method POST -Headers @{"Content-Type"="application/json"} -Body $body
$resp.body.token
```

4. 将获取到的 token 和当前时间戳写入 `.kiro/token-cache.json`：

```json
{
  "token": "获取到的token",
  "obtained_at": "2026-03-14T10:00:00Z",
  "email": "admin.fp"
}
```

5. 使用 token 调用后续 API

### Token 缓存规则
- 缓存文件路径：`.kiro/token-cache.json`
- 有效期：12 小时（与 Central 后台 session 一致）
- 判断过期：比较 `obtained_at` 与当前时间，超过 12 小时则重新登录
- 登录失败时：提示用户检查网络或账号状态

### 注意事项
- `.kiro/token-cache.json` 已加入 `.gitignore`，不会提交到仓库
- 如果登录接口返回非 200 或无 token，提示用户手动登录获取
- 此账号为共用管理账号，仅用于只读查询

## Bash 调用示例（Linux 环境）

```bash
# 登录获取 token
TOKEN=$(curl -s -X POST https://centralapi.yamibuy.net/hub/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin.fp","password":"yami@123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['body']['token'])")
echo "Token: $TOKEN"

# 写入缓存
python3 -c "import json,datetime; json.dump({'token':'$TOKEN','obtained_at':datetime.datetime.now().isoformat(),'email':'admin.fp'}, open('.kiro/token-cache.json','w'))"
```
