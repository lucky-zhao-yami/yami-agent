---
inclusion: auto
---

# Apollo 配置查询

## 用途
查询 Yamibuy Apollo 配置中心的服务配置项，用于排查问题时确认开关状态、限额、URL 等配置值。

## 脚本位置
`scripts/query_apollo.sh`

## 用法

```bash
# 查询某服务的所有配置
bash scripts/query_apollo.sh <app_id>

# 查询指定配置项（支持模糊匹配）
bash scripts/query_apollo.sh <app_id> <key>

# 查询 public namespace
bash scripts/query_apollo.sh <app_id> "" <namespace>
```

## 参数

| 参数 | 说明 | 示例 |
|------|------|------|
| app_id | 服务名，对应 application.properties 中的 app.id | ec-so-service |
| key | 配置项名称，支持模糊匹配（可选） | order.note |
| namespace | 命名空间（默认 application） | public_ec, public_central |

## 常用 app_id

| app_id | 服务 |
|--------|------|
| ec-so-service | EC 订单服务 |
| ec-customer-service | EC 客户服务 |
| ec-payment-service | EC 支付服务 |
| ec-rma-service | EC 退货服务 |
| central-so-service | Central 订单服务 |
| central-customer-service | Central 客户服务 |
| central-rma-service | Central RMA 服务 |
| central-payment-service | Central 支付服务 |
| public | 公共配置（需指定 namespace） |

## 常用 namespace

| namespace | 说明 |
|-----------|------|
| application | 服务私有配置（默认） |
| public_ec | EC 公共配置 |
| public_central | Central 公共配置 |

## 示例

```bash
# 查 ec-so-service 的订单取消超时配置
bash scripts/query_apollo.sh ec-so-service order_canceled_timeout

# 查 ec-so-service 的地址修改开关
bash scripts/query_apollo.sh ec-so-service order.address.change

# 查 public_ec 的所有配置
bash scripts/query_apollo.sh public "" public_ec

# 查 ec-payment-service 的 stripe 相关配置
bash scripts/query_apollo.sh ec-payment-service stripe
```
