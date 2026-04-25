---
inclusion: auto
---

# Kibana 日志查询 Skill

## 用途
通过 Elasticsearch API 直接查询日志内容，将结果返回给客服，无需客服自行打开 Kibana。

## 支持的索引

| 索引 | 用途 |
|------|------|
| `k8s-ec-customer-service-log-*` | 邀请好友设备 ID 风控、注册流程 |
| `k8s-central-customer-service-log-*` | 奖励发放、风控拦截 |
| `k8s-ec-so-service-log-*` | 订单相关 |
| `k8s-ec-so-job-service-log-*` | 订单确认邮件、发货通知 |
| `k8s-central-so-service-log-*` | 发货流程 |
| `k8s-ec-payment-service-log-*` | 支付相关 |

## 查询方式（Bash/Curl）

### 通用查询模板
```bash
curl -s "https://kibana.yamibuy.net/internal/search/es" \
  -H "Content-Type: application/json" \
  -H "kbn-xsrf: true" \
  -d '{
    "params": {
      "index": "索引名",
      "body": {
        "size": 20,
        "query": {
          "bool": {
            "must": [
              {"query_string": {"query": "\"搜索关键词\""}},
              {"range": {"@timestamp": {"gte": "now-7d", "lte": "now"}}}
            ]
          }
        },
        "sort": [{"@timestamp": "desc"}],
        "_source": ["message", "@timestamp", "fields.log_name"]
      }
    }
  }'
```

### 解析结果
```bash
# 查询并提取日志内容
curl -s "https://kibana.yamibuy.net/internal/search/es" \
  -H "Content-Type: application/json" \
  -H "kbn-xsrf: true" \
  -d '{...}' | python3 -c "
import sys, json
data = json.load(sys.stdin)
hits = data.get('rawResponse', {}).get('hits', {}).get('hits', [])
for h in hits:
    src = h.get('_source', {})
    ts = src.get('@timestamp', '')
    msg = src.get('message', '')
    print(f'[{ts}] {msg}')
"
```

## 常见查询场景

### 邀请好友设备 ID 风控排查
- 索引：`k8s-ec-customer-service-log-*`
- 关键词：`"邀请人user_id-被邀请人user_id"`（如 `"123456-789012"`）
- 时间范围：最近 30 天

### 验证码发送排查
- 索引：`k8s-ec-customer-service-log-*`
- 关键词：用户邮箱（如 `"test@gmail.com"`）
- 时间范围：最近 1 天

### 订单确认邮件排查
- 索引：`k8s-ec-so-job-service-log-*`
- 关键词：订单号
- 查找：`"Order Submit Email Send Success"` 或 `"email send succeed"`

### 支付日志排查
- 索引：`k8s-ec-payment-service-log-*`
- 关键词：purchase_id 或 transaction_id

## 注意事项
- 日志保留时间有限，太久远的日志可能已被清理
- 查询结果默认返回最近 20 条，可调整 size 参数
- 搜索关键词用双引号包裹表示精确匹配
- 时间范围尽量缩小，避免查询超时
- 如果结果太多，增加过滤条件缩小范围
