---
name: api-test
description: 对 Yamibuy 微服务进行 HTTP 接口测试。支持 UAT、DEV、GQC 多环境切换，自动携带 token 和 headers。当用户需要测试接口、验证 API 返回、调试服务时使用。
---

# API 接口测试技能

对 Yamibuy 微服务进行 HTTP 接口测试，支持多环境切换。

## 环境配置

| 环境 | EC 域名 | Central 域名 |
|------|---------|-------------|
| DEV | https://dev-ecapi.yamibuy.tech | https://dev-centralapi.yamibuy.tech |
| UAT | https://uat-ecapi.yamibuy.tech | https://uat-centralapi.yamibuy.tech |
| GQC | http://gqc-ecapi.yamibuy.tech | https://gqc-centralapi.yamibuy.tech |

### 服务与域名映射

| 服务前缀 | 域名类型 |
|---------|--------|
| ec-* | EC 域名 |
| central-* | Central 域名 |

### URL 拼接规则

服务名到路径前缀的映射：去掉 `-service` 后缀，保留其余部分作为路径前缀。

| 服务名 | 路径前缀 | 示例 URL |
|--------|---------|----------|
| ec-activity-service | /ec-activity | https://uat-ecapi.yamibuy.tech/ec-activity/... |
| ec-customer-service | /ec-customer | https://uat-ecapi.yamibuy.tech/ec-customer/... |
| ec-so-service | /ec-so | https://uat-ecapi.yamibuy.tech/ec-so/... |
| central-so-service | /central-so | https://uat-centralapi.yamibuy.tech/central-so/... |

## 登录获取 Token

登录接口在 ec-customer-service，需要两步：

### 登录流程

```bash
# 1. 获取匿名 token
ANON_TOKEN=$(curl -s "${EC_BASE}/ec-customer/users/get_token" | python3 -c "import sys,json; print(json.load(sys.stdin)['body']['token'])")

# 2. 用匿名 token + 账号密码登录
TOKEN=$(curl -s -X POST "${EC_BASE}/ec-customer/users/login" \
  -H "Content-Type: application/json" \
  -H "token: ${ANON_TOKEN}" \
  -d '{"email": "${EMAIL}", "pwd": "${PASSWORD}"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['body']['token'])")
```

### 登录请求参数

| 字段 | 类型 | 说明 |
|------|------|------|
| email | String | 登录邮箱 |
| pwd | String | 密码 |

### 登录响应

```json
{
  "messageId": "10000",
  "body": {
    "uid": 123456,
    "name": "用户名",
    "token": "登录后的token",
    "avatar": "头像URL"
  }
}
```

### 测试账号

由用户提供，格式：`email` + `pwd`

## 执行方式

使用 `curl` 命令执行 HTTP 请求：

```bash
# GET 请求
curl -s -w "\nHTTP_CODE:%{http_code}\nTIME:%{time_total}s" \
  -H "token: ${TOKEN}" \
  -H "y_language: zh_CN" \
  "${BASE_URL}${PATH}"

# POST 请求
curl -s -w "\nHTTP_CODE:%{http_code}\nTIME:%{time_total}s" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "token: ${TOKEN}" \
  "${BASE_URL}${PATH}" \
  -d '${BODY}'
```

## 请求 Headers

所有请求默认携带：

| Header | 说明 |
|--------|------|
| token | 用户登录 token（自动获取） |
| y_language | 语言，默认 zh_CN，可切换 en_US、zh_TW、ja、ko |

## 自动化测试流程

1. 检查是否有缓存的有效 token
2. 如果没有或已过期，自动执行登录流程获取新 token
3. 携带 token 发起目标接口请求
4. 验证响应结果

## 结果验证

每次请求后自动检查：
1. HTTP 状态码是否为 200
2. `messageId` 是否为业务成功码
3. `body` 是否包含预期字段
4. 响应时间是否合理（< 3s）

## 测试报告格式

```
🔑 登录成功 [UAT] uid=123456
✅ GET /activity/2026 [UAT] - 200 OK (0.35s)
   messageId: 200
   body.p1.showPage: 1

❌ GET /activity/2026 [UAT] - 500 Error (1.2s)
   错误信息: xxx
```

## 注意事项

- Token 过期后自动重新登录
- GQC 的 EC 域名是 HTTP（非 HTTPS）
- 大批量测试时注意请求频率
- 不同环境的数据库数据不同，注意测试数据准备


## 并发压测

当需要评估接口并发承载能力时使用。触发词：压测, 并发测试, bench, benchmark, QPS, 性能测试

### 工具：hey

单二进制 HTTP 压测工具，无依赖。

```bash
# 安装
curl -sL https://hey-release.s3.us-east-2.amazonaws.com/hey_linux_amd64 -o /tmp/hey && chmod +x /tmp/hey

# 基本用法: -n 总请求数  -c 并发数
/tmp/hey -n 200 -c 50 \
  -H "token: xxx" -H "y_language: zh_CN" \
  "https://uat-ecapi.yamibuy.tech/ec-activity/activity/2026"
```

### hey 常用参数

| 参数 | 说明 | 示例 |
|------|------|------|
| -n | 总请求数 | -n 200 |
| -c | 并发数 | -c 50 |
| -H | 请求头（可多个） | -H "token: xxx" |
| -m | HTTP方法 | -m POST |
| -d | POST body | -d '{"key":"val"}' |
| -T | Content-Type | -T "application/json" |
| -t | 超时秒数 | -t 30 |

### 测试流程

1. **预热**: 先 curl 请求 1-2 次，避免冷启动影响
2. **逐步加压**: 10 → 50 → 100 → 200 并发
3. **每轮请求数**: 并发数 × 2~4（如 50 并发跑 200 请求）
4. **找拐点**: QPS 开始下降、p99 飙升时即为瓶颈

### 关注指标

| 指标 | 健康标准 | 说明 |
|------|----------|------|
| 成功率 | 100% | 有失败说明服务不稳定 |
| QPS | 随并发上升 | 下降说明到瓶颈 |
| p50 | < 1s | 大部分用户体验 |
| p99 | < 3s | 长尾用户体验 |
| max | < 10s | 超过说明有严重排队 |

### 结果解读

- QPS 先升后降 → 拐点即最佳并发数
- p99 突然飙升 → 已过载
- 全部200但变慢 → 排队，未崩溃
- 出现非200 → 服务不稳定，需排查

### 注意事项

- WSL → UAT 有 ~600ms 网络延迟，QPS 偏低，关注相对趋势
- UAT 单实例，生产多实例承载力 ≈ 单实例 × 实例数
- 避免长时间高并发影响 UAT 其他人使用
- 同一用户 token 会命中缓存，多用户测试更真实
