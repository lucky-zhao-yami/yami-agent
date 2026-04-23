# 订单状态字段流转详解

## 核心状态字段说明

订单表 `order_info` 中有4个核心状态字段，它们共同决定订单的完整状态：

| 字段名 | 类型 | 说明 | 枚举类 |
|--------|------|------|--------|
| order_status | Integer | 订单状态 | OrderStatusEnum |
| shipping_status | Integer | 配送状态 | ShippingStatusEnum |
| pay_status | Integer | 支付状态 | PayStatusEnum |
| abnormal | Integer | 异常状态 | 无枚举(常量定义) |

## 状态枚举定义

### 订单状态 (order_status)

```java
public enum OrderStatusEnum {
    UNCONFIRMED("未确认", 0),      // 未使用
    CONFIRMED("已确认", 1),         // 订单已确认
    CANCEL("取消", 2),              // 已取消(未使用)
    REFUND("退货", 4),              // 退货/退款
    SHIIPED("已发货", 5)            // 已发货
}
```

### 配送状态 (shipping_status)

```java
public enum ShippingStatusEnum {
    UNSHIPPED("未发货", 0),         // 未发货
    SHIPPED("已发货", 1),           // 已发货
    PREOCCUPIED("已预占", 2),       // 库存已预占
    PICKUP("拣货中", 3),            // WMS拣货中
    SHIPPING("发货中", 5),          // 发货处理中
    RETURNED("已退货", 8)           // 已退货
}
```

### 支付状态 (pay_status)

```java
public enum PayStatusEnum {
    UNPAID("未付款", 0),            // 待支付
    PAYMENT("付款验证中", 1),       // 支付处理中
    PAID("已付款", 2),              // 已付款
    REFUNDED("已退款", 3),          // 已全额退款
    PARTIAL_REFUNDED("部分退款", 4) // 部分退款
}
```

### 异常状态 (abnormal)

```java
// 常量定义 (无枚举类)
ORDER_ABNORMAL_READY = 0           // 正常
ORDER_ABNORMAL_NOREADY = -1        // 拼团未成团
ORDER_ABNORMAL_BLOCKED = -2        // 订单被阻止
ORDER_ABNORMAL_APPROVE = 4         // 风控通过
ORDER_ABNORMAL_LOCK = 102          // 订单锁定
ORDER_ABNORMAL_QUERY = 110         // 风控检测中
ORDER_ABNORMAL_WAIT_APPROVE = 120  // 等待人工审核
ORDER_ABNORMAL_DENIED = 130        // 风控拒绝
```

## 完整状态流转图

```
用户下单
    │
    ▼
┌─────────────────────────────────────────┐
│ 初始状态 (EC-SO)                         │
│ order_status: 1 (已确认)                 │
│ shipping_status: 0 (未发货)              │
│ pay_status: 0 (未付款) 或 1 (验证中)     │
│ abnormal: 0 (正常) 或 -1 (拼团)          │
└──────────────┬──────────────────────────┘
               │
               │ 用户支付
               ▼
┌─────────────────────────────────────────┐
│ 支付成功 (EC-Payment → EC-SO-Job)       │
│ order_status: 1 (已确认)                 │
│ shipping_status: 0 (未发货)              │
│ pay_status: 2 (已付款)                   │
│ abnormal: 0 (正常)                       │
└──────────────┬──────────────────────────┘
               │
               │ 订单落库完成
               ▼
┌─────────────────────────────────────────┐
│ 风控检测 (Central-FP)                    │
└──────────────┬──────────────────────────┘
               │
               ├─────────────┬─────────────┐
               │             │             │
               ▼             ▼             ▼
         ┌─────────┐   ┌─────────┐   ┌─────────┐
         │ 自动通过 │   │ 需人工   │   │ 自动拒绝 │
         │ abnormal │   │ abnormal │   │ abnormal │
         │ = 4     │   │ = 120   │   │ = 130   │
         └────┬────┘   └────┬────┘   └────┬────┘
              │             │             │
              │             │             │ 取消订单
              │             │             └──────────┐
              │             │                        │
              │             │ 人工审核               │
              │             ├──────┬─────────┐       │
              │             │      │         │       │
              │             ▼      ▼         ▼       │
              │         ┌────┐  ┌────┐   ┌────┐     │
              │         │通过│  │拒绝│   │    │     │
              │         │ 4 │  │130│   │    │     │
              │         └─┬──┘  └─┬──┘   └────┘     │
              │           │       │                  │
              └───────────┴───────┘                  │
                          │                          │
                          │ WMS拣货发货              │
                          ▼                          │
              ┌─────────────────────┐                │
              │ WMS拣货 (Central-SO) │                │
              │ shipping_status: 3   │                │
              │ (拣货中)             │                │
              └──────────┬──────────┘                │
                         │                           │
                         ▼                           │
              ┌─────────────────────┐                │
              │ 订单发货 (Central-SO)│                │
              │ order_status: 5      │                │
              │ shipping_status: 1   │                │
              │ pay_status: 2        │                │
              └──────────┬──────────┘                │
                         │                           │
                         ▼                           │
              ┌─────────────────────┐                │
              │ 用户收货             │                │
              │ (订单完成)           │                │
              └─────────────────────┘                │
                                                      │
                         ┌────────────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ 订单取消/退款        │
              │ order_status: 4      │
              │ shipping_status: 8   │
              │ pay_status: 3        │
              └─────────────────────┘
```

## 关键节点状态变更

### 订单创建 (EC-SO)

**位置:** `OrderService.java` - `submitOrderV3()`

```java
// 设置初始状态
orderInfo.setOrder_status(OrderStatusEnum.CONFIRMED.getType());  // 1
orderInfo.setShipping_status(ShippingStatusEnum.UNSHIPPED.getType());  // 0

// 支付状态根据流程版本和订单类型设置
if (FLOW_VERSION.equals(flow_version)) {
    orderInfo.setPay_status(PayStatusEnum.PAYMENT.getType());  // 1 (新流程)
} else {
    orderInfo.setPay_status(PayStatusEnum.UNPAID.getType());   // 0 (老流程)
}

// 异常状态
if (orderInfo.getFrom_ad() == 1) {  // 拼团订单
    orderInfo.setAbnormal(-1);
} else {
    orderInfo.setAbnormal(0);  // 正常
}
```

**状态组合:** `1-0-0` 或 `1-0-1`

### 支付成功 (Central-SO)

**位置:** `OrderPayService.java` - `payOrder()`

```java
// 更新为已付款状态
SoOrderInfo info = new SoOrderInfo();
info.setOrder_status(OrderStatusEnum.CONFIRMED.getType());  // 1
info.setShipping_status(ShippingStatusEnum.UNSHIPPED.getType());  // 0
info.setPay_status(PayStatusEnum.PAID.getType());  // 2
info.setPurchase_id(purchase_id);

soOrderActionService.updateOrderByPurchaseId(info);
```

**状态组合:** `1-0-2`

### 风控流程 (Central-FP)

**位置:** `OrderFPService.java`

**风控初始化:**
```java
// abnormal: 0 → 110 (风控检测中)
soOrderActionService.updateAbnormal(order_id, 110);
```

**等待人工审核:**
```java
// abnormal: 110 → 120 (等待审核)
soOrderActionService.updateAbnormal(order_id, 120);
```

**审核通过:**
```java
// abnormal: 110/120 → 4 (通过)
soOrderActionService.updateAbnormal(order_id, 4);
```

**审核拒绝:**
```java
// abnormal: 110/120 → 130 (拒绝)
soOrderActionService.updateAbnormal(order_id, 130);
// 后续会自动取消订单
```

**状态组合:** 
- 检测中: `1-0-2` + `abnormal=110`
- 等待审核: `1-0-2` + `abnormal=120`
- 通过: `1-0-2` + `abnormal=4`
- 拒绝: `1-0-2` + `abnormal=130` → 取消

### WMS拣货 (Central-SO)

**位置:** `OrderShipService.java`

```java
// WMS开始拣货
info.setShipping_status(ShippingStatusEnum.PICKUP.getType());  // 3
orderActionServece.updateOrderStatus4Shipping(info);
```

**状态组合:** `1-3-2`

### 订单发货 (Central-SO)

**位置:** `OrderShipService.java` - `shipOrder()`

```java
// 订单发货
SoOrderInfo info = new SoOrderInfo();
info.setOrder_id(order_id);
info.setOrder_status(OrderStatusEnum.SHIIPED.getType());  // 5
info.setShipping_status(ShippingStatusEnum.SHIPPED.getType());  // 1
info.setTracking_number(tracking_number);
info.setInvoice_no(invoice_no);

orderActionServece.updateOrderStatus4Shipping(info);
```

**状态组合:** `5-1-2`

### 订单退款 (Central-SO)

**位置:** `RefundOrderService.java`

**全额退款:**
```java
updateOrderStatus(
    order_id, 
    OrderStatusEnum.REFUND.getType(),  // 4
    ShippingStatusEnum.RETURNED.getType(),  // 8
    PayStatusEnum.REFUNDED.getType()  // 3
);
```

**部分退款:**
```java
updateOrderStatus(
    order_id, 
    OrderStatusEnum.REFUND.getType(),  // 4
    ShippingStatusEnum.RETURNED.getType(),  // 8
    PayStatusEnum.PARTIAL_REFUNDED.getType()  // 4
);
```

**状态组合:** `4-8-3` 或 `4-8-4`

## 服务间状态流转

```
┌──────────────┐
│   EC-SO      │  创建订单: 1-0-0/1-0-1
│  (订单服务)   │  abnormal: 0 或 -1
└──────┬───────┘
       │
       │ MQ: order.finish
       ▼
┌──────────────┐
│ EC-SO-Job    │  支付成功: 1-0-1
│ (订单落库)    │
└──────┬───────┘
       │
       │ MQ: persistence.order_v2
       ▼
┌──────────────┐
│ EC-SO-Job    │  持久化: 1-0-2
│ (持久化)      │  abnormal: 0
└──────┬───────┘
       │
       │ MQ: order.status.save_db
       ▼
┌──────────────┐
│ Central-FP   │  风控检测
│  (风控中心)   │  abnormal: 0 → 110 → 120/4/130
└──────┬───────┘
       │
       │ abnormal = 4 (通过)
       ▼
┌──────────────┐
│ Central-SO   │  WMS拣货: 1-3-2
│  (订单中心)   │  发货: 5-1-2
└──────────────┘
```

## 常见状态组合说明

| 状态组合 | 说明 | 用户可见状态 |
|---------|------|-------------|
| 1-0-0 | 待支付 | 待支付 |
| 1-0-1 | 支付处理中 | 支付处理中 |
| 1-0-2 | 已支付待发货 | 待发货 |
| 1-0-2 (abnormal=110) | 风控检测中 | 待发货 |
| 1-0-2 (abnormal=120) | 人工审核中 | 待发货 |
| 1-0-2 (abnormal=130) | 风控拒绝 | 订单异常 |
| 1-0-2 (abnormal=4) | 风控通过 | 待发货 |
| 1-2-2 | 库存预占 | 待发货 |
| 1-3-2 | 拣货中 | 配货中 |
| 1-5-2 | 发货中 | 配送中 |
| 5-1-2 | 已发货 | 运输中 |
| 4-8-3 | 已退款 | 已退款 |
| 4-8-4 | 部分退款 | 部分退款 |

## 状态更新的关键方法

### EC-SO服务
```java
// OrderService.java
orderInfo.setOrder_status(1);
orderInfo.setShipping_status(0);
orderInfo.setPay_status(0/1);
orderInfo.setAbnormal(0/-1);
```

### Central-SO服务
```java
// OrderPayService.java - 支付成功
soOrderActionService.updateOrderByPurchaseId(info);  // 更新整个purchase

// OrderShipService.java - 发货
orderActionServece.updateOrderStatus4Shipping(info);  // 更新发货状态

// RefundOrderService.java - 退款
updateOrderStatus(order_id, 4, 8, 3);  // 更新退款状态
```

### Central-FP服务
```java
// OrderFPService.java - 风控流程
soOrderActionService.updateAbnormal(order_id, abnormal_value);  // 只更新abnormal
```

## 状态查询最佳实践

### 综合状态判断

```java
// 正确的订单状态判断方式
public String getOrderDisplayStatus(OrderInfo order) {
    
    // 1. 优先检查异常状态
    if (order.getAbnormal() != 0) {
        switch (order.getAbnormal()) {
            case -1: return "拼团中";
            case -2: return "订单异常";
            case 110: return "风控检测中";
            case 120: return "人工审核中";
            case 130: return "订单被拒绝";
            case 4: break; // 风控通过，继续判断其他状态
            default: return "订单异常";
        }
    }
    
    // 2. 检查支付状态
    if (order.getPay_status() == 0) {
        return "待支付";
    } else if (order.getPay_status() == 1) {
        return "支付处理中";
    } else if (order.getPay_status() == 3) {
        return "已退款";
    } else if (order.getPay_status() == 4) {
        return "部分退款";
    }
    
    // 3. 检查订单和配送状态
    if (order.getOrder_status() == 5) {
        return "已发货";
    } else if (order.getOrder_status() == 4) {
        return "已退货";
    } else if (order.getShipping_status() == 3) {
        return "配货中";
    } else if (order.getShipping_status() == 5) {
        return "发货中";
    } else {
        return "待发货";
    }
}
```

### 状态变更日志

```java
// 记录状态变更历史
public void logStatusChange(Integer order_id, String field, Object oldValue, Object newValue, String reason) {
    
    OrderStatusLog log = new OrderStatusLog();
    log.setOrder_id(order_id);
    log.setField_name(field);
    log.setOld_value(String.valueOf(oldValue));
    log.setNew_value(String.valueOf(newValue));
    log.setChange_reason(reason);
    log.setChange_time(System.currentTimeMillis());
    log.setOperator(getCurrentOperator());
    
    orderStatusLogMapper.insert(log);
}
```

## 注意事项

1. **状态一致性**: 4个字段必须配合使用，不能单独判断订单状态
2. **abnormal优先级**: 当abnormal不为0时，需要优先处理异常状态
3. **风控阻断**: abnormal=120或130时，订单会被阻止发货
4. **拼团特殊处理**: abnormal=-1的拼团订单，退款时不退库存
5. **状态回滚**: 某些异常情况下需要回滚状态，需要记录操作日志
6. **并发控制**: 状态更新时需要考虑并发情况，使用乐观锁或分布式锁
7. **监控告警**: 异常状态需要及时告警和人工介入