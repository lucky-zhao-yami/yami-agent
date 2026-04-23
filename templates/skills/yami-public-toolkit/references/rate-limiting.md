# 限流工具使用指南

## 概述

Yami-Public 提供了基于 Redis 的分布式限流工具 `RequestLimitUtil`，支持多维度限流策略，包括 IP、用户、URI、参数等维度的组合限流。

## 基本概念

### 限流维度 (LimitOption)

- **URI**: 基于请求路径限流
- **USER**: 基于用户ID限流  
- **IP**: 基于客户端IP限流
- **QUERY_PARAM**: 基于查询参数限流
- **CUSTOM_BODY**: 基于自定义请求体限流

### 限流算法

使用滑动窗口算法，基于 Redis 的 ZSET 数据结构实现：
- 时间窗口内的请求记录存储在 ZSET 中
- 定期清理过期的请求记录
- 实时统计当前窗口内的请求数量

## 基本使用

### 注解方式限流

```java
@RestController
public class ApiController {
    
    // 每分钟最多10次请求
    @RequestLimit(times = 10, section = Duration.ofMinutes(1))
    @GetMapping("/api/sensitive")
    public ResponseEntity<?> sensitiveApi() {
        return ResponseEntity.ok("success");
    }
    
    // 每秒最多5次请求
    @RequestLimit(times = 5, section = Duration.ofSeconds(1))
    @PostMapping("/api/high-frequency")
    public ResponseEntity<?> highFrequencyApi() {
        return ResponseEntity.ok("success");
    }
}
```

### 编程方式限流

```java
@Service
public class BusinessService {
    
    public void performOperation(String userId) {
        // 创建限流参数
        LimitParam limitParam = LimitParam.builder()
            .times(100)  // 限制次数
            .section(Duration.ofHours(1))  // 时间窗口1小时
            .refresh(false)  // 超限后不刷新计数
            .errorCode("RATE_LIMIT_EXCEEDED")  // 错误码
            .build();
        
        // 执行限流检查
        RequestLimitUtil.checkLimit(limitParam, LimitOption.USER);
        
        // 业务逻辑
        doBusinessLogic(userId);
    }
}
```

## 多维度限流

### 单维度限流

```java
// 基于IP限流
@RequestLimit(times = 100, section = Duration.ofMinutes(1))
@LimitBy(LimitOption.IP)
public ResponseEntity<?> ipLimitedApi() {
    return ResponseEntity.ok("success");
}

// 基于用户限流
@RequestLimit(times = 50, section = Duration.ofMinutes(1))
@LimitBy(LimitOption.USER)
public ResponseEntity<?> userLimitedApi() {
    return ResponseEntity.ok("success");
}

// 基于URI限流
@RequestLimit(times = 1000, section = Duration.ofMinutes(1))
@LimitBy(LimitOption.URI)
public ResponseEntity<?> uriLimitedApi() {
    return ResponseEntity.ok("success");
}
```

### 多维度组合限流

```java
// IP + 用户双重限流
RequestLimitUtil.checkLimit(
    limitParam, 
    LimitOption.IP, 
    LimitOption.USER
);

// URI + 查询参数限流
RequestLimitUtil.checkLimit(
    limitParam, 
    LimitOption.URI, 
    LimitOption.QUERY_PARAM
);

// 全维度限流
RequestLimitUtil.checkLimit(
    limitParam, 
    LimitOption.IP, 
    LimitOption.USER, 
    LimitOption.URI, 
    LimitOption.QUERY_PARAM
);
```

## 高级配置

### 自定义请求体限流

```java
@PostMapping("/api/custom-limit")
public ResponseEntity<?> customLimitApi(@RequestBody CustomRequest request) {
    
    // 创建自定义限流参数
    LimitParam limitParam = LimitParam.builder()
        .times(10)
        .section(Duration.ofMinutes(1))
        .body(request)  // 设置自定义请求体
        .build();
    
    // 基于自定义请求体限流
    RequestLimitUtil.checkLimit(limitParam, LimitOption.CUSTOM_BODY);
    
    return ResponseEntity.ok("success");
}
```

### 动态限流参数

```java
@Service
public class DynamicLimitService {
    
    public void dynamicLimit(String userId, String operation) {
        
        // 根据操作类型设置不同的限流参数
        LimitParam limitParam;
        switch (operation) {
            case "SENSITIVE":
                limitParam = LimitParam.builder()
                    .times(5)
                    .section(Duration.ofMinutes(1))
                    .build();
                break;
            case "NORMAL":
                limitParam = LimitParam.builder()
                    .times(100)
                    .section(Duration.ofMinutes(1))
                    .build();
                break;
            default:
                limitParam = LimitParam.builder()
                    .times(50)
                    .section(Duration.ofMinutes(1))
                    .build();
        }
        
        RequestLimitUtil.checkLimit(limitParam, LimitOption.USER);
    }
}
```

## 限流策略配置

### 基于用户等级的限流

```java
@Service
public class UserLevelLimitService {
    
    public void checkUserLimit(String userId) {
        UserLevel level = getUserLevel(userId);
        
        LimitParam limitParam;
        switch (level) {
            case VIP:
                limitParam = LimitParam.builder()
                    .times(1000)  // VIP用户更高限制
                    .section(Duration.ofHours(1))
                    .build();
                break;
            case PREMIUM:
                limitParam = LimitParam.builder()
                    .times(500)
                    .section(Duration.ofHours(1))
                    .build();
                break;
            case NORMAL:
            default:
                limitParam = LimitParam.builder()
                    .times(100)  // 普通用户较低限制
                    .section(Duration.ofHours(1))
                    .build();
        }
        
        RequestLimitUtil.checkLimit(limitParam, LimitOption.USER);
    }
}
```

### 基于时间段的限流

```java
@Service
public class TimeBoundLimitService {
    
    public void checkTimeBasedLimit(String userId) {
        LocalTime now = LocalTime.now();
        
        LimitParam limitParam;
        if (now.isAfter(LocalTime.of(9, 0)) && now.isBefore(LocalTime.of(18, 0))) {
            // 工作时间：更宽松的限制
            limitParam = LimitParam.builder()
                .times(200)
                .section(Duration.ofHours(1))
                .build();
        } else {
            // 非工作时间：更严格的限制
            limitParam = LimitParam.builder()
                .times(50)
                .section(Duration.ofHours(1))
                .build();
        }
        
        RequestLimitUtil.checkLimit(limitParam, LimitOption.USER);
    }
}
```

## 异常处理

### 限流异常捕获

```java
@RestController
public class LimitedController {
    
    @PostMapping("/api/limited")
    public ResponseEntity<?> limitedApi() {
        try {
            LimitParam limitParam = LimitParam.builder()
                .times(10)
                .section(Duration.ofMinutes(1))
                .errorCode("API_RATE_LIMIT")
                .build();
                
            RequestLimitUtil.checkLimit(limitParam, LimitOption.IP);
            
            // 业务逻辑
            return ResponseEntity.ok("success");
            
        } catch (RequestLimitException e) {
            // 处理限流异常
            RequestLimitResponse response = e.getResponse();
            
            return ResponseEntity.status(429)
                .body(Map.of(
                    "error", "Rate limit exceeded",
                    "conditions", response.getConditions(),
                    "current", response.getCurrent(),
                    "limit", response.getLimit(),
                    "windowSeconds", response.getWindowSeconds()
                ));
        }
    }
}
```

### 全局异常处理

```java
@ControllerAdvice
public class GlobalExceptionHandler {
    
    @ExceptionHandler(RequestLimitException.class)
    public ResponseEntity<?> handleRateLimit(RequestLimitException e) {
        RequestLimitResponse response = e.getResponse();
        
        Map<String, Object> errorResponse = Map.of(
            "messageId", "RATE_LIMIT_EXCEEDED",
            "message", "请求过于频繁，请稍后再试",
            "details", Map.of(
                "conditions", response.getConditions(),
                "current", response.getCurrent(),
                "limit", response.getLimit(),
                "retryAfter", response.getWindowSeconds()
            )
        );
        
        return ResponseEntity.status(429).body(errorResponse);
    }
}
```

## 监控和统计

### 限流统计

```java
@Component
public class RateLimitMetrics {
    
    private final MeterRegistry meterRegistry;
    private final Counter rateLimitCounter;
    
    public RateLimitMetrics(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
        this.rateLimitCounter = Counter.builder("rate.limit.exceeded")
            .description("Rate limit exceeded count")
            .register(meterRegistry);
    }
    
    @EventListener
    public void handleRateLimitException(RequestLimitException e) {
        rateLimitCounter.increment(
            Tags.of(
                "conditions", e.getResponse().getConditions(),
                "endpoint", getCurrentEndpoint()
            )
        );
    }
}
```

### 限流日志记录

```java
@Component
public class RateLimitLogger {
    
    private static final Logger log = LoggerFactory.getLogger(RateLimitLogger.class);
    
    @EventListener
    public void logRateLimit(RequestLimitException e) {
        RequestLimitResponse response = e.getResponse();
        
        log.warn("Rate limit exceeded - Conditions: {}, Current: {}/{}, Window: {}s", 
            response.getConditions(),
            response.getCurrent(),
            response.getLimit(),
            response.getWindowSeconds()
        );
    }
}
```

## 性能优化

### Redis 连接优化

```properties
# Redis 连接池配置
spring.redis.jedis.pool.max-active=50
spring.redis.jedis.pool.max-idle=20
spring.redis.jedis.pool.min-idle=10
spring.redis.timeout=3000

# 限流专用 Redis 配置
rate.limit.redis.database=1
rate.limit.redis.key.prefix=rate_limit
```

### 批量清理过期数据

```java
@Component
public class RateLimitCleaner {
    
    @Scheduled(fixedRate = 300000) // 每5分钟执行一次
    public void cleanExpiredData() {
        // 清理过期的限流数据
        String pattern = "rate_limit:*";
        Set<String> keys = redisTemplate.keys(pattern);
        
        for (String key : keys) {
            // 清理过期的 ZSET 成员
            long now = System.currentTimeMillis();
            long expiredBefore = now - TimeUnit.HOURS.toMillis(1); // 1小时前
            
            redisTemplate.opsForZSet().removeRangeByScore(key, 0, expiredBefore);
        }
    }
}
```

## 最佳实践

### 1. 合理设置限流参数

```java
// 根据业务特性设置限流参数
public class RateLimitConfig {
    
    // 登录接口：防暴力破解
    public static final LimitParam LOGIN_LIMIT = LimitParam.builder()
        .times(5)  // 5次
        .section(Duration.ofMinutes(15))  // 15分钟
        .build();
    
    // 搜索接口：防恶意搜索
    public static final LimitParam SEARCH_LIMIT = LimitParam.builder()
        .times(100)  // 100次
        .section(Duration.ofMinutes(1))  // 1分钟
        .build();
    
    // 下单接口：防重复下单
    public static final LimitParam ORDER_LIMIT = LimitParam.builder()
        .times(10)  // 10次
        .section(Duration.ofMinutes(1))  // 1分钟
        .build();
}
```

### 2. 分层限流策略

```java
@Service
public class LayeredRateLimitService {
    
    public void checkLayeredLimit(String userId, String operation) {
        
        // 第一层：全局限流
        RequestLimitUtil.checkLimit(
            LimitParam.builder().times(10000).section(Duration.ofMinutes(1)).build(),
            LimitOption.URI
        );
        
        // 第二层：IP限流
        RequestLimitUtil.checkLimit(
            LimitParam.builder().times(1000).section(Duration.ofMinutes(1)).build(),
            LimitOption.IP
        );
        
        // 第三层：用户限流
        RequestLimitUtil.checkLimit(
            LimitParam.builder().times(100).section(Duration.ofMinutes(1)).build(),
            LimitOption.USER
        );
    }
}
```

### 3. 白名单机制

```java
@Service
public class WhitelistRateLimitService {
    
    @Value("${rate.limit.whitelist:}")
    private Set<String> whitelist;
    
    public void checkWithWhitelist(String userId) {
        // 检查白名单
        if (whitelist.contains(userId)) {
            return; // 白名单用户跳过限流
        }
        
        // 普通用户执行限流
        LimitParam limitParam = LimitParam.builder()
            .times(100)
            .section(Duration.ofMinutes(1))
            .build();
            
        RequestLimitUtil.checkLimit(limitParam, LimitOption.USER);
    }
}
```

### 4. 渐进式限流

```java
@Service
public class ProgressiveRateLimitService {
    
    public void checkProgressiveLimit(String userId) {
        
        // 短期限流：每分钟
        try {
            RequestLimitUtil.checkLimit(
                LimitParam.builder().times(60).section(Duration.ofMinutes(1)).build(),
                LimitOption.USER
            );
        } catch (RequestLimitException e) {
            throw new BusinessException("请求过于频繁，请稍后再试");
        }
        
        // 中期限流：每小时
        try {
            RequestLimitUtil.checkLimit(
                LimitParam.builder().times(1000).section(Duration.ofHours(1)).build(),
                LimitOption.USER
            );
        } catch (RequestLimitException e) {
            throw new BusinessException("您今日的请求次数已达上限");
        }
        
        // 长期限流：每天
        try {
            RequestLimitUtil.checkLimit(
                LimitParam.builder().times(5000).section(Duration.ofDays(1)).build(),
                LimitOption.USER
            );
        } catch (RequestLimitException e) {
            throw new BusinessException("您今日的请求次数已达上限，请明天再试");
        }
    }
}
```

## 注意事项

1. **Redis 性能**: 限流会增加 Redis 负载，注意监控性能
2. **时钟同步**: 分布式环境下确保服务器时钟同步
3. **异常处理**: 合理处理限流异常，提供友好的用户提示
4. **参数调优**: 根据实际业务场景调整限流参数
5. **监控告警**: 建立限流监控和告警机制
6. **降级策略**: 在 Redis 不可用时的降级处理方案