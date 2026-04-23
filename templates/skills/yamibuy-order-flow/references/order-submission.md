# 用户提交订单流程 (EC-SO)

## 接口入口

```java
// OrderRestImpl.java
@PostMapping(value = "/submit/physical/v2", params = "flow_version=1.0")
public BaseResponse<MyPurchaseDetail> submitOrderV3(...)
```

## 详细流程步骤

### Step 1: 前置检查

```java
// 1. 系统状态检查
orderCheckService.systemStatusCheck();

// 2. 参数校验
submitParamCheckV2(submit_body);

// 3. 重复下单校验 (通过MD5比对)
duplicateOrderVerify(submit_body);

// 4. 用户并发下单锁
String lockKey = ECSOConstant.ORDER_FREQUENTLY_KEY + submit_body.getUser_id();
boolean lock = redisLockClient.tryLock(lockKey, TimeUnit.SECONDS, 5, 5);
```

**重复下单校验机制:**
- 对订单内容(商品+地址)计算MD5
- 将MD5存入Redis，60秒过期
- 提交时比对MD5，相同则拒绝
- 同一用户5秒内只能提交一次订单

### Step 2: 秒杀商品处理

```java
// 获取用户仓库信息
UserLocationResponse location = locationService.getuserlocation(submit_body.getToken());
String wh_num = location.getWh_num();

// 秒杀活动方法 - 扣减秒杀队列
Map<String, Integer> item_queue_map = submitActivitySeckill(submit_body, wh_num);
```

**秒杀处理特点:**
- 从Redis秒杀队列中扣减库存
- 秒杀订单支付时间缩短为5分钟
- 优先处理和发货
- 超时未支付快速释放库存

### Step 3: 订单流水线处理

```java
// 责任链模式处理订单
AbstractHandleFunc.handle(orderhandleParam, "userHandlerV2")
    .thenHandle(orderhandleParam, "itemHandlerV2")        // 商品信息
    .thenHandle(orderhandleParam, "sellerHandlerV2")      // 商家信息
    .thenHandle(orderhandleParam, "couponHandlerV2")      // 优惠券
    .thenHandle(orderhandleParam, "payHandlerV2")         // 支付方式
    .thenHandle(orderhandleParam, "pointHandlerV2")       // 积分
    .thenHandle(orderhandleParam, "giftHandlerV2")        // 赠品
    .thenHandle(orderhandleParam, "splitOrderHandlerV2")  // 拆单(按商家)
    .thenHandle(orderhandleParam, "splitWhHandlerV2")     // 拆仓(按仓库)
    .thenHandle(orderhandleParam, "shippingHandlerV2")    // 运费
    .thenHandle(orderhandleParam, "freeShippingCouponHandlerV2") // 包邮券
    .thenHandle(orderhandleParam, "taxHandlerV2")         // 税费
    .thenHandle(orderhandleParam, "importFeeHandlerV2")   // 进口费
    .thenHandle(orderhandleParam, "giftCardHandlerV2");   // 礼卡
```

**处理器说明:**
- **userHandlerV2**: 用户信息验证和处理
- **itemHandlerV2**: 商品库存、价格验证
- **sellerHandlerV2**: 商家信息和规则处理
- **couponHandlerV2**: 优惠券可用性和金额计算
- **payHandlerV2**: 支付方式验证和处理
- **pointHandlerV2**: 积分使用规则和扣减
- **giftHandlerV2**: 赠品规则和库存检查
- **splitOrderHandlerV2**: 按商家拆分订单
- **splitWhHandlerV2**: 按仓库拆分订单
- **shippingHandlerV2**: 运费计算
- **freeShippingCouponHandlerV2**: 包邮券处理
- **taxHandlerV2**: 税费计算 (Avalara)
- **importFeeHandlerV2**: 进口费计算
- **giftCardHandlerV2**: 礼卡使用和扣减

### Step 4: 生成订单号

```java
// 生成订单编号 (Redis或DB)
batchGenerateIdV2(order_list);

// 设置子单parent_id
setChildOrderParentId(order_list);
```

**订单号生成方式:**
```properties
# 0: 使用数据库生成  1: 使用Redis生成
gen_id_use_redis = 0
```

| 方式 | 优点 | 缺点 |
|------|------|------|
| Redis | 性能高，支持高并发 | 需要异步同步到DB，有丢失风险 |
| DB | 可靠性高，数据一致性好 | 性能较低，高并发时有瓶颈 |

### Step 5: 计算订单金额

```java
for (OrderInfo order : order_list) {
    orderAmountService.caculateOrderAmount(order);
}

// 和上一次checkout比较
submitCompareAmount(order_list, submit_body);
```

**金额计算包括:**
- 商品金额
- 运费
- 税费
- 进口费
- 优惠券折扣
- 积分抵扣
- 礼卡抵扣

### Step 6: 预占库存 (新流程V3)

```java
// 扣减库存 - 预占模式
List<InventoryDeductionPage> invUpdateData = 
    submitUpdateInventoryV2(order_list, ECSOConstant.INVENTORY_OPERATE_TYPE_PREOCCUPY);
```

**预占机制优势:**
1. **防止超卖**: 用户下单后立即预占库存，避免支付时库存不足
2. **提升体验**: 用户看到的库存是真实可用的
3. **减少取消**: 预占后其他用户无法购买，减少订单取消率
4. **异步处理**: 支付和落库异步进行，提升系统性能

### Step 7: 保存预占订单

```java
// 预占资源: 积分、礼卡、优惠券、税、库存
savePreSubmitOrder(order_list, invUpdateData);

// 保存到Redis
orderRedisService.preSubmitOrderAll(preSubmitRequest);

// 发送延时取消MQ (实际10分钟后自动取消)
String routing_key = auto_cancel_purchase_routing_key;
rabbitSender.sendByDelayExchange(routing_key, String.valueOf(purchase_id));
```

**预占资源包括:**
- **库存预占**: 防止其他用户购买
- **积分预占**: 锁定用户积分使用
- **礼卡预占**: 锁定礼卡余额
- **优惠券预占**: 标记优惠券为使用中
- **税信息保存**: 保存Avalara计算的税费

**延时取消配置:**
```properties
# ec-so-service.properties
routing_key_auto_cancel_purchase = so.purchase.canceled
order_canceled_timeout = 120000  # 2分钟(此配置未实际使用)

# ec-so-job.properties (实际生效配置)
order_canceled_timeout = 600000  # 10分钟
```

## 订单初始状态设置

```java
// 设置初始状态
orderInfo.setOrder_status(OrderStatusEnum.CONFIRMED.getType());  // 1
orderInfo.setShipping_status(ShippingStatusEnum.UNSHIPPED.getType());  // 0

// 支付状态根据流程版本设置
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

## 关键配置说明

### 重复下单校验
```properties
DUPLICATE_ORDER_VERIFY_KEY = so:order:duplicate:verify:user_id:%s
DUPLICATE_ORDER_VERIFY_TIME_OUT = 60
```

### 秒杀配置
```properties
SECKILL_FLAG = 1
REDIS_KEY_ACTIVITY_SECKILL_ITEM_LIST = so:activty:seckill:item_list
REDIS_KEY_ACTIVITY_SECKILL_ITEM_QUEUE = so:activty:seckill:queue:item_number_%s
SECKILL_ORDER_PAYMENT_TIME = 300  # 5分钟
```

### Checkout缓存配置
```properties
CHECK_OUT_PHYSICAL_KEY = so:checkout:physical:%s
CHECK_OUT_VIRTUAL_KEY = so:checkout:virtual:%s:%s
CHECK_OUT_BODY_TIME_OUT = 86400  # 24小时
```

### 支付方式配置
```properties
payment_api_flag = 1
payment_api_flag_web = 1
payment_api_flag_app = 1
payment_api_whitelist = 915080,2392894
```

## 异常处理

### 系统异常
- 系统维护状态检查
- 服务降级处理
- 限流保护

### 业务异常
- 商品库存不足
- 优惠券不可用
- 积分余额不足
- 地址验证失败

### 并发控制
- 用户级别的下单锁
- 商品级别的库存锁
- Redis分布式锁

## 性能优化

### 缓存策略
- 商品信息缓存
- 用户信息缓存
- 优惠券规则缓存
- 税率信息缓存

### 异步处理
- MQ异步通知
- 邮件异步发送
- 日志异步写入
- 统计异步计算

### 数据库优化
- 读写分离
- 索引优化
- 分库分表
- 连接池配置