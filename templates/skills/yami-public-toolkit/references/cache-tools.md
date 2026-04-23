# 缓存工具使用指南

## 概述

Yami-Public 提供了基于注解的 Redis 缓存工具 `@CacheableRedis`，支持方法级缓存、Spring EL 表达式、自定义过期时间等功能。

## 基本使用

### 简单缓存

```java
@Service
public class UserService {
    
    @CacheableRedis(
        key = "user:info:%s", 
        params = "#userId", 
        expireTime = 3600
    )
    public UserInfo getUserInfo(String userId) {
        // 从数据库查询用户信息
        return userMapper.selectById(userId);
    }
}
```

### 多参数缓存

```java
@CacheableRedis(
    key = "order:list:%s:%s:%d", 
    params = "#userId + ':' + #status + ':' + #pageNum", 
    expireTime = 1800
)
public List<Order> getOrderList(String userId, String status, int pageNum) {
    return orderMapper.selectByUserAndStatus(userId, status, pageNum);
}
```

## 注解参数详解

### key 参数

缓存的 Redis Key 模板，支持占位符格式：

```java
// 单个占位符
@CacheableRedis(key = "user:%s", params = "#userId")

// 多个占位符
@CacheableRedis(key = "product:%s:%s", params = "#categoryId + ':' + #productId")

// 复杂格式
@CacheableRedis(key = "search:result:%s:%d:%d", params = "#keyword + ':' + #page + ':' + #size")
```

### params 参数

Spring EL 表达式，用于动态生成缓存 Key：

```java
// 使用参数索引
@CacheableRedis(key = "cache:%s:%s", params = "#0 + ':' + #1")

// 使用参数名（推荐）
@CacheableRedis(key = "cache:%s:%s", params = "#userId + ':' + #type")

// 复杂表达式
@CacheableRedis(
    key = "user:profile:%s", 
    params = "#user.id + '_' + #user.type"
)
public UserProfile getUserProfile(User user) {
    // ...
}

// 条件表达式
@CacheableRedis(
    key = "data:%s", 
    params = "#id != null ? #id : 'default'"
)
public Data getData(String id) {
    // ...
}
```

### expireTime 参数

缓存过期时间，单位为秒：

```java
// 1小时过期
@CacheableRedis(key = "temp:data:%s", params = "#id", expireTime = 3600)

// 1天过期
@CacheableRedis(key = "daily:report:%s", params = "#date", expireTime = 86400)

// 永不过期（不推荐）
@CacheableRedis(key = "static:config:%s", params = "#type", expireTime = -1)
```

### cacheNull 参数

是否缓存 null 值，用于防止缓存穿透：

```java
// 缓存 null 值（默认）
@CacheableRedis(
    key = "user:info:%s", 
    params = "#userId", 
    cacheNull = true
)
public UserInfo getUserInfo(String userId) {
    return userMapper.selectById(userId); // 可能返回 null
}

// 不缓存 null 值
@CacheableRedis(
    key = "product:detail:%s", 
    params = "#productId", 
    cacheNull = false
)
public ProductDetail getProductDetail(String productId) {
    return productMapper.selectById(productId);
}
```

## 高级用法

### 对象属性作为缓存Key

```java
@CacheableRedis(
    key = "order:summary:%s:%s", 
    params = "#request.userId + ':' + #request.orderType"
)
public OrderSummary getOrderSummary(OrderQueryRequest request) {
    return orderService.calculateSummary(request);
}
```

### 方法返回值缓存

```java
@CacheableRedis(
    key = "calculation:result:%s", 
    params = "#input.toString()", 
    expireTime = 7200
)
public CalculationResult performCalculation(CalculationInput input) {
    // 复杂计算逻辑
    return calculator.calculate(input);
}
```

### 集合类型缓存

```java
@CacheableRedis(
    key = "category:products:%s:%d", 
    params = "#categoryId + ':' + #limit", 
    expireTime = 1800,
    cacheNull = false  // 不缓存空集合
)
public List<Product> getProductsByCategory(String categoryId, int limit) {
    return productMapper.selectByCategory(categoryId, limit);
}
```

## 缓存策略

### 缓存时间设置建议

| 数据类型 | 建议过期时间 | 说明 |
|---------|-------------|------|
| 用户基本信息 | 1-2小时 | 变更频率低，可适当延长 |
| 商品信息 | 30分钟-1小时 | 价格库存变化频繁 |
| 配置信息 | 4-12小时 | 变更很少，可长时间缓存 |
| 搜索结果 | 10-30分钟 | 实时性要求较高 |
| 统计数据 | 1-6小时 | 可接受一定延迟 |

### 缓存Key设计原则

1. **层次化命名**: 使用冒号分隔不同层级
   ```java
   // 好的设计
   "user:profile:123"
   "product:detail:456"
   "order:summary:789:pending"
   
   // 避免的设计
   "userprofile123"
   "product_detail_456"
   ```

2. **包含版本信息**: 便于缓存更新
   ```java
   @CacheableRedis(
       key = "api:v2:user:info:%s", 
       params = "#userId"
   )
   ```

3. **避免特殊字符**: 不使用空格、中文等
   ```java
   // 推荐
   @CacheableRedis(
       key = "search:result:%s", 
       params = "#keyword.replaceAll(' ', '_')"
   )
   ```

## 缓存清除

### 手动清除缓存

```java
@Service
public class CacheService {
    
    @Autowired
    private RedisTemplate<String, Object> redisTemplate;
    
    public void clearUserCache(String userId) {
        String pattern = "user:*:" + userId;
        Set<String> keys = redisTemplate.keys(pattern);
        if (!keys.isEmpty()) {
            redisTemplate.delete(keys);
        }
    }
    
    public void clearCacheByPattern(String pattern) {
        Set<String> keys = redisTemplate.keys(pattern);
        if (!keys.isEmpty()) {
            redisTemplate.delete(keys);
        }
    }
}
```

### 使用 @CacheEvictRedis 注解

```java
@CacheEvictRedis(
    key = "user:info:%s", 
    params = "#userId"
)
public void updateUserInfo(String userId, UserInfo userInfo) {
    userMapper.updateById(userId, userInfo);
}
```

## 性能优化

### 批量缓存操作

```java
@Service
public class BatchCacheService {
    
    @Autowired
    private RedisTemplate<String, Object> redisTemplate;
    
    public Map<String, UserInfo> batchGetUsers(List<String> userIds) {
        // 批量获取缓存
        List<String> keys = userIds.stream()
            .map(id -> "user:info:" + id)
            .collect(Collectors.toList());
            
        List<Object> values = redisTemplate.opsForValue().multiGet(keys);
        
        Map<String, UserInfo> result = new HashMap<>();
        for (int i = 0; i < userIds.size(); i++) {
            if (values.get(i) != null) {
                result.put(userIds.get(i), (UserInfo) values.get(i));
            }
        }
        
        return result;
    }
}
```

### 缓存预热

```java
@Component
public class CacheWarmup {
    
    @EventListener(ApplicationReadyEvent.class)
    public void warmupCache() {
        // 应用启动后预热关键缓存
        warmupUserCache();
        warmupProductCache();
    }
    
    private void warmupUserCache() {
        List<String> hotUsers = getHotUsers();
        for (String userId : hotUsers) {
            userService.getUserInfo(userId); // 触发缓存
        }
    }
}
```

## 监控和调试

### 缓存命中率监控

```java
@Component
public class CacheMetrics {
    
    private final MeterRegistry meterRegistry;
    private final Counter cacheHits;
    private final Counter cacheMisses;
    
    public CacheMetrics(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
        this.cacheHits = Counter.builder("cache.hits")
            .description("Cache hits")
            .register(meterRegistry);
        this.cacheMisses = Counter.builder("cache.misses")
            .description("Cache misses")
            .register(meterRegistry);
    }
    
    public void recordHit() {
        cacheHits.increment();
    }
    
    public void recordMiss() {
        cacheMisses.increment();
    }
}
```

### 缓存调试日志

```java
// 在 application.properties 中配置
logging.level.com.yamibuy.purchase.util.cache=DEBUG
```

## 最佳实践

### 1. 合理设置过期时间

```java
// 根据数据特性设置过期时间
@CacheableRedis(
    key = "user:session:%s", 
    params = "#sessionId", 
    expireTime = 1800  // 30分钟，适合会话数据
)

@CacheableRedis(
    key = "system:config:%s", 
    params = "#configKey", 
    expireTime = 43200  // 12小时，适合配置数据
)
```

### 2. 防止缓存穿透

```java
@CacheableRedis(
    key = "product:info:%s", 
    params = "#productId", 
    expireTime = 3600,
    cacheNull = true  // 缓存null值防止穿透
)
public Product getProduct(String productId) {
    return productMapper.selectById(productId);
}
```

### 3. 缓存雪崩预防

```java
// 添加随机过期时间
@CacheableRedis(
    key = "hot:data:%s", 
    params = "#id", 
    expireTime = 3600  // 基础1小时 + 随机时间
)
public HotData getHotData(String id) {
    // 在实际实现中可以添加随机过期时间
    return dataService.getById(id);
}
```

### 4. 异常处理

```java
@Service
public class SafeCacheService {
    
    @CacheableRedis(
        key = "safe:data:%s", 
        params = "#id", 
        expireTime = 3600
    )
    public DataResult getSafeData(String id) {
        try {
            return dataService.getById(id);
        } catch (Exception e) {
            log.error("获取数据失败: {}", id, e);
            // 返回默认值或抛出业务异常
            return DataResult.defaultValue();
        }
    }
}
```

## 注意事项

1. **序列化问题**: 确保缓存对象可序列化
2. **内存使用**: 监控 Redis 内存使用情况
3. **网络延迟**: 考虑 Redis 网络延迟对性能的影响
4. **数据一致性**: 缓存更新策略要考虑数据一致性
5. **热点数据**: 识别和优化热点数据的缓存策略