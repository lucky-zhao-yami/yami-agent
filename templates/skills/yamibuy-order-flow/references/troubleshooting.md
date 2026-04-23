# 常见问题和监控告警

## 常见问题排查

### 1. 订单相关问题

#### 问题：订单为什么要预占资源？

**原因分析:**
1. **防止超卖**: 用户下单后立即预占库存，避免支付时库存不足
2. **提升体验**: 用户看到的库存是真实可用的
3. **减少取消**: 预占后其他用户无法购买，减少订单取消率
4. **异步处理**: 支付和落库异步进行，提升系统性能

#### 问题：订单状态异常，如何排查？

**排查步骤:**
1. **检查4个状态字段**: order_status, shipping_status, pay_status, abnormal
2. **查看状态变更日志**: 检查 order_status_log 表
3. **检查风控状态**: 重点关注 abnormal 字段
4. **查看MQ消息**: 检查相关MQ消息是否正常处理

**常见状态组合问题:**
```sql
-- 查询异常状态订单
SELECT order_id, purchase_id, order_status, shipping_status, pay_status, abnormal
FROM order_info 
WHERE abnormal IN (110, 120, 130) -- 风控相关异常
   OR (pay_status = 2 AND shipping_status = 0 AND order_status = 1 AND abnormal = 0 AND add_time < UNIX_TIMESTAMP(NOW() - INTERVAL 1 DAY) * 1000)
```

#### 问题：订单重复提交如何处理？

**机制说明:**
- 对订单内容(商品+地址)计算MD5
- 将MD5存入Redis，60秒过期
- 提交时比对MD5，相同则拒绝
- 同一用户5秒内只能提交一次订单

**配置检查:**
```properties
DUPLICATE_ORDER_VERIFY_KEY = so:order:duplicate:verify:user_id:%s
DUPLICATE_ORDER_VERIFY_TIME_OUT = 60
```

**排查方法:**
```bash
# 检查Redis中的重复校验Key
redis-cli get "so:order:duplicate:verify:user_id:123456"
```

### 2. 支付相关问题

#### 问题：支付成功但订单未更新

**可能原因:**
1. **MQ消息丢失**: 检查 central-payment.rpc.exchange 消息
2. **回调处理失败**: 检查第三方支付回调日志
3. **签名验证失败**: 检查支付签名验证逻辑
4. **订单状态异常**: 检查订单当前状态是否允许支付

**排查步骤:**
```sql
-- 1. 检查支付记录
SELECT * FROM charge WHERE purchase_id = 12345;

-- 2. 检查订单状态
SELECT order_id, purchase_id, pay_status, order_status FROM order_info WHERE purchase_id = 12345;

-- 3. 检查MQ处理日志
SELECT * FROM mq_message_log WHERE purchase_id = 12345 AND message_type = 'ORDER_FINISH';
```

#### 问题：支付回调重复处理

**解决方案:**
1. **幂等性检查**: 检查订单支付状态
2. **分布式锁**: 使用Redis锁防止并发
3. **消息去重**: 使用messageId去重

**代码示例:**
```java
public void handlePaymentCallback(PaymentCallback callback) {
    String lockKey = "payment:callback:lock:" + callback.getPurchaseId();
    boolean locked = redisLockClient.tryLock(lockKey, TimeUnit.SECONDS, 30, 5);
    
    if (!locked) {
        log.warn("支付回调正在处理中: {}", callback.getPurchaseId());
        return;
    }
    
    try {
        // 检查订单支付状态
        OrderInfo order = orderService.getByPurchaseId(callback.getPurchaseId());
        if (order.getPay_status() == 2) {
            log.info("订单已支付，忽略重复回调: {}", callback.getPurchaseId());
            return;
        }
        
        // 处理支付逻辑
        processPayment(callback);
        
    } finally {
        redisLockClient.unlock(lockKey);
    }
}
```

### 3. MQ相关问题

#### 问题：MQ消息堆积

**排查步骤:**
1. **检查消费者状态**: 确认消费者是否正常运行
2. **检查消费速度**: 对比生产和消费速度
3. **检查错误日志**: 查看消费者错误日志
4. **检查资源使用**: CPU、内存、数据库连接

**监控命令:**
```bash
# 检查队列状态
rabbitmqctl list_queues name messages consumers

# 检查Exchange绑定
rabbitmqctl list_bindings

# 检查消费者
rabbitmqctl list_consumers
```

#### 问题：消息消费失败

**常见原因:**
1. **业务异常**: 数据库连接失败、第三方服务异常
2. **数据格式错误**: 消息格式不匹配
3. **重复消费**: 消息重复处理导致业务异常
4. **资源不足**: 数据库连接池耗尽

**处理方案:**
```java
@RabbitListener(queues = "ec-so.order_finish.queue")
public void handleOrderFinish(@Payload OrderInfo orderInfo) {
    try {
        // 业务处理
        processOrder(orderInfo);
        
    } catch (BusinessException e) {
        log.error("业务处理失败: {}", orderInfo.getPurchase_id(), e);
        // 业务异常不重试，直接进入死信队列
        throw new AmqpRejectAndDontRequeueException("业务处理失败", e);
        
    } catch (Exception e) {
        log.error("系统异常: {}", orderInfo.getPurchase_id(), e);
        // 系统异常重试
        throw e;
    }
}
```

### 4. 风控相关问题

#### 问题：订单被风控拦截

**风控状态说明:**
- `abnormal = 110`: 风控检测中
- `abnormal = 120`: 等待人工审核
- `abnormal = 130`: 风控拒绝
- `abnormal = 4`: 风控通过

**排查方法:**
```sql
-- 查询风控异常订单
SELECT o.order_id, o.purchase_id, o.abnormal, fp.risk_score, fp.risk_reason
FROM order_info o
LEFT JOIN fp_risk_record fp ON o.purchase_id = fp.purchase_id
WHERE o.abnormal IN (110, 120, 130);
```

**人工审核处理:**
```java
// 风控审核通过
public void approveOrder(Integer order_id, String operator) {
    // 更新订单状态
    soOrderActionService.updateAbnormal(order_id, 4);
    
    // 记录审核日志
    fpAuditLogService.recordApproval(order_id, operator);
    
    // 通知WMS发货
    wmsService.notifyShipping(order_id);
}

// 风控审核拒绝
public void rejectOrder(Integer order_id, String reason, String operator) {
    // 更新订单状态
    soOrderActionService.updateAbnormal(order_id, 130);
    
    // 记录审核日志
    fpAuditLogService.recordRejection(order_id, reason, operator);
    
    // 自动退款
    refundService.autoRefund(order_id, "风控拒绝");
}
```

### 5. 库存相关问题

#### 问题：库存扣减异常

**预占库存机制:**
1. 下单时预占库存
2. 支付成功后扣减真实库存
3. 超时未支付释放预占库存

**排查方法:**
```sql
-- 检查库存记录
SELECT * FROM inventory_log 
WHERE item_number = 'ITEM123' 
AND operation_type IN ('preoccupy', 'deduct', 'release')
ORDER BY create_time DESC;

-- 检查预占记录
SELECT * FROM inventory_preoccupy 
WHERE item_number = 'ITEM123' 
AND status = 'ACTIVE';
```

#### 问题：库存不一致

**可能原因:**
1. **并发扣减**: 高并发下库存扣减冲突
2. **预占未释放**: 超时订单预占库存未正确释放
3. **数据同步异常**: 库存数据同步失败

**修复方案:**
```java
// 库存对账和修复
@Scheduled(cron = "0 0 2 * * ?") // 每天凌晨2点执行
public void reconcileInventory() {
    
    List<String> itemNumbers = inventoryService.getAllItemNumbers();
    
    for (String itemNumber : itemNumbers) {
        try {
            // 1. 计算理论库存
            int theoreticalStock = calculateTheoreticalStock(itemNumber);
            
            // 2. 获取实际库存
            int actualStock = inventoryService.getActualStock(itemNumber);
            
            // 3. 检查差异
            if (theoreticalStock != actualStock) {
                log.warn("库存不一致: item={}, theoretical={}, actual={}", 
                    itemNumber, theoreticalStock, actualStock);
                
                // 4. 记录差异
                recordInventoryDifference(itemNumber, theoreticalStock, actualStock);
                
                // 5. 发送告警
                sendInventoryAlert(itemNumber, theoreticalStock, actualStock);
            }
            
        } catch (Exception e) {
            log.error("库存对账失败: item={}", itemNumber, e);
        }
    }
}
```

## 监控和告警

### 1. 关键指标监控

#### 业务指标
- **订单提交成功率**: 订单提交成功数 / 订单提交总数
- **订单支付成功率**: 支付成功订单数 / 提交订单数
- **订单落库成功率**: 落库成功订单数 / 支付成功订单数
- **风控拦截率**: 风控拦截订单数 / 总订单数
- **平均处理时间**: 从下单到落库的平均时间

#### 技术指标
- **MQ消息堆积数量**: 各队列的消息积压情况
- **MQ消费速度**: 每分钟消费的消息数量
- **数据库连接池使用率**: 连接池使用情况
- **Redis命中率**: 缓存命中率
- **接口响应时间**: 各接口的平均响应时间

### 2. 告警配置

#### 企业微信告警
```properties
# 风控监控告警
ava.monitor.send.wx.key = 4c86b07a-b712-4944-9ba9-ca1d0a2d02fd

# 异常告警
exception.wx.key = adfcb16d-0c24-4913-aeae-e1489350e5ae
```

#### 邮件告警
```properties
# 异常邮件接收人
exception.email.to = harry.he@yamibuy.com

# 退款失败告警
REFUND_ERROR_EMAIL = howie.cheng@yamibuy.com;renee.zhang@yamibuy.com
```

#### 告警规则示例
```java
@Component
public class OrderMonitor {
    
    @Scheduled(fixedRate = 60000) // 每分钟检查
    public void checkOrderMetrics() {
        
        // 1. 检查订单提交成功率
        double submitSuccessRate = calculateSubmitSuccessRate();
        if (submitSuccessRate < 0.95) { // 低于95%告警
            sendAlert("订单提交成功率过低", "当前成功率: " + submitSuccessRate);
        }
        
        // 2. 检查支付成功率
        double paymentSuccessRate = calculatePaymentSuccessRate();
        if (paymentSuccessRate < 0.90) { // 低于90%告警
            sendAlert("支付成功率过低", "当前成功率: " + paymentSuccessRate);
        }
        
        // 3. 检查MQ消息堆积
        int messageCount = getMQMessageCount("ec-so.order_finish.queue");
        if (messageCount > 1000) { // 超过1000条告警
            sendAlert("MQ消息堆积", "队列消息数: " + messageCount);
        }
        
        // 4. 检查异常订单数量
        int abnormalOrderCount = getAbnormalOrderCount();
        if (abnormalOrderCount > 100) { // 超过100个异常订单告警
            sendAlert("异常订单过多", "异常订单数: " + abnormalOrderCount);
        }
    }
}
```

### 3. 性能优化建议

#### 数据库优化
1. **索引优化**: 确保查询字段有合适的索引
2. **读写分离**: 查询操作使用只读库
3. **分库分表**: 大表进行水平拆分
4. **连接池配置**: 合理配置连接池大小

```sql
-- 常用索引
CREATE INDEX idx_order_info_purchase_id ON order_info(purchase_id);
CREATE INDEX idx_order_info_user_id_add_time ON order_info(user_id, add_time);
CREATE INDEX idx_order_info_abnormal ON order_info(abnormal);
CREATE INDEX idx_charge_purchase_id ON charge(purchase_id);
```

#### Redis优化
1. **缓存策略**: 合理设置缓存过期时间
2. **内存管理**: 定期清理无用缓存
3. **连接池**: 配置合适的连接池大小
4. **数据结构**: 选择合适的Redis数据结构

```properties
# Redis优化配置
spring.redis.jedis.pool.max-active = 20
spring.redis.jedis.pool.max-idle = 10
spring.redis.jedis.pool.min-idle = 5
spring.redis.timeout = 3000
```

#### MQ优化
1. **批量处理**: 批量消费和发送消息
2. **并发控制**: 合理设置消费者并发数
3. **消息大小**: 控制单个消息大小
4. **持久化**: 重要消息启用持久化

```properties
# MQ优化配置
spring.rabbitmq.listener.simple.concurrency = 5
spring.rabbitmq.listener.simple.max-concurrency = 20
spring.rabbitmq.listener.simple.prefetch = 10
```

### 4. 应急处理方案

#### 订单处理异常
1. **立即止损**: 暂停订单提交功能
2. **问题定位**: 快速定位问题原因
3. **数据修复**: 修复异常数据
4. **功能恢复**: 恢复正常服务

#### 支付异常
1. **暂停支付**: 暂停相关支付渠道
2. **数据核对**: 核对支付和订单数据
3. **手动处理**: 人工处理异常订单
4. **渠道恢复**: 恢复支付渠道

#### 系统故障
1. **服务降级**: 启用降级方案
2. **流量切换**: 切换到备用系统
3. **问题修复**: 修复系统问题
4. **服务恢复**: 恢复正常服务

### 5. 日志分析

#### 关键日志位置
- **订单日志**: `/logs/ec-so/order.log`
- **支付日志**: `/logs/ec-payment/payment.log`
- **MQ日志**: `/logs/ec-so-job/mq.log`
- **风控日志**: `/logs/central-fp/risk.log`

#### 日志分析命令
```bash
# 查看订单提交错误
grep "ERROR" /logs/ec-so/order.log | grep "submitOrder" | tail -100

# 查看支付回调异常
grep "ERROR" /logs/ec-payment/payment.log | grep "callback" | tail -100

# 查看MQ消费异常
grep "ERROR" /logs/ec-so-job/mq.log | grep "consumer" | tail -100

# 统计错误数量
grep "ERROR" /logs/ec-so/order.log | wc -l
```

#### 日志监控脚本
```bash
#!/bin/bash
# 监控错误日志数量

LOG_FILE="/logs/ec-so/order.log"
ERROR_THRESHOLD=100

# 统计最近1小时的错误数量
ERROR_COUNT=$(grep "ERROR" $LOG_FILE | grep "$(date -d '1 hour ago' '+%Y-%m-%d %H')" | wc -l)

if [ $ERROR_COUNT -gt $ERROR_THRESHOLD ]; then
    echo "错误日志过多: $ERROR_COUNT" | mail -s "订单系统告警" ops@yamibuy.com
fi
```