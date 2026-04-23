# 最佳实践和注意事项

## 依赖管理最佳实践

### 版本选择策略

#### 生产环境版本管理

```xml
<!-- 生产环境：使用稳定的 RELEASE 版本 -->
<dependency>
    <groupId>com.yamibuy</groupId>
    <artifactId>ec-purchase-tool</artifactId>
    <version>1.2.2</version> <!-- 明确指定版本号 -->
</dependency>

<!-- 避免使用范围版本 -->
<dependency>
    <groupId>com.yamibuy</groupId>
    <artifactId>ec-purchase-tool</artifactId>
    <version>[1.2.0,1.3.0)</version> <!-- 不推荐 -->
</dependency>
```

#### 开发测试环境

```xml
<!-- 开发环境：可以使用 SNAPSHOT 版本进行测试 -->
<dependency>
    <groupId>com.yamibuy</groupId>
    <artifactId>ec-purchase-tool</artifactId>
    <version>1.2.3-SNAPSHOT</version>
</dependency>
```

#### 版本升级策略

```java
// 版本升级检查清单
public class VersionUpgradeChecklist {
    
    /**
     * 升级前检查
     * 1. 查看版本变更日志
     * 2. 检查API兼容性
     * 3. 确认依赖冲突
     * 4. 准备回滚方案
     */
    public void preUpgradeCheck() {
        // 检查当前版本
        checkCurrentVersion();
        
        // 分析依赖树
        analyzeDependencyTree();
        
        // 验证兼容性
        validateCompatibility();
    }
    
    /**
     * 升级后验证
     * 1. 功能测试
     * 2. 性能测试
     * 3. 集成测试
     * 4. 监控指标
     */
    public void postUpgradeValidation() {
        // 功能验证
        validateFunctionality();
        
        // 性能基准测试
        performanceBenchmark();
        
        // 监控关键指标
        monitorMetrics();
    }
}
```

### 依赖冲突解决

#### 排除冲突依赖

```xml
<dependency>
    <groupId>com.yamibuy</groupId>
    <artifactId>ec-purchase-tool</artifactId>
    <version>1.2.2</version>
    <exclusions>
        <!-- 排除冲突的传递依赖 -->
        <exclusion>
            <groupId>com.fasterxml.jackson.core</groupId>
            <artifactId>jackson-core</artifactId>
        </exclusion>
        <exclusion>
            <groupId>org.springframework</groupId>
            <artifactId>spring-context</artifactId>
        </exclusion>
    </exclusions>
</dependency>

<!-- 显式声明需要的版本 -->
<dependency>
    <groupId>com.fasterxml.jackson.core</groupId>
    <artifactId>jackson-core</artifactId>
    <version>2.12.3</version>
</dependency>
```

#### 依赖分析工具

```bash
# Maven 依赖分析
mvn dependency:tree -Dverbose

# 查找冲突
mvn dependency:tree -Dverbose | grep -A 5 -B 5 "conflict"

# 分析特定依赖
mvn dependency:tree -Dincludes=com.yamibuy:*
```

## 缓存使用最佳实践

### 缓存策略设计

#### 分层缓存架构

```java
@Service
public class LayeredCacheService {
    
    // L1: 本地缓存（Caffeine）
    @Cacheable(value = "localCache", key = "#userId")
    public UserInfo getFromLocalCache(String userId) {
        return getFromRedisCache(userId);
    }
    
    // L2: 分布式缓存（Redis）
    @CacheableRedis(
        key = "user:info:%s", 
        params = "#userId", 
        expireTime = 3600
    )
    public UserInfo getFromRedisCache(String userId) {
        return getFromDatabase(userId);
    }
    
    // L3: 数据库
    public UserInfo getFromDatabase(String userId) {
        return userMapper.selectById(userId);
    }
}
```

#### 缓存更新策略

```java
@Service
public class CacheUpdateStrategy {
    
    // 策略1: Cache Aside（推荐）
    public void updateUserCacheAside(String userId, UserInfo userInfo) {
        // 1. 更新数据库
        userMapper.updateById(userId, userInfo);
        
        // 2. 删除缓存
        redisTemplate.delete("user:info:" + userId);
        
        // 3. 下次查询时重新加载
    }
    
    // 策略2: Write Through
    public void updateUserWriteThrough(String userId, UserInfo userInfo) {
        // 1. 更新数据库
        userMapper.updateById(userId, userInfo);
        
        // 2. 同时更新缓存
        redisTemplate.opsForValue().set("user:info:" + userId, userInfo, 3600, TimeUnit.SECONDS);
    }
    
    // 策略3: Write Behind（异步更新）
    @Async
    public void updateUserWriteBehind(String userId, UserInfo userInfo) {
        // 1. 立即更新缓存
        redisTemplate.opsForValue().set("user:info:" + userId, userInfo, 3600, TimeUnit.SECONDS);
        
        // 2. 异步更新数据库
        CompletableFuture.runAsync(() -> {
            userMapper.updateById(userId, userInfo);
        });
    }
}
```

### 缓存雪崩预防

```java
@Service
public class CacheAvalanchePrevention {
    
    // 随机过期时间
    @CacheableRedis(
        key = "hot:data:%s", 
        params = "#id", 
        expireTime = 3600  // 基础时间
    )
    public HotData getHotDataWithRandomExpire(String id) {
        HotData data = dataService.getById(id);
        
        // 添加随机过期时间（±10%）
        int randomExpire = 3600 + new Random().nextInt(720) - 360;
        redisTemplate.expire("hot:data:" + id, randomExpire, TimeUnit.SECONDS);
        
        return data;
    }
    
    // 互斥锁防止缓存击穿
    public HotData getHotDataWithMutex(String id) {
        String cacheKey = "hot:data:" + id;
        String lockKey = "lock:hot:data:" + id;
        
        // 1. 尝试从缓存获取
        HotData data = (HotData) redisTemplate.opsForValue().get(cacheKey);
        if (data != null) {
            return data;
        }
        
        // 2. 获取互斥锁
        boolean locked = redisLockClient.tryLock(lockKey, TimeUnit.SECONDS, 1, 10);
        if (!locked) {
            // 等待其他线程加载完成
            try {
                Thread.sleep(100);
                return getHotDataWithMutex(id); // 递归重试
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return null;
            }
        }
        
        try {
            // 3. 双重检查
            data = (HotData) redisTemplate.opsForValue().get(cacheKey);
            if (data != null) {
                return data;
            }
            
            // 4. 从数据库加载
            data = dataService.getById(id);
            
            // 5. 写入缓存
            if (data != null) {
                redisTemplate.opsForValue().set(cacheKey, data, 3600, TimeUnit.SECONDS);
            } else {
                // 缓存空值，防止缓存穿透
                redisTemplate.opsForValue().set(cacheKey, "NULL", 300, TimeUnit.SECONDS);
            }
            
            return data;
            
        } finally {
            redisLockClient.unlock(lockKey);
        }
    }
}
```

## 限流使用最佳实践

### 限流策略设计

#### 多层限流架构

```java
@Service
public class MultiLayerRateLimitService {
    
    public void checkMultiLayerLimit(String userId, String operation) {
        
        // 第一层：全局限流（保护系统整体）
        checkGlobalLimit();
        
        // 第二层：IP限流（防止单IP攻击）
        checkIpLimit();
        
        // 第三层：用户限流（防止单用户滥用）
        checkUserLimit(userId);
        
        // 第四层：操作限流（防止特定操作过频）
        checkOperationLimit(userId, operation);
    }
    
    private void checkGlobalLimit() {
        LimitParam param = LimitParam.builder()
            .times(100000)  // 全局每分钟10万次
            .section(Duration.ofMinutes(1))
            .errorCode("GLOBAL_RATE_LIMIT")
            .build();
        RequestLimitUtil.checkLimit(param, LimitOption.URI);
    }
    
    private void checkIpLimit() {
        LimitParam param = LimitParam.builder()
            .times(1000)    // 单IP每分钟1000次
            .section(Duration.ofMinutes(1))
            .errorCode("IP_RATE_LIMIT")
            .build();
        RequestLimitUtil.checkLimit(param, LimitOption.IP);
    }
    
    private void checkUserLimit(String userId) {
        UserLevel level = getUserLevel(userId);
        
        LimitParam param = LimitParam.builder()
            .times(level == UserLevel.VIP ? 500 : 100)  // VIP用户更高限制
            .section(Duration.ofMinutes(1))
            .errorCode("USER_RATE_LIMIT")
            .build();
        RequestLimitUtil.checkLimit(param, LimitOption.USER);
    }
    
    private void checkOperationLimit(String userId, String operation) {
        Map<String, Integer> operationLimits = Map.of(
            "LOGIN", 5,      // 登录每分钟5次
            "ORDER", 10,     // 下单每分钟10次
            "SEARCH", 100    // 搜索每分钟100次
        );
        
        int limit = operationLimits.getOrDefault(operation, 50);
        
        LimitParam param = LimitParam.builder()
            .times(limit)
            .section(Duration.ofMinutes(1))
            .errorCode("OPERATION_RATE_LIMIT")
            .build();
        RequestLimitUtil.checkLimit(param, LimitOption.USER, LimitOption.CUSTOM_BODY);
    }
}
```

#### 动态限流配置

```java
@Service
public class DynamicRateLimitService {
    
    @Value("${rate.limit.config.refresh.interval:60}")
    private int configRefreshInterval;
    
    private volatile Map<String, LimitConfig> limitConfigs = new ConcurrentHashMap<>();
    
    @Scheduled(fixedRateString = "${rate.limit.config.refresh.interval:60}000")
    public void refreshLimitConfig() {
        // 从配置中心或数据库加载最新限流配置
        Map<String, LimitConfig> newConfigs = loadLimitConfigFromSource();
        this.limitConfigs = newConfigs;
        
        log.info("限流配置已刷新，共{}个配置项", newConfigs.size());
    }
    
    public void checkDynamicLimit(String operation, String userId) {
        LimitConfig config = limitConfigs.get(operation);
        if (config == null) {
            return; // 无配置则不限流
        }
        
        LimitParam param = LimitParam.builder()
            .times(config.getTimes())
            .section(Duration.ofSeconds(config.getWindowSeconds()))
            .errorCode(config.getErrorCode())
            .build();
            
        RequestLimitUtil.checkLimit(param, config.getLimitOptions());
    }
    
    @Data
    public static class LimitConfig {
        private int times;
        private int windowSeconds;
        private String errorCode;
        private LimitOption[] limitOptions;
    }
}
```

## 分布式锁最佳实践

### 锁设计模式

#### 锁模板模式

```java
@Component
public class DistributedLockTemplate {
    
    @Autowired
    private RedisLockClient redisLockClient;
    
    /**
     * 执行带锁的操作
     */
    public <T> T executeWithLock(String lockKey, int waitSeconds, int leaseSeconds, 
                                Supplier<T> operation) {
        return executeWithLock(lockKey, waitSeconds, leaseSeconds, operation, null);
    }
    
    /**
     * 执行带锁的操作，支持失败回调
     */
    public <T> T executeWithLock(String lockKey, int waitSeconds, int leaseSeconds, 
                                Supplier<T> operation, Supplier<T> fallback) {
        boolean locked = redisLockClient.tryLock(lockKey, TimeUnit.SECONDS, waitSeconds, leaseSeconds);
        
        if (!locked) {
            if (fallback != null) {
                return fallback.get();
            }
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
    
    /**
     * 执行带锁的操作（无返回值）
     */
    public void executeWithLock(String lockKey, int waitSeconds, int leaseSeconds, 
                               Runnable operation) {
        executeWithLock(lockKey, waitSeconds, leaseSeconds, () -> {
            operation.run();
            return null;
        });
    }
}
```

#### 锁降级策略

```java
@Service
public class LockFallbackService {
    
    @Autowired
    private DistributedLockTemplate lockTemplate;
    
    public void processWithFallback(String resourceId) {
        String lockKey = "process:" + resourceId;
        
        // 尝试分布式锁，失败则降级到本地锁
        try {
            lockTemplate.executeWithLock(
                lockKey, 1, 30,  // 快速失败
                () -> processResource(resourceId),
                () -> processWithLocalLock(resourceId)  // 降级策略
            );
        } catch (Exception e) {
            log.warn("分布式锁失败，使用本地锁降级: {}", resourceId);
            processWithLocalLock(resourceId);
        }
    }
    
    private synchronized String processWithLocalLock(String resourceId) {
        // 本地锁处理（注意：只能保证单机互斥）
        return processResource(resourceId);
    }
}
```

## 批量任务最佳实践

### 任务拆分策略

```java
@Service
public class OptimizedBatchTaskService {
    
    /**
     * 智能任务拆分
     */
    public void processLargeDataset(List<String> dataIds) {
        int batchSize = calculateOptimalBatchSize(dataIds.size());
        
        // 将大任务拆分为多个小批次
        List<List<String>> batches = Lists.partition(dataIds, batchSize);
        
        BatchTask batchTask = BatchTask.init();
        
        for (int i = 0; i < batches.size(); i++) {
            final List<String> batch = batches.get(i);
            final int batchIndex = i;
            
            batchTask.addTask("batch-" + batchIndex, () -> {
                return processBatch(batch, batchIndex);
            });
        }
        
        // 执行所有批次
        batchTask.exec();
        
        // 收集结果
        List<BatchResult> results = new ArrayList<>();
        for (int i = 0; i < batches.size(); i++) {
            BatchResult result = batchTask.get("batch-" + i, false);
            if (result != null) {
                results.add(result);
            }
        }
        
        // 合并结果
        mergeResults(results);
    }
    
    private int calculateOptimalBatchSize(int totalSize) {
        // 根据数据量和系统资源计算最优批次大小
        int availableProcessors = Runtime.getRuntime().availableProcessors();
        int optimalBatchSize = Math.max(1, totalSize / (availableProcessors * 2));
        
        // 限制批次大小范围
        return Math.min(Math.max(optimalBatchSize, 10), 1000);
    }
}
```

### 异常处理和重试

```java
@Service
public class ResilientBatchTaskService {
    
    public void processWithRetry(List<String> dataIds) {
        BatchTask batchTask = BatchTask.init();
        
        for (String dataId : dataIds) {
            batchTask.addTask(dataId, () -> {
                return processWithRetry(dataId, 3); // 最多重试3次
            });
        }
        
        batchTask.exec();
        
        // 检查失败的任务
        List<String> failedTasks = new ArrayList<>();
        for (String dataId : dataIds) {
            try {
                Object result = batchTask.get(dataId, false);
                if (result == null) {
                    failedTasks.add(dataId);
                }
            } catch (Exception e) {
                failedTasks.add(dataId);
            }
        }
        
        // 处理失败的任务
        if (!failedTasks.isEmpty()) {
            handleFailedTasks(failedTasks);
        }
    }
    
    private Object processWithRetry(String dataId, int maxRetries) {
        Exception lastException = null;
        
        for (int attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return processData(dataId);
            } catch (Exception e) {
                lastException = e;
                log.warn("处理数据失败，第{}次重试: {}", attempt, dataId, e);
                
                if (attempt < maxRetries) {
                    // 指数退避
                    try {
                        Thread.sleep(1000 * (long) Math.pow(2, attempt - 1));
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            }
        }
        
        log.error("处理数据最终失败: {}", dataId, lastException);
        return null;
    }
}
```

## 性能优化最佳实践

### JVM 调优

```bash
# 生产环境 JVM 参数建议
-Xms4g -Xmx4g                          # 堆内存设置
-XX:+UseG1GC                           # 使用 G1 垃圾收集器
-XX:MaxGCPauseMillis=200               # GC 暂停时间目标
-XX:+HeapDumpOnOutOfMemoryError        # OOM 时生成堆转储
-XX:HeapDumpPath=/logs/heapdump/       # 堆转储文件路径
-XX:+PrintGCDetails                    # 打印 GC 详情
-XX:+PrintGCTimeStamps                 # 打印 GC 时间戳
-Xloggc:/logs/gc.log                   # GC 日志文件
-XX:+UseGCLogFileRotation              # GC 日志轮转
-XX:NumberOfGCLogFiles=5               # GC 日志文件数量
-XX:GCLogFileSize=100M                 # GC 日志文件大小
```

### 连接池优化

```properties
# Redis 连接池优化
spring.redis.jedis.pool.max-active=50
spring.redis.jedis.pool.max-idle=20
spring.redis.jedis.pool.min-idle=10
spring.redis.jedis.pool.max-wait=3000
spring.redis.timeout=3000

# 数据库连接池优化
spring.datasource.hikari.maximum-pool-size=20
spring.datasource.hikari.minimum-idle=5
spring.datasource.hikari.connection-timeout=30000
spring.datasource.hikari.idle-timeout=600000
spring.datasource.hikari.max-lifetime=1800000
spring.datasource.hikari.leak-detection-threshold=60000

# HTTP 连接池优化
http.pool.max-total=200
http.pool.default-max-per-route=50
http.pool.connection-timeout=5000
http.pool.socket-timeout=10000
```

### 监控和告警

```java
@Component
public class ToolkitMetrics {
    
    private final MeterRegistry meterRegistry;
    
    public ToolkitMetrics(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
        
        // 注册自定义指标
        registerCustomMetrics();
    }
    
    private void registerCustomMetrics() {
        // 缓存命中率
        Gauge.builder("cache.hit.rate")
            .description("Cache hit rate")
            .register(meterRegistry, this, ToolkitMetrics::calculateCacheHitRate);
        
        // 限流触发次数
        Counter.builder("rate.limit.triggered")
            .description("Rate limit triggered count")
            .register(meterRegistry);
        
        // 分布式锁使用情况
        Timer.builder("distributed.lock.duration")
            .description("Distributed lock hold duration")
            .register(meterRegistry);
    }
    
    private double calculateCacheHitRate(ToolkitMetrics metrics) {
        // 计算缓存命中率的逻辑
        return 0.95; // 示例值
    }
}
```

## 安全最佳实践

### 敏感信息保护

```java
@Service
public class SecureToolkitService {
    
    // 敏感操作限流
    public void sensitiveOperation(String userId, String operation) {
        // 更严格的限流策略
        LimitParam param = LimitParam.builder()
            .times(3)  // 每小时只允许3次
            .section(Duration.ofHours(1))
            .errorCode("SENSITIVE_OPERATION_LIMIT")
            .build();
            
        RequestLimitUtil.checkLimit(param, LimitOption.USER, LimitOption.IP);
        
        // 记录敏感操作日志
        auditLogger.logSensitiveOperation(userId, operation);
        
        // 执行操作
        performSensitiveOperation(userId, operation);
    }
    
    // 缓存Key加密
    @CacheableRedis(
        key = "secure:data:%s", 
        params = "T(com.yamibuy.util.SecurityUtil).hashUserId(#userId)", 
        expireTime = 1800
    )
    public SecureData getSecureData(String userId) {
        return secureDataService.getByUserId(userId);
    }
}
```

### 访问控制

```java
@Component
public class AccessControlInterceptor implements HandlerInterceptor {
    
    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        
        // 检查IP白名单
        if (!isIpAllowed(request.getRemoteAddr())) {
            response.setStatus(HttpStatus.FORBIDDEN.value());
            return false;
        }
        
        // 检查用户权限
        String token = request.getHeader("token");
        if (!hasPermission(token, request.getRequestURI())) {
            response.setStatus(HttpStatus.UNAUTHORIZED.value());
            return false;
        }
        
        return true;
    }
}
```

## 故障排查指南

### 常见问题诊断

```java
@Component
public class ToolkitDiagnostics {
    
    /**
     * 缓存问题诊断
     */
    public void diagnoseCacheIssues() {
        // 检查 Redis 连接
        try {
            redisTemplate.opsForValue().get("health:check");
            log.info("Redis 连接正常");
        } catch (Exception e) {
            log.error("Redis 连接异常", e);
        }
        
        // 检查缓存命中率
        double hitRate = calculateCacheHitRate();
        if (hitRate < 0.8) {
            log.warn("缓存命中率过低: {}", hitRate);
        }
        
        // 检查缓存大小
        long cacheSize = getCacheSize();
        if (cacheSize > 1000000) {
            log.warn("缓存数据量过大: {}", cacheSize);
        }
    }
    
    /**
     * 限流问题诊断
     */
    public void diagnoseRateLimitIssues() {
        // 检查限流配置
        validateRateLimitConfig();
        
        // 检查限流统计
        Map<String, Long> limitStats = getRateLimitStats();
        limitStats.forEach((key, count) -> {
            if (count > 1000) {
                log.warn("限流触发频繁: {} = {}", key, count);
            }
        });
    }
    
    /**
     * 分布式锁问题诊断
     */
    public void diagnoseLockIssues() {
        // 检查长时间持有的锁
        List<String> longHeldLocks = findLongHeldLocks();
        if (!longHeldLocks.isEmpty()) {
            log.warn("发现长时间持有的锁: {}", longHeldLocks);
        }
        
        // 检查锁竞争情况
        Map<String, Integer> lockContention = analyzeLockContention();
        lockContention.forEach((lockKey, contentionCount) -> {
            if (contentionCount > 100) {
                log.warn("锁竞争激烈: {} = {}", lockKey, contentionCount);
            }
        });
    }
}
```

### 健康检查

```java
@Component
public class ToolkitHealthIndicator implements HealthIndicator {
    
    @Override
    public Health health() {
        Health.Builder builder = Health.up();
        
        try {
            // 检查 Redis 健康状态
            checkRedisHealth(builder);
            
            // 检查工具包组件状态
            checkToolkitComponents(builder);
            
            return builder.build();
            
        } catch (Exception e) {
            return Health.down()
                .withDetail("error", e.getMessage())
                .build();
        }
    }
    
    private void checkRedisHealth(Health.Builder builder) {
        try {
            String pong = redisTemplate.getConnectionFactory()
                .getConnection()
                .ping();
            builder.withDetail("redis", "UP - " + pong);
        } catch (Exception e) {
            builder.withDetail("redis", "DOWN - " + e.getMessage());
        }
    }
    
    private void checkToolkitComponents(Health.Builder builder) {
        // 检查缓存组件
        builder.withDetail("cache", checkCacheComponent());
        
        // 检查限流组件
        builder.withDetail("rateLimit", checkRateLimitComponent());
        
        // 检查分布式锁组件
        builder.withDetail("distributedLock", checkDistributedLockComponent());
    }
}
```

## 总结

遵循这些最佳实践可以帮助你：

1. **提高系统稳定性**: 通过合理的配置和异常处理
2. **优化系统性能**: 通过缓存策略和连接池优化
3. **增强系统安全性**: 通过访问控制和敏感信息保护
4. **简化故障排查**: 通过监控指标和诊断工具
5. **降低维护成本**: 通过标准化的使用模式和配置

记住，工具包的使用要结合具体的业务场景，不要过度设计，保持简单有效的原则。