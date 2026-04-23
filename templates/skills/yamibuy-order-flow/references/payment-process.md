# 支付处理流程 (EC-Payment)

## 支付流程概览

```
用户发起支付 → 调用第三方支付 → 接收支付回调 → 完成订单处理 → 发送MQ通知
```

## Step 1: 用户发起支付

```java
// 用户在前端选择支付方式，调用EC-Payment接口
// 根据支付方式路由到不同的Controller
// - CardStripeController (Stripe信用卡)
// - CardBraintreeController (Braintree信用卡)
// - AlipayController (支付宝)
// - WechatController (微信支付)
// - PaypalController (PayPal)
// 等等...
```

### 支持的支付方式

| 支付方式 | 提供商 | 支持功能 |
|---------|--------|----------|
| 信用卡 | Stripe | Visa, MasterCard, American Express |
| 信用卡 | Braintree | Visa, MasterCard, PayPal, Venmo, Apple Pay |
| 支付宝 | 官方 | 扫码支付、H5支付 |
| 支付宝 | Citcon | 北美本地化支付宝 |
| 微信支付 | Citcon | 北美本地化微信支付 |
| Cash App | Citcon | 美国本地移动支付 |
| PayPal | Braintree | PayPal账户支付 |

## Step 2: 调用第三方支付

```java
// PaymentService接口
public interface PaymentService {
    Map<String,String> charge(ChargeRequest chargeRequest);  // 发起支付
    NotifyResponse notify(Object sParam);                     // 接收回调
    String refund(RefundRequest refundRequest);               // 退款
}

// 各支付方式实现类
// - StripeService
// - BraintreeService
// - AlipayService
// - WechatService
// 等等...
```

### Stripe支付示例

```java
// StripeService.java
public Map<String,String> charge(ChargeRequest chargeRequest) {
    // 1. 构建Stripe支付参数
    Map<String, Object> params = new HashMap<>();
    params.put("amount", chargeRequest.getAmount() * 100); // 转换为分
    params.put("currency", "usd");
    params.put("source", chargeRequest.getToken());
    params.put("description", "Order: " + chargeRequest.getOrderId());
    
    // 2. 调用Stripe API
    Charge charge = Charge.create(params);
    
    // 3. 返回结果
    Map<String, String> result = new HashMap<>();
    result.put("transaction_id", charge.getId());
    result.put("status", charge.getStatus());
    return result;
}
```

### 支付重试机制

```properties
# Stripe支付重试配置
stripe_pay_retry_time = 15
```

## Step 3: 接收支付回调

```java
// 第三方支付成功后，回调EC-Payment的notify接口
// 例如: /ec-payment/stripe/notify
//      /ec-payment/alipay/notify
//      /ec-payment/wechat_citcon/notify

// 回调处理
1. 验证签名
2. 验证订单状态
3. 更新支付记录
4. 调用finishOrder()
```

### 回调URL配置

```properties
# 支付回调通知URL
payment.config.notify_url = http://pub-gqc-ecapi.yamibuy.tech/ec-payment/transactions/
payment.config.alipay.notify_url = https://pub-gqc-ecapi.yamibuy.tech/ec-payment/alipay/notify
wechat.citcon.ipn_url = http://pub-gqc-ecapi.yamibuy.tech/ec-payment/wechat_citcon/notify
alipay.citcon.ipn_url = http://pub-gqc-ecapi.yamibuy.tech/ec-payment/alipay_citcon/notify
```

### 签名验证示例

```java
// Stripe签名验证
public boolean verifyStripeSignature(String payload, String signature) {
    try {
        Event event = Webhook.constructEvent(payload, signature, webhookSecret);
        return true;
    } catch (SignatureVerificationException e) {
        log.error("Stripe signature verification failed", e);
        return false;
    }
}

// 支付宝签名验证
public boolean verifyAlipaySignature(Map<String, String> params) {
    try {
        return AlipaySignature.rsaCheckV1(params, publicKey, "UTF-8", "RSA2");
    } catch (AlipayApiException e) {
        log.error("Alipay signature verification failed", e);
        return false;
    }
}
```

## Step 4: 完成订单处理

```java
// OrderService.finishOrder()
public void finishOrder(Integer channel, Integer version, 
                       OrderInfo orderInfo, String transaction_id) {
    
    // 1. 组装支付参数
    PayOrderParamBean payOrderParamBean = new PayOrderParamBean();
    payOrderParamBean.setChannel(channel);
    payOrderParamBean.setOrderInfo(orderInfo);
    payOrderParamBean.setVersion(version);
    payOrderParamBean.setTransaction_id(transaction_id);
    
    // 2. 执行完成订单
    Boolean is_success = dofinishOrder(payOrderParamBean);
    
    // 3. 如果是新流程，等待订单落库
    if (is_success && PaymentConstant.FLOW_VERSION.equals(orderInfo.getFlow_version())) {
        waitOrderSaveDb(orderInfo.getPurchase_id());
    }
}
```

### 等待订单落库机制

```java
// 等待订单落库
private void waitOrderSaveDb(Integer purchase_id) {
    int waitTime = paymentConfig.getWait_so_order_time(); // 10秒
    int checkInterval = 1000; // 1秒检查一次
    
    for (int i = 0; i < waitTime; i++) {
        // 检查订单是否已落库
        if (checkOrderSaved(purchase_id)) {
            log.info("订单已落库: {}", purchase_id);
            return;
        }
        
        try {
            Thread.sleep(checkInterval);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            break;
        }
    }
    
    log.warn("等待订单落库超时: {}", purchase_id);
}
```

**配置:**
```properties
# 等待订单落库时间 (秒)
payment.config.wait_so_order_time = 10
```

## Step 5: 发送完成订单MQ

```java
// EC-Payment发送MQ到Central-Payment
rabbitTemplate.convertAndSend(
    "central-payment.rpc.exchange",  // Exchange
    "order.finish",                   // Routing Key
    orderInfo                         // 订单信息
);
```

### MQ配置

```properties
# ec-payment.properties
spring.rabbitmq.host = 10.100.100.50
spring.rabbitmq.port = 5672
spring.rabbitmq.username = admin
spring.rabbitmq.password = yami@123

# 支付完成MQ
central-payment_rpc_exchange = central-payment.rpc.exchange
routing_key_finish_order = order.finish
ec-so.order_finish_queue = ec-so.order_finish.queue
```

## 订单拆单处理

### 拆单监听器

```java
// SplitOrderListener.java
@RabbitListener(
    bindings = @QueueBinding(
        value = @Queue(value = "${ec-payment.split-order.queue}"),
        exchange = @Exchange(value = "${ec-so.exchange}"),
        key = "${routing_key.order.status.save_db}"
    )
)
public void handle(String purchase_id) {
    log.info("拆单收到消息: {}", purchase_id);
    paySelectService.splitCharge(purchase_id);
}
```

### 为什么需要拆单？

1. **多子订单支付**: 用户一次支付可能包含多个子订单（不同商家、不同仓库）
2. **金额分配**: 需要将支付金额按订单分配，便于后续对账和退款
3. **独立记录**: 每个子订单对应一笔独立的支付记录
4. **退款处理**: 支持按子订单进行部分退款

### 拆单逻辑

```java
// PaySelectService.splitCharge()
public void splitCharge(String purchase_id) {
    // 1. 获取原始支付记录
    Charge originalCharge = chargeMapper.getByPurchaseId(purchase_id);
    
    // 2. 获取所有子订单
    List<OrderInfo> orderList = orderMapper.getOrdersByPurchaseId(purchase_id);
    
    // 3. 按订单金额比例分配支付金额
    for (OrderInfo order : orderList) {
        Charge splitCharge = new Charge();
        splitCharge.setOrder_id(order.getOrder_id());
        splitCharge.setPurchase_id(purchase_id);
        splitCharge.setAmount(order.getOrder_amount());
        splitCharge.setTransaction_id(originalCharge.getTransaction_id());
        splitCharge.setChannel(originalCharge.getChannel());
        
        // 4. 插入拆分后的支付记录
        chargeMapper.insert(splitCharge);
    }
}
```

## 支付状态管理

### 支付状态枚举

```java
public enum PayStatusEnum {
    UNPAID("未付款", 0),            // 待支付
    PAYMENT("付款验证中", 1),       // 支付处理中
    PAID("已付款", 2),              // 已付款
    REFUNDED("已退款", 3),          // 已全额退款
    PARTIAL_REFUNDED("部分退款", 4) // 部分退款
}
```

### 状态流转

```
未付款(0) → 付款验证中(1) → 已付款(2)
                              ↓
                         已退款(3) / 部分退款(4)
```

## 退款处理

### 退款接口

```java
// RefundService.java
public String refund(RefundRequest refundRequest) {
    // 1. 验证退款请求
    validateRefundRequest(refundRequest);
    
    // 2. 调用第三方退款API
    String refundId = callThirdPartyRefund(refundRequest);
    
    // 3. 更新退款记录
    updateRefundRecord(refundRequest, refundId);
    
    // 4. 更新订单支付状态
    updateOrderPayStatus(refundRequest);
    
    return refundId;
}
```

### 退款配置

```properties
# 退款失败告警
REFUND_ERROR_EMAIL = howie.cheng@yamibuy.com;renee.zhang@yamibuy.com
```

## 异常处理

### 支付异常

1. **网络超时**: 重试机制，最多重试3次
2. **签名验证失败**: 记录日志，拒绝处理
3. **金额不匹配**: 人工介入处理
4. **重复回调**: 幂等性处理

### 回调异常

1. **订单不存在**: 记录异常日志
2. **订单状态异常**: 检查订单当前状态
3. **金额异常**: 人工核实
4. **系统异常**: 告警通知

### 监控告警

```properties
# 异常告警
exception.wx.key = adfcb16d-0c24-4913-aeae-e1489350e5ae
exception.email.to = harry.he@yamibuy.com
```

## 性能优化

### 异步处理
- 支付回调异步处理
- MQ消息异步发送
- 日志异步写入

### 缓存策略
- 支付配置缓存
- 汇率信息缓存
- 商户信息缓存

### 连接池优化
- HTTP连接池配置
- 数据库连接池配置
- Redis连接池配置

## 安全措施

### 数据加密
- 敏感信息加密存储
- 传输过程HTTPS加密
- 支付令牌安全处理

### 访问控制
- IP白名单限制
- 接口访问频率限制
- 用户权限验证

### 审计日志
- 支付操作日志
- 异常访问日志
- 数据变更日志