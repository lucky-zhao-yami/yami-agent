# 分布式锁使用指南

## 概述

Yami-Public 提供了基于 Redisson 的分布式锁工具 `RedisLockClient`，支持可重入锁、超时设置、自动释放等功能，用于解决分布式环境下的并发控制问题。

## 基本使用

### 简单锁使用

```java
@Service
public class OrderService {
    
    @Autowired
    private RedisLockClient redisLockClient;
    
    public void processOrder(String orderId) {
        String lockKey = "order:process:" + orderId;
        
        // 尝试获取锁：等待5秒，锁30秒后自动释放
        boolean locked = redisLockClient.tryLock(lockKey, TimeUnit.SECONDS, 5, 30);
        
        if (locked) {
            try {
                // 临界区代码
                doProcessOrder(orderId);
            } finally {
                // 确保锁被释放
                redisLockClient.unlock(lockKey);
            }
        } else {
            throw new BusinessException("订单正在处理中，请稍后再试");
        }
    }
}
```

### 注解方式使用

```java
@Service
public class InventoryService {
    
    @Locker(key = "inventory:update:#productId", waitTime = 5, leaseTime = 30)
    public void updateInventory(String productId, int quantity) {
        // 自动加锁的方法体
        Inventory inventory = inventoryMapper.selectById(productId);
        inventory.setQuantity(inventory.getQuantity() - quantity);
        inventoryMapper.updateById(inventory);
    }
}
```

## 参数详解

### tryLock 方法参数

```java
boolean tryLock(String lockKey, TimeUnit unit, long waitTime, long leaseTime)
```

- **lockKey**: 锁的唯一标识
- **unit**: 时间单位
- **waitTime**: 等待获取锁的最大时间
- **leaseTime**: 锁的自动释放时间

### 时间单位选择

```java
// 秒级锁
redisLockClient.tryLock("key", TimeUnit.SECONDS, 5, 30);

// 毫秒级锁（高精度场景）
redisLockClient.tryLock("key", TimeUnit.MILLISECONDS, 500, 3000);

// 分钟级锁（长时间任务）
redisLockClient.tryLock("key", TimeUnit.MINUTES, 1, 10);
```

## 常见使用场景

### 1. 订单处理防重

```java
@Service
public class OrderProcessService {
    
    @Autowired
    private RedisLockClient redisLockClient;
    
    public void submitOrder(OrderRequest request) {
        String lockKey = "order:submit:" + request.getUserId();
        
        boolean locked = redisLockClient.tryLock(lockKey, TimeUnit.SECONDS, 3, 10);
        if (!locked) {
            throw new BusinessException("请勿重复提交订单");
        }
        
        try {
            // 检查是否已有未完成订单
            if (hasUnfinishedOrder(request.getUserId())) {
                throw new BusinessException("您有未完成的订单，请先处理");
            }
            
            // 创建订单
            createOrder(request);
            
        } finally {
            redisLockClient.unlock(lockKey);
        }
    }
}
```

### 2. 库存扣减

```java
@Service
public class StockService {
    
    public boolean deductStock(String productId, int quantity) {
        String lockKey = "stock:deduct:" + productId;
        
        boolean locked = redisLockClient.tryLock(lockKey, TimeUnit.SECONDS, 2, 5);
        if (!locked) {
            return false; // 获取锁失败，稍后重试
        }
        
        try {
            // 查询当前库存
            Stock stock = stockMapper.selectById(productId);
            if (stock.getQuantity() < quantity) {
                return false; // 库存不足
            }
            
            // 扣减库存
            stock.setQuantity(stock.getQuantity() - quantity);
            stockMapper.updateById(stock);
            
            return true;
            
        } finally {
            redisLockClient.unlock(lockKey);
        }
    }
}
```

### 3. 缓存更新

```java
@Service
public class CacheUpdateService {
    
    public void updateUserCache(String userId) {
        String lockKey = "cache:update:user:" + userId;
        
        boolean locked = redisLockClient.tryLock(lockKey, TimeUnit.SECONDS, 1, 60);
        if (!locked) {
            return; // 已有其他线程在更新，直接返回
        }
        
        try {
            // 双重检查，避免重复更新
            if (isCacheValid(userId)) {
                return;
            }
            
            // 从数据库加载最新数据
            UserInfo userInfo = userService.loadFromDatabase(userId);
            
            // 更新缓存
            redisTemplate.opsForValue().set("user:info:" + userId, userInfo, 3600, TimeUnit.SECONDS);
            
        } finally {
            redisLockClient.unlock(lockKey);
        }
    }
}
```

### 4. 定时任务防重

```java
@Component
public class ScheduledTaskService {
    
    @Scheduled(fixedRate = 60000) // 每分钟执行
    public void scheduledTask() {
        String lockKey = "scheduled:task:daily-report";
        
        boolean locked = redisLockClient.tryLock(lockKey, TimeUnit.SECONDS, 0, 300); // 不等待，锁5分钟
        if (!locked) {
            log.info("定时任务正在执行中，跳过本次执行");
            return;
        }
        
        try {
            log.info("开始执行定时任务");
            generateDailyReport();
            log.info("定时任务执行完成");
            
        } finally {
            redisLockClient.unlock(lockKey);
        }
    }
}
```

## 高级用法

### 可重入锁

```java
@Service
public class ReentrantLockService {
    
    public void outerMethod(String resourceId) {
        String lockKey = "resource:" + resourceId;
        
        boolean locked = redisLockClient.tryLock(lockKey, TimeUnit.SECONDS, 5, 30);
        if (locked) {
            try {
                // 外层方法逻辑
                processResource(resourceId);
                
                // 调用内层方法（可重入）
                innerMethod(resourceId);
                
            } finally {
                redisLockClient.unlock(lockKey);
            }
        }
    }
    
    public void innerMethod(String resourceId) {
        String lockKey = "resource:" + resourceId;
        
        // 同一线程可以再次获取相同的锁
        boolean locked = redisLockClient.tryLock(lockKey, TimeUnit.SECONDS, 5, 30);
        if (locked) {
            try {
                // 内层方法逻辑
                updateResource(resourceId);
                
            } finally {
                redisLockClient.unlock(lockKey);
            }
        }
    }
}
```

### 锁续期

```java
@Service
public class LongRunningTaskService {
    
    public void longRunningTask(String taskId) {
        String lockKey = "task:" + taskId;
        
        boolean locked = redisLockClient.tryLock(lockKey, TimeUnit.SECONDS, 5, 30);
        if (!locked) {
            throw new BusinessException("任务正在执行中");
        }
        
        try {
            // 长时间运行的任务
            for (int i = 0; i < 100; i++) {
                processStep(i);
                
                // 每处理10步检查一次锁状态，必要时续期
                if (i % 10 == 0) {
                    renewLockIfNeeded(lockKey);
                }
            }
            
        } finally {
            redisLockClient.unlock(lockKey);
        }
    }
    
    private void renewLockIfNeeded(String lockKey) {
        // 检查锁剩余时间，如果不足则续期
        RLock lock = redissonClient.getLock(lockKey);
        if (lock.remainTimeToLive() < 10000) { // 剩余时间少于10秒
            lock.expire(30, TimeUnit.SECONDS); // 续期30秒
        }
    }
}
```

## 异常处理

### 锁获取失败处理

```java
@Service
public class SafeLockService {
    
    public void safeOperation(String resourceId) {
        String lockKey = "safe:operation:" + resourceId;
        
        try {
            boolean locked = redisLockClient.tryLock(lockKey, TimeUnit.SECONDS, 3, 30);
            
            if (!locked) {
                // 锁获取失败的处理策略
                handleLockFailure(resourceId);
                return;
            }
            
            try {
                // 执行业务逻辑
                performOperation(resourceId);
                
            } finally {
                redisLockClient.unlock(lockKey);
            }
            
        } catch (Exception e) {
            log.error("操作执行失败: {}", resourceId, e);
            throw new BusinessException("操作失败，请稍后重试");
        }
    }
    
    private void handleLockFailure(String resourceId) {
        // 策略1: 抛出异常
        throw new BusinessException("资源正在被其他操作占用，请稍后重试");
        
        // 策略2: 记录日志并返回
        // log.warn("无法获取锁，跳过操作: {}", resourceId);
        
        // 策略3: 加入队列稍后处理
        // queueService.addToRetryQueue(resourceId);
    }
}
```

### 锁释放异常处理

```java
@Service
public class RobustLockService {
    
    public void robustOperation(String resourceId) {
        String lockKey = "robust:operation:" + resourceId;
        boolean locked = false;
        
        try {
            locked = redisLockClient.tryLock(lockKey, TimeUnit.SECONDS, 5, 30);
            
            if (locked) {
                performOperation(resourceId);
            }
            
        } catch (Exception e) {
            log.error("操作执行异常: {}", resourceId, e);
            throw e;
            
        } finally {
            // 安全释放锁
            if (locked) {
                try {
                    redisLockClient.unlock(lockKey);
                } catch (Exception e) {
                    log.error("释放锁失败: {}", lockKey, e);
                    // 不重新抛出异常，避免掩盖业务异常
                }
            }
        }
    }
}
```

## 性能优化

### 锁粒度优化

```java
@Service
public class OptimizedLockService {
    
    // 粗粒度锁（不推荐）
    public void coarseGrainedLock() {
        String lockKey = "global:lock";
        // 所有操作都使用同一个锁，并发性差
    }
    
    // 细粒度锁（推荐）
    public void fineGrainedLock(String userId, String productId) {
        String lockKey = "user:product:" + userId + ":" + productId;
        // 针对特定用户和商品的锁，并发性好
    }
    
    // 分段锁
    public void segmentedLock(String resourceId) {
        // 根据资源ID的哈希值分段
        int segment = Math.abs(resourceId.hashCode()) % 16;
        String lockKey = "segment:lock:" + segment;
        // 将锁分散到16个段，减少锁竞争
    }
}
```

### 锁等待时间优化

```java
@Service
public class TimeOptimizedLockService {
    
    // 快速失败模式
    public boolean quickFailOperation(String resourceId) {
        String lockKey = "quick:" + resourceId;
        
        // 不等待，立即返回结果
        boolean locked = redisLockClient.tryLock(lockKey, TimeUnit.MILLISECONDS, 0, 5000);
        
        if (!locked) {
            return false; // 快速失败
        }
        
        try {
            performQuickOperation(resourceId);
            return true;
        } finally {
            redisLockClient.unlock(lockKey);
        }
    }
    
    // 适度等待模式
    public void moderateWaitOperation(String resourceId) {
        String lockKey = "moderate:" + resourceId;
        
        // 等待适中时间
        boolean locked = redisLockClient.tryLock(lockKey, TimeUnit.SECONDS, 3, 30);
        
        if (locked) {
            try {
                performOperation(resourceId);
            } finally {
                redisLockClient.unlock(lockKey);
            }
        } else {
            throw new BusinessException("系统繁忙，请稍后重试");
        }
    }
}
```

## 监控和调试

### 锁使用统计

```java
@Component
public class LockMetrics {
    
    private final MeterRegistry meterRegistry;
    private final Counter lockAcquiredCounter;
    private final Counter lockFailedCounter;
    private final Timer lockHoldTimer;
    
    public LockMetrics(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
        this.lockAcquiredCounter = Counter.builder("lock.acquired")
            .description("Number of locks acquired")
            .register(meterRegistry);
        this.lockFailedCounter = Counter.builder("lock.failed")
            .description("Number of failed lock attempts")
            .register(meterRegistry);
        this.lockHoldTimer = Timer.builder("lock.hold.time")
            .description("Time locks are held")
            .register(meterRegistry);
    }
    
    public void recordLockAcquired(String lockKey) {
        lockAcquiredCounter.increment(Tags.of("key", lockKey));
    }
    
    public void recordLockFailed(String lockKey) {
        lockFailedCounter.increment(Tags.of("key", lockKey));
    }
    
    public Timer.Sample startLockTimer() {
        return Timer.start(meterRegistry);
    }
}
```

### 锁状态监控

```java
@Component
public class LockMonitor {
    
    @Autowired
    private RedissonClient redissonClient;
    
    @Scheduled(fixedRate = 30000) // 每30秒检查一次
    public void monitorLocks() {
        // 获取所有锁信息
        Collection<String> lockNames = redissonClient.getKeys().getKeysByPattern("lock:*");
        
        for (String lockName : lockNames) {
            RLock lock = redissonClient.getLock(lockName);
            
            if (lock.isLocked()) {
                long remainTime = lock.remainTimeToLive();
                log.info("锁状态监控 - Key: {}, 剩余时间: {}ms", lockName, remainTime);
                
                // 检查是否有长时间持有的锁
                if (remainTime > TimeUnit.MINUTES.toMillis(5)) {
                    log.warn("发现长时间持有的锁: {}, 剩余时间: {}ms", lockName, remainTime);
                }
            }
        }
    }
}
```

## 最佳实践

### 1. 锁Key设计规范

```java
public class LockKeyConstants {
    
    // 业务模块前缀
    private static final String ORDER_PREFIX = "lock:order:";
    private static final String INVENTORY_PREFIX = "lock:inventory:";
    private static final String USER_PREFIX = "lock:user:";
    
    // 具体锁Key生成
    public static String orderProcessLock(String orderId) {
        return ORDER_PREFIX + "process:" + orderId;
    }
    
    public static String inventoryDeductLock(String productId) {
        return INVENTORY_PREFIX + "deduct:" + productId;
    }
    
    public static String userOperationLock(String userId, String operation) {
        return USER_PREFIX + operation + ":" + userId;
    }
}
```

### 2. 锁超时时间设置

```java
public class LockTimeoutConfig {
    
    // 快速操作：1-5秒
    public static final int QUICK_OPERATION_TIMEOUT = 5;
    
    // 普通操作：10-30秒
    public static final int NORMAL_OPERATION_TIMEOUT = 30;
    
    // 长时间操作：1-5分钟
    public static final int LONG_OPERATION_TIMEOUT = 300;
    
    // 批处理操作：5-30分钟
    public static final int BATCH_OPERATION_TIMEOUT = 1800;
}
```

### 3. 异常安全模式

```java
@Service
public class SafeLockTemplate {
    
    public <T> T executeWithLock(String lockKey, int waitSeconds, int leaseSeconds, Supplier<T> operation) {
        boolean locked = redisLockClient.tryLock(lockKey, TimeUnit.SECONDS, waitSeconds, leaseSeconds);
        
        if (!locked) {
            throw new BusinessException("获取锁失败，请稍后重试");
        }
        
        try {
            return operation.get();
        } finally {
            try {
                redisLockClient.unlock(lockKey);
            } catch (Exception e) {
                log.error("释放锁失败: {}", lockKey, e);
            }
        }
    }
    
    // 使用示例
    public void businessMethod(String resourceId) {
        String result = executeWithLock(
            "business:" + resourceId,
            5, 30,
            () -> {
                // 业务逻辑
                return performBusinessOperation(resourceId);
            }
        );
    }
}
```

## 注意事项

1. **避免死锁**: 多个锁的获取顺序要一致
2. **合理设置超时**: 根据业务特点设置合适的等待和持有时间
3. **异常安全**: 确保在任何情况下锁都能被正确释放
4. **性能考虑**: 避免锁粒度过粗导致性能问题
5. **监控告警**: 建立锁使用监控和异常告警机制
6. **降级策略**: Redis不可用时的降级处理方案