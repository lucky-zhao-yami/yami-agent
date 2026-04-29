# 禅道 Bug/任务查询

查询禅道（ZenTao）上的 Bug 和任务信息。通过 REST API 访问。

## 触发条件

当用户提到 bug、禅道、zentao、任务查询、缺陷 时使用。

## 认证

先获取 token，后续请求带 Token header：

```bash
# 登录获取 token
TOKEN=$(curl -s -X POST "${ZENTAO_URL}/api.php/v1/tokens" \
  -H "Content-Type: application/json" \
  -d '{"account":"'"${ZENTAO_USERNAME}"'","password":"'"${ZENTAO_PASSWORD}"'"}' | jq -r '.token')
```

## API 列表

### 获取产品列表
```bash
curl -s -H "Token: $TOKEN" "${ZENTAO_URL}/api.php/v1/products" | jq .
```

### 获取 Bug 列表
```bash
# 按产品查询（productId 替换为实际 ID）
curl -s -H "Token: $TOKEN" "${ZENTAO_URL}/api.php/v1/products/{productId}/bugs?status=unclosed&limit=20" | jq .

# 查我的 Bug
curl -s -H "Token: $TOKEN" "${ZENTAO_URL}/api.php/v1/bugs?status=assigntome&limit=20" | jq .
```

status 可选值：`all` | `unclosed` | `openedbyme` | `assigntome` | `resolvedbyme` | `toclosed` | `unresolved`

### 获取单个 Bug 详情
```bash
curl -s -H "Token: $TOKEN" "${ZENTAO_URL}/api.php/v1/bugs/{id}" | jq .
```

### 搜索 Bug
```bash
curl -s -H "Token: $TOKEN" "${ZENTAO_URL}/api.php/v1/bugs?keyword={关键词}" | jq .
```

### 获取任务列表
```bash
# 按项目查询
curl -s -H "Token: $TOKEN" "${ZENTAO_URL}/api.php/v1/projects/{projectId}/tasks?status=doing&limit=20" | jq .

# 查我的任务
curl -s -H "Token: $TOKEN" "${ZENTAO_URL}/api.php/v1/tasks?assignedTo=me&limit=20" | jq .
```

status 可选值：`all` | `wait` | `doing` | `done` | `closed`

### 获取单个任务详情
```bash
curl -s -H "Token: $TOKEN" "${ZENTAO_URL}/api.php/v1/tasks/{id}" | jq .
```

## 环境变量

- `ZENTAO_URL` — 禅道地址（如 `https://bugs.yamibuy.tech`）
- `ZENTAO_USERNAME` — 用户名
- `ZENTAO_PASSWORD` — 密码

## 注意事项

- Token 过期（401）时需重新登录获取
- 分页参数：`limit`（每页数量）、`page`（页码）
