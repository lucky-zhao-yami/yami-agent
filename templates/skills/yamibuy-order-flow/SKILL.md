---
name: "yamibuy-order-flow"
description: "当需要了解亚米网下单流程、订单状态流转、MQ 消息追踪、预占机制、风控流程、支付回调、订单落库时使用。触发词：亚米网, 订单流程, ec-so, central-so, ec-payment, RabbitMQ, 预占, 风控, order_status, shipping_status, pay_status, abnormal, persistence.order_v2, order.finish"
---

# 亚米网下单流程详解

亚米网电商平台完整的下单流程知识库，涵盖异步 MQ 架构、多服务协作、订单状态流转、风控检测等核心业务逻辑。

## 前置条件

1. 熟悉核心服务：EC-SO、EC-Payment、Central-SO、Central-FP
2. 了解订单状态字段：order_status、shipping_status、pay_status、abnormal
3. 了解预占资源机制和 MQ 消息流转

## 快速参考

| 功能模块 | 核心服务/组件 | 适用场景 |
|----------|-------------|----------|
| 用户下单 | EC-SO | C端下单请求处理、资源预占 |
| 支付处理 | EC-Payment | 第三方支付、支付回调 |
| 订单落库 | EC-SO-Job | 消费 MQ 消息、订单持久化 |
| 订单管理 | Central-SO | 订单状态管理、订单中心 |
| 风控检测 | Central-FP | 订单风险检测、人工审核 |
| 仓库发货 | WMS | 仓库管理、发货流程 |

## 核心业务流程

### 流程概览

亚米网下单流程采用**异步 MQ 架构**：

```
用户下单 → 订单预处理 → 资源预占 → 支付 → 订单落库 → 风控检测 → 仓库发货
```

### 技术特点

- **微服务架构**: 服务拆分清晰，职责明确
- **异步 MQ 架构**: 使用 RabbitMQ 实现服务间异步通信
- **预占资源模式**: 新流程 (flow_version=1.0) 采用预占库存、积分、优惠券等资源，支付成功后再扣减
- **多支付方式**: 支持信用卡、支付宝、微信支付、PayPal、Apple Pay 等
- **风控体系**: 完整的订单风控检测和人工审核流程
- **税务合规**: 集成 Avalara 税务系统，自动计算和上报税务信息

## 关键概念

### 订单状态字段

订单表中有 4 个核心状态字段：

| 字段 | 说明 | 典型值 |
|------|------|--------|
| `order_status` | 订单状态 | 未确认/已确认/取消/退货/已发货 |
| `shipping_status` | 配送状态 | 未发货/已发货/预占/拣货中/发货中/已退货 |
| `pay_status` | 支付状态 | 未付款/付款验证中/已付款/已退款/部分退款 |
| `abnormal` | 异常状态 | 正常/拼团未成团/订单阻止/风控相关状态 |

### 预占资源机制

新流程 (flow_version=1.0) 采用预占模式：
1. 下单时预占库存、积分、礼卡、优惠券
2. 支付成功后扣减真实资源
3. 超时未支付自动释放预占资源

### 关键 MQ 消息

| 消息 | 说明 |
|------|------|
| `order.finish` | 支付完成通知 |
| `persistence.order_v2` | 订单持久化请求 |
| `order.status.save_db` | 订单落库完成通知 |
| `so.purchase.canceled` | 延时取消订单 |

## 关键规则

### 开发规范
1. **状态判断**: 必须综合 4 个状态字段判断订单状态，不能单独使用
2. **异常处理**: 优先处理 abnormal 字段的异常状态
3. **MQ 消息**: 确保消息幂等性，支持重试机制
4. **配置管理**: 使用 Apollo 配置中心，避免硬编码

### 运维监控
1. **关键指标**: 订单提交成功率、支付成功率、MQ 消息堆积
2. **告警机制**: 企业微信告警、邮件告警
3. **日志追踪**: 使用 purchase_id 追踪完整订单流程

### 问题排查
1. **订单异常**: 检查 abnormal 字段和风控日志
2. **支付问题**: 查看第三方支付回调日志
3. **MQ 堆积**: 检查消费者状态和处理能力
4. **性能问题**: 分析数据库慢查询和 Redis 命中率

## 参考文档

- 了解整体流程和核心服务 → `references/flow-overview.md`
- 用户下单详细流程（EC-SO） → `references/order-submission.md`
- 支付处理流程（EC-Payment） → `references/payment-process.md`
- 订单落库流程（EC-SO-Job） → `references/order-persistence.md`
- MQ 消息队列配置 → `references/mq-configuration.md`
- 订单状态字段流转 → `references/order-status.md`
- 常见问题和监控告警 → `references/troubleshooting.md`
