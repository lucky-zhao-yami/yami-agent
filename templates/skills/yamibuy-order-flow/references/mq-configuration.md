# MQ消息队列配置详解

## RabbitMQ连接配置

### 基础连接配置
```properties
# 所有服务共用的RabbitMQ配置
yamibuy.quene.rabbitmq.host = 10.100.100.50
yamibuy.quene.rabbitmq.port = 5672
yamibuy.quene.rabbitmq.username = admin
yamibuy.quene.rabbitmq.password = yami@123
yamibuy.quene.rabbitmq.listener.acknowledge-mode = AUTO
yamibuy.quene.rabbitmq.publisher-confirms = true
yamibuy.quene.rabbitmq.publisher-returns = true
yamibuy.quene.rabbitmq.template.mandatory = true
```

### 连接池配置
```properties
# 连接池配置
spring.rabbitmq.listener.simple.concurrency = 5
spring.rabbitmq.listener.simple.max-concurrency = 10
spring.rabbitmq.listener.simple.prefetch = 1
spring.rabbitmq.listener.simple.retry.enabled = true
spring.rabbitmq.listener.simple.retry.max-attempts = 3
```

## 核心MQ消息流转

### 1. 订单提交MQ

**用途**: EC-SO发送订单提交消息（老流程使用）

```properties
# EC-SO发送订单提交消息
RABBIT_MQ_EXCHANGE_NAME = ec-so.so.submit.k8s.exchange
RABBIT_MQ_QUEUE_NAME = ec-so.so.submit.k8s.queue
rabbitmq.so.order.submit.key = order.submit
```

**消息流转**:
```
EC-SO → ec-so.so.submit.k8s.exchange → ec-so.so.submit.k8s.queue → EC-SO-Job
```

### 2. 支付完成MQ

**用途**: EC-Payment通知EC-SO-Job支付完成

```properties
# EC-Payment发送支付完成消息
central-payment_rpc_exchange = central-payment.rpc.exchange
routing_key_finish_order = order.finish
ec-so.order_finish_queue = ec-so.order_finish.queue
```

**消息流转**:
```
EC-Payment → central-payment.rpc.exchange → ec-so.order_finish.queue → EC-SO-Job
```

**监听器配置**:
```java
@RabbitListener(bindings = @QueueBinding(
    value = @Queue(value = "${ec-so.order_finish_queue}", durable = "true"),
    exchange = @Exchange(value = "${central-payment_rpc_exchange}"),
    key = "${routing_key_finish_order}"))
public Boolean finishOrderListener(@Payload Message<OrderInfo> msg) {
    // 处理支付完成逻辑
}
```

### 3. 订单持久化MQ

**用途**: 新流程中，支付成功后发送持久化请求

```properties
# EC-SO发送订单持久化消息
ec-so_exchange = ec-so.exchange
routing_key_persistence_order_v2 = persistence.order_v2
ec-so-job.persistence_order_v2_queue = ec-so-job.persistence_order_v2.queue
```

**消息流转**:
```
EC-SO-Job → ec-so.exchange → ec-so-job.persistence_order_v2.queue → EC-SO-Job
```

**监听器配置**:
```java
@RabbitListener(bindings = @QueueBinding(
    value = @Queue(value = "${ec-so-job.persistence_order_v2_queue}", durable = "true"),
    exchange = @Exchange(value = "${ec-so_exchange}", type = ExchangeTypes.TOPIC),
    key = "${routing_key_persistence_order_v2}"))
public void persistenceOrderV2(@Payload String message) {
    // 处理订单持久化逻辑
}
```

### 4. 订单取消MQ

**用途**: 延时取消未支付订单

```properties
# 延时取消订单MQ
routing_key_auto_cancel_purchase = so.purchase.canceled
order_canceled_timeout = 120000  # ec-so-service配置120秒
# 注意: ec-so-job配置为600000(10分钟),实际以Job服务配置为准
ec-so.order_canceled_delay.queue = ec-so.order_canceled_delay.queue

# 秒杀订单延时取消
order_seckill_canceled_timeout = 300000  # 秒杀订单300秒(5分钟)
ec-so.seckill_order_canceled_delay.queue = ec-so.seckill_order_canceled_delay.queue
```

**延时队列实现**:
```java
// 发送延时消息
public void sendDelayMessage(String routingKey, String message, long delayTime) {
    rabbitTemplate.convertAndSend(
        "delay.exchange",
        routingKey,
        message,
        msg -> {
            msg.getMessageProperties().setDelay((int) delayTime);
            return msg;
        }
    );
}
```

### 5. 订单状态变更MQ

**用途**: 通知订单落库完成，触发后续处理

```properties
# 订单落库成功通知
# 注意: 此配置在代码中硬编码,Apollo配置文件中未找到
# 实际使用: exchange = ec-so.exchange, routing_key = order.status.save_db
ec-so.exchange = ec-so.exchange
```

**消息流转**:
```
EC-SO-Job → ec-so.exchange → order.status.save_db → [EC-Payment, Central-FP]
```

**多个消费者**:
```java
// EC-Payment监听拆单消息
@RabbitListener(bindings = @QueueBinding(
    value = @Queue(value = "${ec-payment.split-order.queue}"),
    exchange = @Exchange(value = "${ec-so.exchange}"),
    key = "${routing_key.order.status.save_db}"))
public void splitOrderHandle(String purchase_id) {
    // 支付拆单处理
}

// Central-FP监听风控消息
@RabbitListener(bindings = @QueueBinding(
    value = @Queue(value = "${central-fp.risk-control.queue}"),
    exchange = @Exchange(value = "${ec-so.exchange}"),
    key = "${routing_key.order.status.save_db}"))
public void riskControlHandle(String purchase_id) {
    // 风控检测处理
}
```

### 6. 邮件通知MQ

**用途**: 异步发送各种邮件通知

```properties
# 订单发货邮件
routing_key_send_order_deliver_mail = order.send_deliver_email

# 订单取消邮件
routing_key_cancel_order_send_mail = cancelOrder.sendMail
```

### 7. 用户轨迹上报MQ

**用途**: 上报用户行为数据到数据分析系统

```properties
# 用户行为轨迹上报
rabbitmq.so.user.tracking.report.key = user.tracking.report
RABBIT_MQ_SENSORS_EXCHANGE_NAME = data.event.sensors.exchange
```

## Exchange和Queue设计

### Exchange类型说明

| Exchange | 类型 | 用途 |
|----------|------|------|
| ec-so.exchange | topic | EC-SO相关消息路由 |
| central-payment.rpc.exchange | direct | 支付中心RPC消息 |
| ec-so.so.submit.k8s.exchange | direct | 订单提交消息 |
| data.event.sensors.exchange | topic | 数据分析消息 |
| delay.exchange | x-delayed-message | 延时消息 |

### Queue命名规范

```
{服务名}.{功能}.{环境}.queue

例如:
- ec-so.order_finish.queue
- ec-so-job.persistence_order_v2.queue
- ec-payment.split-order.queue
- central-fp.risk-control.queue
```

### Routing Key规范

```
{动作}.{对象}.{详细描述}

例如:
- order.finish (订单完成)
- persistence.order_v2 (订单持久化V2)
- order.status.save_db (订单状态-保存到数据库)
- so.purchase.canceled (订单取消)
```

## 消息格式设计

### 订单消息格式

```json
{
    "purchase_id": 12345,
    "order_id": 67890,
    "user_id": 1001,
    "order_status": 1,
    "pay_status": 2,
    "shipping_status": 0,
    "abnormal": 0,
    "flow_version": "1.0",
    "timestamp": 1638360000000,
    "source": "EC-Payment",
    "event_type": "ORDER_PAID"
}
```

### 支付消息格式

```json
{
    "purchase_id": 12345,
    "transaction_id": "txn_abc123",
    "channel": 1,
    "amount": 99.99,
    "currency": "USD",
    "status": "SUCCESS",
    "timestamp": 1638360000000,
    "callback_data": {
        "stripe_charge_id": "ch_xyz789",
        "payment_method": "card"
    }
}
```

### 延时取消消息格式

```json
{
    "purchase_id": 12345,
    "cancel_reason": "PAYMENT_TIMEOUT",
    "delay_time": 600000,
    "created_time": 1638360000000,
    "order_type": "NORMAL"
}
```

## 消息可靠性保证

### 1. 消息持久化

```java
// 队列持久化
@Queue(value = "ec-so.order_finish.queue", durable = "true")

// 消息持久化
rabbitTemplate.convertAndSend(exchange, routingKey, message, msg -> {
    msg.getMessageProperties().setDeliveryMode(MessageDeliveryMode.PERSISTENT);
    return msg;
});
```

### 2. 消息确认机制

```java
// 生产者确认
@Configuration
public class RabbitConfig {
    
    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory connectionFactory) {
        RabbitTemplate template = new RabbitTemplate(connectionFactory);
        
        // 消息发送确认
        template.setConfirmCallback((correlationData, ack, cause) -> {
            if (!ack) {
                log.error("消息发送失败: {}", cause);
                // 重试或告警
            }
        });
        
        // 消息返回确认
        template.setReturnCallback((message, replyCode, replyText, exchange, routingKey) -> {
            log.error("消息路由失败: exchange={}, routingKey={}, replyText={}", 
                exchange, routingKey, replyText);
        });
        
        return template;
    }
}
```

### 3. 消费者重试机制

```java
// 消费者重试配置
@RabbitListener(
    bindings = @QueueBinding(
        value = @Queue(value = "ec-so.order_finish.queue", durable = "true"),
        exchange = @Exchange(value = "central-payment.rpc.exchange"),
        key = "order.finish"
    ),
    containerFactory = "rabbitListenerContainerFactory"
)
@RetryableTopic(
    attempts = "3",
    backoff = @Backoff(delay = 1000, multiplier = 2.0),
    include = {Exception.class}
)
public void handleOrderFinish(@Payload OrderInfo orderInfo) {
    try {
        // 处理逻辑
        processOrder(orderInfo);
    } catch (Exception e) {
        log.error("处理订单失败: {}", orderInfo.getPurchase_id(), e);
        throw e; // 重新抛出异常触发重试
    }
}
```

### 4. 死信队列处理

```java
// 死信队列配置
@Bean
public Queue orderFinishQueue() {
    return QueueBuilder.durable("ec-so.order_finish.queue")
        .withArgument("x-dead-letter-exchange", "ec-so.dlx.exchange")
        .withArgument("x-dead-letter-routing-key", "order.finish.dlq")
        .withArgument("x-message-ttl", 600000) // 10分钟TTL
        .build();
}

@Bean
public Queue orderFinishDLQ() {
    return QueueBuilder.durable("ec-so.order_finish.dlq").build();
}

// 死信消息处理
@RabbitListener(queues = "ec-so.order_finish.dlq")
public void handleDeadLetter(@Payload String message, @Header Map<String, Object> headers) {
    log.error("收到死信消息: {}, headers: {}", message, headers);
    
    // 记录到数据库
    saveDeadLetterMessage(message, headers);
    
    // 发送告警
    sendAlert("订单处理死信", message);
    
    // 人工介入处理
    notifyManualProcess(message);
}
```

## 消息幂等性处理

### 1. 消息去重

```java
@Component
public class MessageDeduplicator {
    
    @Autowired
    private RedisTemplate<String, String> redisTemplate;
    
    public boolean isDuplicate(String messageId) {
        String key = "msg:dedup:" + messageId;
        Boolean result = redisTemplate.opsForValue().setIfAbsent(key, "1", Duration.ofMinutes(10));
        return !Boolean.TRUE.equals(result);
    }
}

// 使用示例
@RabbitListener(queues = "ec-so.order_finish.queue")
public void handleOrderFinish(@Payload OrderInfo orderInfo, @Header("messageId") String messageId) {
    
    if (messageDeduplicator.isDuplicate(messageId)) {
        log.info("重复消息，忽略处理: {}", messageId);
        return;
    }
    
    // 处理业务逻辑
    processOrder(orderInfo);
}
```

### 2. 业务幂等性

```java
@Service
public class OrderService {
    
    public void processOrderPayment(Integer purchase_id, String transaction_id) {
        
        // 检查是否已处理
        OrderProcessTrace trace = orderProcessTraceMapper.getByPurchaseId(purchase_id);
        if (trace != null && trace.getStatus() == 1) {
            log.info("订单已处理完成: {}", purchase_id);
            return;
        }
        
        // 分布式锁防止并发
        String lockKey = "order:process:lock:" + purchase_id;
        boolean locked = redisLockClient.tryLock(lockKey, TimeUnit.MINUTES, 5, 10);
        
        if (!locked) {
            log.warn("订单正在处理中: {}", purchase_id);
            return;
        }
        
        try {
            // 执行业务逻辑
            doProcessOrder(purchase_id, transaction_id);
        } finally {
            redisLockClient.unlock(lockKey);
        }
    }
}
```

## 监控和告警

### 1. 消息堆积监控

```java
@Component
public class RabbitMQMonitor {
    
    @Autowired
    private RabbitAdmin rabbitAdmin;
    
    @Scheduled(fixedRate = 60000) // 每分钟检查一次
    public void checkQueueDepth() {
        
        String[] queues = {
            "ec-so.order_finish.queue",
            "ec-so-job.persistence_order_v2.queue",
            "ec-payment.split-order.queue"
        };
        
        for (String queueName : queues) {
            Properties props = rabbitAdmin.getQueueProperties(queueName);
            if (props != null) {
                int messageCount = (Integer) props.get("QUEUE_MESSAGE_COUNT");
                
                if (messageCount > 1000) { // 阈值告警
                    sendAlert("MQ消息堆积", queueName + " 消息数量: " + messageCount);
                }
            }
        }
    }
}
```

### 2. 消费速率监控

```java
@Component
public class MessageConsumerMetrics {
    
    private final MeterRegistry meterRegistry;
    private final Counter processedCounter;
    private final Counter failedCounter;
    private final Timer processingTimer;
    
    public MessageConsumerMetrics(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
        this.processedCounter = Counter.builder("rabbitmq.messages.processed")
            .register(meterRegistry);
        this.failedCounter = Counter.builder("rabbitmq.messages.failed")
            .register(meterRegistry);
        this.processingTimer = Timer.builder("rabbitmq.messages.processing.time")
            .register(meterRegistry);
    }
    
    public void recordProcessed() {
        processedCounter.increment();
    }
    
    public void recordFailed() {
        failedCounter.increment();
    }
    
    public Timer.Sample startTimer() {
        return Timer.start(meterRegistry);
    }
}
```

### 3. 告警配置

```properties
# MQ监控告警
rabbitmq.monitor.queue.depth.threshold = 1000
rabbitmq.monitor.consumer.lag.threshold = 300
rabbitmq.monitor.alert.webhook = https://hooks.slack.com/xxx
rabbitmq.monitor.alert.email = ops@yamibuy.com
```

## 性能优化

### 1. 批量处理

```java
@RabbitListener(queues = "ec-so.batch.process.queue")
public void handleBatchMessages(@Payload List<OrderInfo> orders) {
    
    // 批量处理订单
    batchProcessOrders(orders);
}

// 批量发送消息
public void sendBatchMessages(List<OrderInfo> orders) {
    
    List<Message> messages = orders.stream()
        .map(this::convertToMessage)
        .collect(Collectors.toList());
    
    rabbitTemplate.send("ec-so.exchange", "batch.process", messages);
}
```

### 2. 连接池优化

```properties
# RabbitMQ连接池配置
spring.rabbitmq.cache.connection.mode = CONNECTION
spring.rabbitmq.cache.connection.size = 10
spring.rabbitmq.cache.channel.size = 50
spring.rabbitmq.cache.channel.checkout-timeout = 5000
```

### 3. 消费者并发配置

```properties
# 消费者并发配置
spring.rabbitmq.listener.simple.concurrency = 5
spring.rabbitmq.listener.simple.max-concurrency = 20
spring.rabbitmq.listener.simple.prefetch = 10
```