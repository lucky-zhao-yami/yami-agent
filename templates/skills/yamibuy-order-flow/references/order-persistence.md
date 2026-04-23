# 订单落库流程 (EC-SO-Job)

## 流程概览

订单落库是整个下单流程的关键环节，负责将预占的订单信息持久化到数据库，并执行相关的业务逻辑。

```
支付成功 → MQ通知 → 订单持久化 → 扣减资源 → 通知其他服务
```

## MQ消费者

### 支付完成消费者

```java
// FinishOrderConsumer.java
@RabbitListener(bindings = @QueueBinding(
    value = @Queue(value = "${ec-so.order_finish_queue}", durable = "true"),
    exchange = @Exchange(value = "${central-payment_rpc_exchange}"),
    key = "${routing_key_finish_order}"))
public Boolean finishOrderListener(@Payload Message<OrderInfo> msg) {
    OrderInfo orderInfo = msg.getPayload();
    
    if (ECSOConstant.FLOW_VERSION.equals(orderInfo.getFlow_version())) {
        // 新流程
        orderPayService.paySOV2(orderInfo, "pay_center", secret);
    } else {
        // 老流程
        orderPayService.paySO(orderInfo, "pay_center", secret);
    }
    return true;
}
```

### 配置

```properties
# ec-so-job.properties
ec-so.order_finish_queue = ec-so.order_finish.queue
central-payment_rpc_exchange = central-payment.rpc.exchange
routing_key_finish_order = order.finish
```

## 新流程处理 (paySOV2)

### Step 1: 验证和准备

```java
// OrderPayService.paySOV2()
public void paySOV2(OrderInfo orderInfo, String from, String secret) {
    Integer purchase_id = orderInfo.getPurchase_id();
    
    // 1. 验证请求来源
    if (!validateRequest(from, secret)) {
        throw new BusinessException("Invalid request source");
    }
    
    // 2. 检查订单状态
    if (!checkOrderStatus(purchase_id)) {
        log.warn("订单状态异常: {}", purchase_id);
        return;
    }
    
    // 3. 从Redis获取预占订单信息
    PreSubmitOrderRequest preOrder = orderRedisService.getPreSubmitOrder(purchase_id);
    if (preOrder == null) {
        throw new BusinessException("预占订单信息不存在: " + purchase_id);
    }
    
    // 4. 发送持久化MQ
    sendPersistenceMessage(purchase_id);
}
```

### Step 2: 发送持久化消息

```java
// RabbitSender.java
public void sendPersistencePreOrder(String context) {
    log.info("将预占的订单持久化：{}", context);
    send(context, rabbitSenderConfig.getRouting_key_persistence_order_v2());
}
```

**配置:**
```properties
# ec-so-service.properties
ec-so-job.persistence_order_v2_queue = ec-so-job.persistence_order_v2.queue
routing_key_persistence_order_v2 = persistence.order_v2
ec-so_exchange = ec-so.exchange
```

## 订单持久化处理

### 持久化消费者

```java
// EC-SO-Job消费持久化消息
@RabbitListener(bindings = @QueueBinding(
    value = @Queue(value = "${ec-so-job.persistence_order_v2_queue}", durable = "true"),
    exchange = @Exchange(value = "${ec-so_exchange}", type = ExchangeTypes.TOPIC),
    key = "${routing_key_persistence_order_v2}"))
public void persistenceOrderV2(@Payload String message) {
    Integer purchase_id = Integer.valueOf(message);
    
    // 执行订单持久化
    orderJobReceiveService.submitMQReceiver2(purchase_id);
}
```

### 核心持久化逻辑

```java
// OrderJobReceiveService.submitMQReceiver2()
public void submitMQReceiver2(Integer purchase_id) {
    
    // 1. 从Redis获取预占订单信息
    PreSubmitOrderRequest preOrder = orderRedisService.getPreSubmitOrder(purchase_id);
    if (preOrder == null) {
        log.error("预占订单信息不存在: {}", purchase_id);
        return;
    }
    
    // 2. 扣减库存并删除预占缓存
    orderService.deductInventoryAndClearRedis(
        preOrder.getUser_id(), 
        purchase_id, 
        preOrder.getOrder_list()
    );
    
    // 3. 创建订单处理轨迹
    OrderProcessTrace orderProcessTrace = createOrderProcessTrace(preOrder);
    
    // 4. 执行订单落库操作
    doAction(orderProcessTrace);
    
    // 5. 通知订单已落库
    orderService.notifyOrderHasBeenSaved(purchase_id);
    
    // 6. 更新Redis订单状态
    orderRedisService.syncRedisStatus(purchase_id);
    
    // 7. 上报Avalara税务
    avalaraService.reportAndUpdateTax(preOrder.getOrder_list());
    
    // 8. 订单支付成功后处理
    orderPayService.afterPersistDB(preOrder.getOrder_list());
}
```

## 订单落库详细步骤

### Step 1: 库存扣减

```java
// OrderService.deductInventoryAndClearRedis()
public void deductInventoryAndClearRedis(Integer user_id, Integer purchase_id, List<OrderInfo> order_list) {
    
    // 1. 扣减真实库存
    for (OrderInfo order : order_list) {
        for (OrderGoods goods : order.getGoods_list()) {
            // 从预占库存转为真实扣减
            inventoryService.deductRealInventory(
                goods.getItem_number(), 
                goods.getGoods_number(),
                goods.getWarehouse_number()
            );
        }
    }
    
    // 2. 删除预占缓存
    orderRedisService.deletePreSubmitOrder(purchase_id);
    
    // 3. 清理用户相关缓存
    orderRedisService.clearUserOrderCache(user_id);
}
```

### Step 2: 数据库操作 (doAction)

```java
// OrderJobReceiveService.doAction()
private void doAction(OrderProcessTrace orderProcessTrace) {
    
    try {
        // 1. 插入订单表 (order_info)
        insertOrderInfo(orderProcessTrace);
        orderProcessTrace.setInsert_so_flag(1);
        
        // 2. 扣减积分 (调用ec-customer)
        deductUserPoints(orderProcessTrace);
        orderProcessTrace.setUpdate_point(1);
        
        // 3. 扣减礼卡 (调用ec-customer)
        deductGiftCard(orderProcessTrace);
        orderProcessTrace.setUpdate_giftcard(1);
        
        // 4. 使用优惠券 (调用ec-mkt)
        useCoupons(orderProcessTrace);
        orderProcessTrace.setUpdate_coupon_flag(1);
        
        // 5. 使用赠品 (调用ec-mkt)
        useGifts(orderProcessTrace);
        orderProcessTrace.setUpdate_gift_flag(1);
        
        // 6. 发送邮件
        sendOrderEmail(orderProcessTrace);
        orderProcessTrace.setSend_email(1);
        
        // 7. 更新用户首单时间
        updateUserFirstOrderTime(orderProcessTrace);
        
        // 8. 清空购物车
        clearShoppingCart(orderProcessTrace);
        
        // 9. 删除临时订单
        deleteTempOrder(orderProcessTrace);
        
        // 10. 更新处理状态
        orderProcessTrace.setStatus(1); // 成功
        
    } catch (Exception e) {
        log.error("订单落库失败: {}", orderProcessTrace.getPurchase_id(), e);
        orderProcessTrace.setStatus(-1); // 失败
        
        // 执行回滚操作
        rollbackOrder(orderProcessTrace);
        throw e;
        
    } finally {
        // 更新处理轨迹
        orderProcessTraceMapper.updateById(orderProcessTrace);
    }
}
```

### Step 3: 插入订单数据

```java
// 插入订单主表
private void insertOrderInfo(OrderProcessTrace trace) {
    List<OrderInfo> orderList = trace.getOrderList();
    
    for (OrderInfo order : orderList) {
        // 1. 插入订单主表
        orderInfoMapper.insert(order);
        
        // 2. 插入订单商品表
        for (OrderGoods goods : order.getGoods_list()) {
            goods.setOrder_id(order.getOrder_id());
            orderGoodsMapper.insert(goods);
        }
        
        // 3. 插入优惠券使用记录
        if (order.getCoupon_list() != null) {
            for (OrderCoupon coupon : order.getCoupon_list()) {
                coupon.setOrder_id(order.getOrder_id());
                orderCouponMapper.insert(coupon);
            }
        }
        
        // 4. 插入赠品记录
        if (order.getGift_list() != null) {
            for (OrderActivityGift gift : order.getGift_list()) {
                gift.setOrder_id(order.getOrder_id());
                orderActivityGiftMapper.insert(gift);
            }
        }
    }
}
```

### Step 4: 调用其他服务

```java
// 扣减用户积分
private void deductUserPoints(OrderProcessTrace trace) {
    for (OrderInfo order : trace.getOrderList()) {
        if (order.getIntegral() > 0) {
            PointDeductRequest request = new PointDeductRequest();
            request.setUser_id(order.getUser_id());
            request.setPoints(order.getIntegral());
            request.setOrder_id(order.getOrder_id());
            request.setReason("订单消费积分");
            
            // 调用EC-Customer服务
            customerService.deductPoints(request);
        }
    }
}

// 扣减礼卡余额
private void deductGiftCard(OrderProcessTrace trace) {
    for (OrderInfo order : trace.getOrderList()) {
        if (order.getGift_card_money().compareTo(BigDecimal.ZERO) > 0) {
            GiftCardDeductRequest request = new GiftCardDeductRequest();
            request.setUser_id(order.getUser_id());
            request.setAmount(order.getGift_card_money());
            request.setOrder_id(order.getOrder_id());
            
            // 调用EC-Customer服务
            customerService.deductGiftCard(request);
        }
    }
}

// 使用优惠券
private void useCoupons(OrderProcessTrace trace) {
    for (OrderInfo order : trace.getOrderList()) {
        if (order.getCoupon_list() != null) {
            for (OrderCoupon coupon : order.getCoupon_list()) {
                CouponUseRequest request = new CouponUseRequest();
                request.setCoupon_code(coupon.getCoupon_code());
                request.setOrder_id(order.getOrder_id());
                request.setUse_amount(coupon.getOff_amount());
                
                // 调用EC-Mkt服务
                marketingService.useCoupon(request);
            }
        }
    }
}
```

## 落库后处理

### Step 1: 通知订单已落库

```java
// OrderService.notifyOrderHasBeenSaved()
public void notifyOrderHasBeenSaved(Integer purchase_id) {
    
    // 发送MQ通知订单已落库
    rabbitTemplate.convertAndSend(
        "ec-so.exchange",           // Exchange
        "order.status.save_db",     // Routing Key
        purchase_id.toString()      // 消息内容
    );
    
    log.info("订单落库通知已发送: {}", purchase_id);
}
```

### Step 2: 更新Redis状态

```java
// OrderRedisService.syncRedisStatus()
public void syncRedisStatus(Integer purchase_id) {
    
    // 更新订单状态缓存
    String statusKey = "order:status:" + purchase_id;
    redisTemplate.opsForValue().set(statusKey, "PAID", 3600, TimeUnit.SECONDS);
    
    // 更新用户订单列表缓存
    String userOrderKey = "user:orders:" + getUserId(purchase_id);
    redisTemplate.delete(userOrderKey); // 删除缓存，下次查询时重新加载
    
    log.info("Redis订单状态已更新: {}", purchase_id);
}
```

### Step 3: 税务上报

```java
// AvalaraService.reportAndUpdateTax()
public void reportAndUpdateTax(List<OrderInfo> orderList) {
    
    for (OrderInfo order : orderList) {
        try {
            // 1. 构建税务上报数据
            CreateTransactionModel transaction = buildTaxTransaction(order);
            
            // 2. 调用Avalara API上报
            TransactionModel result = avalaraClient.createTransaction(null, transaction);
            
            // 3. 更新订单税务信息
            updateOrderTaxInfo(order.getOrder_id(), result);
            
            log.info("税务上报成功: order_id={}, tax_id={}", 
                order.getOrder_id(), result.getId());
                
        } catch (Exception e) {
            log.error("税务上报失败: order_id={}", order.getOrder_id(), e);
            
            // 发送告警
            sendTaxReportAlert(order.getOrder_id(), e.getMessage());
        }
    }
}
```

### Step 4: 发送邮件通知

```java
// EmailService.sendOrderSuccessEmail()
public void sendOrderSuccessEmail(OrderInfo order) {
    
    try {
        // 1. 构建邮件内容
        EmailTemplate template = buildOrderEmailTemplate(order);
        
        // 2. 获取用户邮箱
        String userEmail = getUserEmail(order.getUser_id());
        
        // 3. 发送邮件
        emailSender.send(userEmail, template);
        
        log.info("订单成功邮件已发送: order_id={}, email={}", 
            order.getOrder_id(), userEmail);
            
    } catch (Exception e) {
        log.error("发送订单邮件失败: order_id={}", order.getOrder_id(), e);
    }
}
```

## 异常处理和回滚

### 回滚机制

```java
// OrderJobReceiveService.rollbackOrder()
private void rollbackOrder(OrderProcessTrace trace) {
    
    log.warn("开始回滚订单: {}", trace.getPurchase_id());
    
    try {
        // 1. 回滚数据库操作
        if (trace.getInsert_so_flag() == 1) {
            deleteOrderData(trace.getPurchase_id());
        }
        
        // 2. 回滚积分扣减
        if (trace.getUpdate_point() == 1) {
            refundUserPoints(trace);
        }
        
        // 3. 回滚礼卡扣减
        if (trace.getUpdate_giftcard() == 1) {
            refundGiftCard(trace);
        }
        
        // 4. 回滚优惠券使用
        if (trace.getUpdate_coupon_flag() == 1) {
            rollbackCoupons(trace);
        }
        
        // 5. 回滚赠品使用
        if (trace.getUpdate_gift_flag() == 1) {
            rollbackGifts(trace);
        }
        
        // 6. 恢复库存
        restoreInventory(trace);
        
        // 7. 恢复预占订单
        restorePreSubmitOrder(trace);
        
        log.info("订单回滚完成: {}", trace.getPurchase_id());
        
    } catch (Exception e) {
        log.error("订单回滚失败: {}", trace.getPurchase_id(), e);
        
        // 发送紧急告警
        sendEmergencyAlert(trace.getPurchase_id(), e);
    }
}
```

### 幂等性处理

```java
// 确保消息处理的幂等性
public void persistenceOrderV2(@Payload String message) {
    Integer purchase_id = Integer.valueOf(message);
    
    // 1. 检查是否已处理
    String lockKey = "order:persistence:lock:" + purchase_id;
    boolean locked = redisLockClient.tryLock(lockKey, TimeUnit.MINUTES, 5, 10);
    
    if (!locked) {
        log.warn("订单正在处理中: {}", purchase_id);
        return;
    }
    
    try {
        // 2. 检查处理状态
        OrderProcessTrace trace = orderProcessTraceMapper.getByPurchaseId(purchase_id);
        if (trace != null && trace.getStatus() == 1) {
            log.info("订单已处理完成: {}", purchase_id);
            return;
        }
        
        // 3. 执行处理逻辑
        orderJobReceiveService.submitMQReceiver2(purchase_id);
        
    } finally {
        // 4. 释放锁
        redisLockClient.unlock(lockKey);
    }
}
```

## 性能优化

### 批量处理

```java
// 批量插入订单数据
private void batchInsertOrderData(List<OrderInfo> orderList) {
    
    // 1. 批量插入订单主表
    orderInfoMapper.batchInsert(orderList);
    
    // 2. 批量插入订单商品
    List<OrderGoods> allGoods = new ArrayList<>();
    for (OrderInfo order : orderList) {
        allGoods.addAll(order.getGoods_list());
    }
    orderGoodsMapper.batchInsert(allGoods);
    
    // 3. 批量插入其他关联数据
    // ...
}
```

### 异步处理

```java
// 异步处理非关键业务
@Async("orderTaskExecutor")
public void asyncAfterPersist(List<OrderInfo> orderList) {
    
    // 1. 异步发送邮件
    for (OrderInfo order : orderList) {
        emailService.sendOrderSuccessEmail(order);
    }
    
    // 2. 异步更新统计数据
    statisticsService.updateOrderStatistics(orderList);
    
    // 3. 异步同步到数据仓库
    dataWarehouseService.syncOrderData(orderList);
}
```

### 数据库优化

```properties
# 数据库连接池配置
spring.datasource.hikari.maximum-pool-size=20
spring.datasource.hikari.minimum-idle=5
spring.datasource.hikari.connection-timeout=30000
spring.datasource.hikari.idle-timeout=600000
spring.datasource.hikari.max-lifetime=1800000
```

## 监控和告警

### 关键指标

- 订单落库成功率
- 平均处理时间
- MQ消息堆积数量
- 数据库连接池使用率
- 异常订单数量

### 告警配置

```properties
# 异常告警
exception.wx.key = adfcb16d-0c24-4913-aeae-e1489350e5ae
exception.email.to = harry.he@yamibuy.com

# 税务上报告警
ava.monitor.send.wx.key = 4c86b07a-b712-4944-9ba9-ca1d0a2d02fd
```