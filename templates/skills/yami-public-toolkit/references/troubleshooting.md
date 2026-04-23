# 常见问题和解决方案

## 概述

本文档汇总了使用 Yami-Public 工具包过程中的常见问题、错误信息和解决方案。通过这些问题的解答，帮助开发者快速定位和解决使用过程中遇到的各种问题。

## 安装和配置问题

### Q1: 工具包无法自动注入，Bean 找不到

**问题现象：**
```
NoSuchBeanDefinitionException: No qualifying bean of type 'com.yamibuy.purchase.util.RedisLockClient'
```

**原因分析：**
启动类包路径与工具包不匹配，自动配置未生效。

**解决方案：**
```java
// EC 模块
@EnablePublicEcPurchase
@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}

// Central 模块
@EnablePublicCentralPurchase
@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
```

### Q2: Maven 依赖冲突

**问题现象：**
```
ClassNotFoundException 或 NoSuchMethodError
```

**原因分析：**
版本冲突或依赖传递问题。

**解决方案：**
```xml
<!-- 排除冲突的依赖 -->
<dependency>
    <groupId>com.yamibuy</groupId>
    <artifactId>ec-purchase-tool</artifactId>
    <version>1.2.2</version>
    <exclusions>
        <exclusion>
            <groupId>conflicting-group</groupId>
            <artifactId>conflicting-artifact</artifactId>
        </exclusion>
    </exclusions>
</dependency>

<!-- 使用 dependencyManagement 统一版本 -->
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>com.yamibuy</groupId>
            <artifactId>yami-global-dependencies</artifactId>
            <version>3.0.10-SNAPSHOT</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>
```

### Q3: Redis 连接配置问题

**问题现象：**
```
RedisConnectionFailureException: Unable to connect to Redis
```

**解决方案：**
```yaml
# application.yml
spring:
  redis:
    host: your-redis-host
    port: 6379
    password: your-password
    database: 0
    timeout: 5000ms
    lettuce:
      pool:
        max-active: 8
        max-idle: 8
        min-idle: 0
```

## 缓存工具问题

### Q4: @CacheableRedis 注解不生效

**问题现象：**
缓存注解没有起作用，每次都执行方法。

**原因分析：**
1. AOP 代理问题（内部方法调用）
2. 参数表达式错误
3. Redis 连接问题

**解决方案：**
```java
// 错误：内部方法调用
@Service
public class UserService {
    public UserInfo getUser(String userId) {
        return getUserFromCache(userId); // 内部调用，AOP不生效
    }
    
    @CacheableRedis(key = "user:%s", params = "#userId")
    private UserInfo getUserFromCache(String userId) {
        return userMapper.selectById(userId);
    }
}

// 正确：外部调用或使用 @Autowired 自注入
@Service
public class UserService {
    
    @Autowired
    private UserService self; // 自注入
    
    public UserInfo getUser(String userId) {
        return self.getUserFromCache(userId); // 通过代理调用
    }
    
    @CacheableRedis(key = "user:%s", params = "#userId")
    public UserInfo getUserFromCache(String userId) {
        return userMapper.selectById(userId);
    }
}
```

### Q5: 缓存 Key 生成错误

**问题现象：**
缓存 Key 不符合预期，参数没有正确替换。

**解决方案：**
```java
// 错误的参数表达式
@CacheableRedis(key = "user:%s", params = "userId") // 缺少 #

// 正确的参数表达式
@CacheableRedis(key = "user:%s", params = "#userId")
@CacheableRedis(key = "user:%s:%s", params = "#userId,#type")

// 复杂对象参数
@CacheableRedis(key = "order:%s", params = "#request.orderId")
public OrderInfo getOrder(OrderRequest request) {
    return orderService.getOrder(request.getOrderId());
}
```

### Q6: 缓存空值问题

**问题现象：**
方法返回 null 时也被缓存，导致后续请求直接返回 null。

**解决方案：**
```java
// 使用 cacheNull 参数控制
@CacheableRedis(
    key = "user:%s", 
    params = "#userId", 
    cacheNull = false  // 不缓存 null 值
)
public UserInfo getUserInfo(String userId) {
    return userMapper.selectById(userId);
}

// 或者在方法中处理
public UserInfo getUserInfo(String userId) {
    UserInfo user = userMapper.selectById(userId);
    return user != null ? user : new UserInfo(); // 返回默认对象而不是 null
}
```

## 限流工具问题

### Q7: 限流不生效

**问题现象：**
@RequestLimit 注解没有限流效果。

**原因分析：**
1. Redis 连接问题
2. 限流参数配置错误
3. 方法调用方式问题

**解决方案：**
```java
// 检查 Redis 连接
@Autowired
private RedisTemplate<String, String> redisTemplate;

@PostConstruct
public void checkRedis() {
    try {
        redisTemplate.opsForValue().set("test", "test");
        log.info("Redis 连接正常");
    } catch (Exception e) {
        log.error("Redis 连接异常", e);
    }
}

// 正确的限流配置
@RequestLimit(
    times = 10,                    // 10次
    section = Duration.ofMinutes(1), // 1分钟内
    message = "请求过于频繁，请稍后再试"
)
public void sensitiveOperation() {
    // 业务逻辑
}
```

### Q8: 限流粒度控制

**问题现象：**
需要按不同维度进行限流（IP、用户、接口等）。

**解决方案：**
```java
// IP 限流
@RequestLimit(
    times = 100, 
    section = Duration.ofMinutes(1),
    keyGenerator = "ipKeyGenerator"  // 自定义 Key 生成器
)
public void publicApi() {
    // 公开接口
}

// 用户限流
@RequestLimit(
    times = 10, 
    section = Duration.ofMinutes(1),
    keyGenerator = "userKeyGenerator"
)
public void userApi() {
    // 用户接口
}

// 自定义 Key 生成器
@Component("ipKeyGenerator")
public class IpKeyGenerator implements KeyGenerator {
    @Override
    public String generate(Object target, Method method, Object... params) {
        String ip = getClientIp();
        return "limit:ip:" + ip + ":" + method.getName();
    }
}
```

## 分布式锁问题

### Q9: 分布式锁获取失败

**问题现象：**
```
RedisLockException: Failed to acquire lock
```

**原因分析：**
1. 锁竞争激烈
2. 锁超时时间设置不合理
3. 锁没有正确释放

**解决方案：**
```java
@Service
public class OrderService {
    
    @Autowired
    private RedisLockClient redisLockClient;
    
    public void processOrder(String orderId) {
        String lockKey = "order:lock:" + orderId;
        boolean locked = false;
        
        try {
            // 尝试获取锁，等待5秒，锁定30秒
            locked = redisLockClient.tryLock(lockKey, TimeUnit.SECONDS, 5, 30);
            
            if (!locked) {
                throw new BusinessException("订单正在处理中，请稍后再试");
            }
            
            // 业务逻辑
            doProcessOrder(orderId);
            
        } finally {
            if (locked) {
                redisLockClient.unlock(lockKey);
            }
        }
    }
}
```

### Q10: 锁超时问题

**问题现象：**
业务执行时间超过锁的超时时间，导致锁被自动释放。

**解决方案：**
```java
// 方案1：增加锁超时时间
boolean locked = redisLockClient.tryLock(lockKey, TimeUnit.SECONDS, 5, 60); // 增加到60秒

// 方案2：使用可重入锁并续期
public void longRunningTask(String taskId) {
    String lockKey = "task:lock:" + taskId;
    RLock lock = redissonClient.getLock(lockKey);
    
    try {
        // 获取锁，自动续期
        if (lock.tryLock(5, TimeUnit.SECONDS)) {
            // 长时间运行的任务
            performLongTask(taskId);
        }
    } finally {
        if (lock.isHeldByCurrentThread()) {
            lock.unlock();
        }
    }
}
```

## AB测试问题

### Q11: AB测试返回空字符串

**问题现象：**
ABTestService.getAbValue() 总是返回空字符串。

**原因分析：**
1. 实验配置不存在
2. 用户不在实验范围内
3. 服务调用异常

**解决方案：**
```java
@Service
public class ABTestService {
    
    public String getAbValueWithFallback(String token, String deviceId, String yamiId, String experimentCode) {
        try {
            String abValue = abTestService.getAbValue(token, deviceId, yamiId, experimentCode, false);
            
            if (StringUtils.isEmpty(abValue)) {
                log.warn("AB测试返回空值: experimentCode={}, yamiId={}", experimentCode, yamiId);
                return "control"; // 默认返回控制组
            }
            
            return abValue;
        } catch (Exception e) {
            log.error("AB测试调用异常: experimentCode={}", experimentCode, e);
            return "control"; // 异常时返回控制组
        }
    }
}
```

### Q12: AB测试结果不一致

**问题现象：**
同一用户多次调用返回不同的分组结果。

**解决方案：**
```java
@Service
public class CachedABTestService {
    
    @Autowired
    private RedisTemplate<String, String> redisTemplate;
    
    public String getStableAbValue(String yamiId, String experimentCode) {
        String cacheKey = "ab:cache:" + yamiId + ":" + experimentCode;
        
        // 先从缓存获取
        String cachedValue = redisTemplate.opsForValue().get(cacheKey);
        if (cachedValue != null) {
            return cachedValue;
        }
        
        // 缓存未命中，调用AB测试服务
        String abValue = abTestService.getAbValue(null, null, yamiId, experimentCode, false);
        
        // 缓存结果（24小时）
        if (!StringUtils.isEmpty(abValue)) {
            redisTemplate.opsForValue().set(cacheKey, abValue, Duration.ofHours(24));
        }
        
        return abValue;
    }
}
```

## 文件上传问题

### Q13: 文件上传失败

**问题现象：**
YamibuyUploader.uploadFile() 返回 null。

**原因分析：**
1. Token 无效
2. 网络连接问题
3. 文件格式不支持
4. 上传域名配置错误

**解决方案：**
```java
@Service
public class FileUploadService {
    
    public String uploadFileWithRetry(String token, String mediaType, String fileName, byte[] fileData) {
        // 参数验证
        if (StringUtils.isEmpty(token) || fileData == null || fileData.length == 0) {
            throw new IllegalArgumentException("上传参数不能为空");
        }
        
        // 文件大小检查
        if (fileData.length > 10 * 1024 * 1024) { // 10MB
            throw new IllegalArgumentException("文件大小不能超过10MB");
        }
        
        // 重试机制
        int maxRetries = 3;
        for (int i = 0; i < maxRetries; i++) {
            try {
                String result = YamibuyUploader.uploadFile(token, mediaType, fileName, fileData);
                if (result != null) {
                    return result;
                }
                log.warn("文件上传失败，第{}次重试", i + 1);
            } catch (Exception e) {
                log.error("文件上传异常，第{}次重试", i + 1, e);
            }
            
            // 等待后重试
            try {
                Thread.sleep(1000 * (i + 1)); // 递增等待时间
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        
        throw new RuntimeException("文件上传失败，已重试" + maxRetries + "次");
    }
}
```

## 批量任务问题

### Q14: BatchTask 执行超时

**问题现象：**
批量任务执行时间过长或卡死。

**原因分析：**
1. 线程池资源不足
2. 任务执行时间过长
3. 死锁或资源竞争

**解决方案：**
```java
@Service
public class OptimizedBatchService {
    
    public void executeBatchWithTimeout(List<Supplier<String>> tasks) {
        BatchTask batchTask = BatchTask.init();
        
        // 添加超时控制的任务
        for (int i = 0; i < tasks.size(); i++) {
            final int index = i;
            batchTask.addTask("task_" + i, () -> {
                try {
                    // 使用 CompletableFuture 添加超时控制
                    return CompletableFuture.supplyAsync(tasks.get(index))
                        .get(30, TimeUnit.SECONDS); // 30秒超时
                } catch (TimeoutException e) {
                    log.error("任务{}执行超时", index);
                    return null;
                } catch (Exception e) {
                    log.error("任务{}执行异常", index, e);
                    return null;
                }
            });
        }
        
        batchTask.exec();
        
        // 获取结果时不抛异常
        List<String> results = batchTask.getAll(false);
        log.info("批量任务完成，成功{}个，总共{}个", 
                results.stream().filter(Objects::nonNull).count(), 
                tasks.size());
    }
}
```

### Q15: 线程池资源耗尽

**问题现象：**
```
RejectedExecutionException: Task rejected from ThreadPoolExecutor
```

**解决方案：**
```java
@Configuration
public class ThreadPoolConfig {
    
    @Bean
    @Primary
    public ThreadPoolExecutor customThreadPool() {
        return new ThreadPoolExecutor(
            10,                          // 核心线程数
            50,                          // 最大线程数
            60L, TimeUnit.SECONDS,       // 空闲时间
            new LinkedBlockingQueue<>(200), // 队列大小
            new ThreadFactoryBuilder()
                .setNameFormat("batch-task-%d")
                .build(),
            new ThreadPoolExecutor.CallerRunsPolicy() // 拒绝策略
        );
    }
}

// 监控线程池状态
@Component
public class ThreadPoolMonitor {
    
    @Autowired
    private ThreadPoolExecutor threadPool;
    
    @Scheduled(fixedRate = 30000) // 30秒检查一次
    public void monitorThreadPool() {
        int activeCount = threadPool.getActiveCount();
        int poolSize = threadPool.getPoolSize();
        int queueSize = threadPool.getQueue().size();
        
        log.info("线程池状态: active={}, pool={}, queue={}", activeCount, poolSize, queueSize);
        
        if (activeCount > poolSize * 0.8) {
            log.warn("线程池使用率过高: {}%", (activeCount * 100 / poolSize));
        }
    }
}
```

## 性能问题

### Q16: JSON 序列化性能问题

**问题现象：**
大量 JSON 操作导致性能下降。

**解决方案：**
```java
@Service
public class OptimizedJsonService {
    
    // 复用 ObjectMapper 实例
    private static final ObjectMapper MAPPER = JacksonUtil.getObjectMapper();
    
    // 批量处理
    public List<String> batchSerialize(List<Object> objects) {
        return objects.parallelStream()
            .map(obj -> {
                try {
                    return MAPPER.writeValueAsString(obj);
                } catch (Exception e) {
                    log.error("序列化失败", e);
                    return null;
                }
            })
            .filter(Objects::nonNull)
            .collect(Collectors.toList());
    }
    
    // 使用缓存避免重复序列化
    @Cacheable("json-cache")
    public String getCachedJson(Object obj) {
        return JacksonUtil.toJSONString(obj);
    }
}
```

### Q17: 计算精度问题

**问题现象：**
CalcUtil 计算结果精度不符合预期。

**解决方案：**
```java
// 明确指定精度
BigDecimal result = CalcUtil.init(100.123)
    .div(3)
    .decimalValue(4); // 明确保留4位小数

// 金融计算使用更高精度
BigDecimal financialResult = CalcUtil.init(amount)
    .mul(rate)
    .decimalValue(8); // 金融计算保留8位小数

// 避免浮点数直接计算
// 错误
double result = 0.1 + 0.2; // 结果不是0.3

// 正确
BigDecimal result = CalcUtil.init(0.1).add(0.2).decimalValue(2);
```

## 调试和监控

### Q18: 如何调试工具包问题

**调试步骤：**

1. **启用调试日志**
```yaml
logging:
  level:
    com.yamibuy.purchase: DEBUG
    org.springframework.cache: DEBUG
    org.redisson: DEBUG
```

2. **添加监控指标**
```java
@Component
public class ToolkitMonitor {
    
    private final MeterRegistry meterRegistry;
    
    @EventListener
    public void onCacheHit(CacheHitEvent event) {
        meterRegistry.counter("cache.hit", "key", event.getKey()).increment();
    }
    
    @EventListener
    public void onCacheMiss(CacheMissEvent event) {
        meterRegistry.counter("cache.miss", "key", event.getKey()).increment();
    }
}
```

3. **健康检查**
```java
@Component
public class ToolkitHealthIndicator implements HealthIndicator {
    
    @Override
    public Health health() {
        try {
            // 检查 Redis 连接
            redisTemplate.opsForValue().get("health-check");
            
            // 检查线程池状态
            ThreadPoolExecutor pool = (ThreadPoolExecutor) YamiCoreFixedThreadPoolUtil.getInstance();
            if (pool.getActiveCount() > pool.getMaximumPoolSize() * 0.9) {
                return Health.down().withDetail("threadPool", "使用率过高").build();
            }
            
            return Health.up().build();
        } catch (Exception e) {
            return Health.down(e).build();
        }
    }
}
```

## 版本升级问题

### Q19: 版本升级后功能异常

**问题现象：**
升级工具包版本后，原有功能出现异常。

**解决方案：**

1. **查看版本变更日志**
```bash
# 查看版本差异
git log --oneline v1.2.1..v1.2.2
```

2. **渐进式升级**
```xml
<!-- 先升级到中间版本测试 -->
<dependency>
    <groupId>com.yamibuy</groupId>
    <artifactId>ec-purchase-tool</artifactId>
    <version>1.2.1</version> <!-- 中间版本 -->
</dependency>
```

3. **兼容性处理**
```java
// 版本兼容性检查
@PostConstruct
public void checkCompatibility() {
    String version = getToolkitVersion();
    if (version.compareTo("1.2.0") < 0) {
        log.warn("工具包版本过低，建议升级到最新版本");
    }
}
```

## 联系支持

如果以上解决方案无法解决您的问题，请通过以下方式获取支持：

1. **查看源码**: 在 yami-public 项目中查看具体实现
2. **提交 Issue**: 在项目仓库中提交问题报告
3. **联系团队**: 通过内部沟通渠道联系技术团队

**问题报告模板：**
```
## 问题描述
[详细描述遇到的问题]

## 环境信息
- 工具包版本: 
- Spring Boot 版本:
- Java 版本:
- 操作系统:

## 重现步骤
1. 
2. 
3. 

## 错误日志
[粘贴相关错误日志]

## 期望结果
[描述期望的正确行为]
```