---
name: "test-env-redis"
description: "测试环境 Redis 操作。当需要查看、删除、设置测试环境 Redis 缓存时使用。触发词：清缓存, Redis, 缓存key, DEL, 测试环境Redis"
---

# 测试环境 Redis 操作

通过 redis-cli 直接操作测试环境的 Redis 实例。

## 环境配置

| 环境 | Redis 地址 | 端口 | 密码 | 用途 |
|------|-----------|------|------|------|
| dev | dev-serverless-redis.yamibuy.tech | 6379 | 无 | 主 Redis |
| dev-lock | dev-lock-redis.yamibuy.tech | 6379 | 无 | 分布式锁 |
| uat | uat-serverless-redis.yamibuy.tech | 6379 | 无 | 主 Redis |
| uat-lock | uat-lock-redis.yamibuy.tech | 6379 | 无 | 分布式锁 |
| gqc | gqc-serverless-redis.yamibuy.tech | 6379 | 无 | 主 Redis |
| gqc-lock | gqc-lock-redis.yamibuy.tech | 6379 | 无 | 分布式锁 |

## 使用方式

**⚠️ 所有测试环境 Redis 都需要 TLS 连接。**

```bash
# 使用 redis-cli（需要 --tls 参数）
redis-cli -h {host} -p 6379 --tls {command}

# 使用 Python（推荐，已验证可用）
/mnt/d/code/yami/kiro-wecom-bridge/.venv/bin/python3 -c "
import redis
r = redis.Redis(host='{host}', port=6379, decode_responses=True, ssl=True, ssl_cert_reqs=None, socket_timeout=5)
print(r.{command})
"
```

### 常用操作示例

```python
# 删除 key
r.delete('key_name')

# 查看 key
r.get('key_name')

# 查看 TTL
r.ttl('key_name')

# 模糊搜索 key（谨慎使用）
r.keys('pattern*')

# 查看 key 类型
r.type('key_name')

# 指定 db
r = redis.Redis(host='{host}', port=6379, db={n}, decode_responses=True, ssl=True, ssl_cert_reqs=None, socket_timeout=5)
```

## 常用缓存 key 速查

| 服务 | 缓存 key | 说明 | TTL |
|------|---------|------|-----|
| ec-inventory | `inventory:warehouse:physical:list` | 仓库列表缓存 | 永不过期 |
| ec-customer | `ec-customer:warehouse:all` | 仓库列表缓存 | 3600s |
| ec-customer | `customer:zipcode.wh.mapping:{zip3}` | zipcode→仓库映射 | 7天 |
| central-so | `central-so:warehouse:all` | 仓库列表缓存 | 3600s |
| ec-so | `ec-so:all_warehouses:all` | 仓库列表缓存 | 3600s |

## 安全规则

- ⛔ 禁止操作生产环境 Redis
- ⛔ 禁止使用 FLUSHDB / FLUSHALL
- ⛔ 禁止在生产环境使用 KEYS 命令
- ✅ 仅限 dev / uat / gqc 环境操作
