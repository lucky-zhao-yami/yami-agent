---
inclusion: auto
---

# Central API 数据查询 Skill

## 用途
通过 Central 后台 API 接口查询用户信息，解决 xysc_users 表 email 字段脱敏无法直接查询的问题。

## 接口配置

### Base URL
```
https://centralapi.yamibuy.net
```

### 认证方式
- 请求头 `token`: Central 后台登录 token
- 请求头 `yami-origin`: `central-web`

### Token 管理（自动获取）
- Token 通过 central-login skill 自动获取，无需用户手动提供
- 流程：检查 `.kiro/token-cache.json` → 有效则直接用 → 过期则自动登录刷新
- 如果 API 返回 401/403，自动重新登录获取新 token 并重试一次
- 自动登录失败时，再提示用户手动提供 token 或去 Central 后台获取
- Central 后台地址：https://central.yamibuy.net

---

## 可用接口

### 1. 通过邮箱查询用户信息（查 user_id）

**接口地址：** `POST /customer/customers/search`

**请求头：**
```
Content-Type: application/json
token: {用户提供的token}
yami-origin: central-web
```

**请求体：**
```json
{
  "keyword": "",
  "tag": "",
  "tag_key": "",
  "points_from": "",
  "points_to": "",
  "status": "",
  "order": {
    "orderColumn": "customer_id",
    "orderRule": "desc"
  },
  "pageSize": 15,
  "startColumn": 0,
  "draw": 1,
  "user_id": "",
  "allowTimeOut": 1,
  "token": "{用户提供的token}",
  "email": "{要查询的邮箱}",
  "tagUserCount": ""
}
```

**返回字段说明：**
- `body.data[].customer_id` → user_id
- `body.data[].email` → 邮箱（未脱敏）
- `body.data[].customer_name` → 用户名
- `body.data[].points` → 积分
- `body.data[].reg_time` → 注册时间（微秒级时间戳，需除以 1000000 转换）
- `body.data[].is_validated` → 邮箱验证状态
- `body.data[].mobile_phone` → 手机号
- `body.data[].first_order_time` → 首单时间
- `body.data[].order_count` → 订单数
- `body.data[].order_amount` → 订单金额
- `body.recordsFiltered` → 匹配记录数

**PowerShell 调用示例：**
```powershell
$headers = @{
  "Content-Type" = "application/json"
  "token" = "{TOKEN}"
  "yami-origin" = "central-web"
}
$body = '{"keyword":"","tag":"","tag_key":"","points_from":"","points_to":"","status":"","order":{"orderColumn":"customer_id","orderRule":"desc"},"pageSize":15,"startColumn":0,"draw":1,"user_id":"","allowTimeOut":1,"token":"{TOKEN}","email":"{EMAIL}","tagUserCount":""}'
$resp = Invoke-RestMethod -Uri "https://centralapi.yamibuy.net/customer/customers/search" -Method POST -Headers $headers -Body $body
$resp | ConvertTo-Json -Depth 10
```

### 2. 通过 user_id 查询用户邮箱

**接口地址：** `POST /customer/customers/search`（同接口 1，改用 user_id 字段查询）

**请求体：**
```json
{
  "keyword": "",
  "tag": "",
  "tag_key": "",
  "points_from": "",
  "points_to": "",
  "status": "",
  "order": {
    "orderColumn": "customer_id",
    "orderRule": "desc"
  },
  "pageSize": 15,
  "startColumn": 0,
  "draw": 1,
  "user_id": "{要查询的user_id}",
  "allowTimeOut": 1,
  "token": "{TOKEN}",
  "email": "",
  "tagUserCount": ""
}
```

**Bash/Curl 调用示例：**
```bash
curl -s -X POST https://centralapi.yamibuy.net/customer/customers/search \
  -H "Content-Type: application/json" \
  -H "token: ${TOKEN}" \
  -H "yami-origin: central-web" \
  -d '{"keyword":"","tag":"","tag_key":"","points_from":"","points_to":"","status":"","order":{"orderColumn":"customer_id","orderRule":"desc"},"pageSize":15,"startColumn":0,"draw":1,"user_id":"要查询的user_id","allowTimeOut":1,"token":"'${TOKEN}'","email":"","tagUserCount":""}' | python3 -c "import sys,json; data=json.load(sys.stdin); [print(f\"user_id={u['customer_id']}, email={u['email']}, name={u.get('customer_name','')}\") for u in data.get('body',{}).get('data',[])]"
```

**适用场景：** 已知 user_id（如通过邀请码、数据库查询等获得），需要查询该用户的真实邮箱时使用。

---

## 使用规则

### 当客服提供邮箱需要查 user_id 时：
1. 通过 central-login skill 自动获取 token（检查缓存 → 过期则登录刷新）
2. 使用 token 调用接口 1 通过邮箱查询 user_id
3. 如果返回 401/403，自动重新登录获取新 token 并重试
4. 如果自动登录也失败，提示用户手动提供 token 或去 Central 后台查询
5. 查到 user_id 后，继续用 SQL 查询 crm_invite 等表完成后续排查

### 当已有 user_id 需要查真实邮箱时：
1. 通过 central-login skill 自动获取 token
2. 使用 token 调用接口 2 通过 user_id 查询邮箱
3. 直接将查到的邮箱返回给客服，无需再让客服去 Central 后台手动查

### 注意事项
- 仅用于只读查询
- 接口返回的数据是未脱敏的，遵循 steering 中的隐私规则
- 如果自动登录和接口都不可用，回退到让客服去 Central 后台手动查询
- Central API 返回的部分字段（如 first_order_time、mobile_phone）可能为 null 或不完整，API 主要用于通过邮箱查 user_id，详细用户信息仍以数据库查询结果为准

## Bash/Curl 调用示例（Linux 环境）

### 登录获取 token
```bash
TOKEN=$(curl -s -X POST https://centralapi.yamibuy.net/hub/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin.fp","password":"yami@123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['body']['token'])")
```

### 通过邮箱查询 user_id
```bash
curl -s -X POST https://centralapi.yamibuy.net/customer/customers/search \
  -H "Content-Type: application/json" \
  -H "token: ${TOKEN}" \
  -H "yami-origin: central-web" \
  -d '{"keyword":"","tag":"","tag_key":"","points_from":"","points_to":"","status":"","order":{"orderColumn":"customer_id","orderRule":"desc"},"pageSize":15,"startColumn":0,"draw":1,"user_id":"","allowTimeOut":1,"token":"'${TOKEN}'","email":"要查询的邮箱","tagUserCount":""}' | python3 -c "import sys,json; data=json.load(sys.stdin); [print(f\"user_id={u['customer_id']}, email={u['email']}\") for u in data.get('body',{}).get('data',[])]"
```
