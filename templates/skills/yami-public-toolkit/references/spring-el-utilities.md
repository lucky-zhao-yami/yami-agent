# Spring EL 表达式工具使用指南

## 概述

SpringElUtil 是 Yami-Public 工具包中用于处理 Spring Expression Language (SpEL) 表达式的工具类。它主要用于动态解析方法参数、生成缓存键、条件判断等场景。该工具类在缓存注解、限流注解等功能中被广泛使用。

## 核心功能

### 1. SpEL 表达式解析
- 解析 Spring EL 表达式字符串
- 支持方法参数引用（#0, #1, #paramName）
- 支持复杂的表达式计算

### 2. 方法参数名获取
- 自动获取方法签名的参数名
- 支持编译时参数信息和运行时反射获取
- 处理代理类和动态字节码场景

### 3. 表达式上下文构建
- 构建 Spring 表达式上下文
- 设置参数变量和索引变量
- 支持复杂对象的属性访问

## 详细使用指南

### 基本使用方法

#### 1. 简单表达式解析

```java
@Service
public class ExpressionService {
    
    /**
     * 基本表达式解析示例
     */
    public void basicExpressionExample() {
        // 准备参数
        String[] paramNames = {"userId", "productId", "quantity"};
        Object[] args = {"12345", "P001", 2};
        
        // 解析简单表达式
        Object result1 = SpringElUtil.getValueByExpression("#userId", paramNames, args);
        System.out.println("用户ID: " + result1); // 输出: 12345
        
        // 解析索引表达式
        Object result2 = SpringElUtil.getValueByExpression("#0", paramNames, args);
        System.out.println("第一个参数: " + result2); // 输出: 12345
        
        // 解析计算表达式
        Object result3 = SpringElUtil.getValueByExpression("#quantity * 100", paramNames, args);
        System.out.println("数量*100: " + result3); // 输出: 200
    }
}
```

#### 2. 复杂对象属性访问

```java
@Service
public class ComplexExpressionService {
    
    /**
     * 复杂对象属性访问
     */
    public void complexObjectExample() {
        // 准备复杂对象参数
        UserInfo user = new UserInfo();
        user.setUserId("12345");
        user.setUserName("张三");
        user.setLevel("VIP");
        
        OrderInfo order = new OrderInfo();
        order.setOrderId("O001");
        order.setAmount(new BigDecimal("99.99"));
        
        String[] paramNames = {"user", "order"};
        Object[] args = {user, order};
        
        // 访问对象属性
        Object userId = SpringElUtil.getValueByExpression("#user.userId", paramNames, args);
        Object userName = SpringElUtil.getValueByExpression("#user.userName", paramNames, args);
        Object orderAmount = SpringElUtil.getValueByExpression("#order.amount", paramNames, args);
        
        System.out.println("用户ID: " + userId);     // 输出: 12345
        System.out.println("用户名: " + userName);   // 输出: 张三
        System.out.println("订单金额: " + orderAmount); // 输出: 99.99
        
        // 复杂表达式计算
        Object complexResult = SpringElUtil.getValueByExpression(
            "#user.level == 'VIP' ? #order.amount * 0.9 : #order.amount", 
            paramNames, args);
        System.out.println("VIP折扣后金额: " + complexResult); // 输出: 89.991
    }
}
```

### 在缓存注解中的应用

#### 1. 动态缓存键生成

```java
@Service
public class CacheService {
    
    /**
     * 使用 SpEL 表达式生成缓存键
     */
    @CacheableRedis(
        key = "user:profile:%s:%s", 
        params = "#userId,#includeDetail", 
        expireTime = 3600
    )
    public UserProfile getUserProfile(String userId, boolean includeDetail) {
        // 实际的业务逻辑
        return userService.loadUserProfile(userId, includeDetail);
    }
    
    /**
     * 复杂对象作为缓存键
     */
    @CacheableRedis(
        key = "product:search:%s:%s:%s", 
        params = "#request.keyword,#request.categoryId,#request.sortType", 
        expireTime = 1800
    )
    public SearchResult searchProducts(SearchRequest request) {
        return productSearchService.search(request);
    }
    
    /**
     * 条件表达式生成缓存键
     */
    @CacheableRedis(
        key = "order:summary:%s", 
        params = "#userId + ':' + (#includeHistory ? 'with_history' : 'current_only')", 
        expireTime = 600
    )
    public OrderSummary getOrderSummary(String userId, boolean includeHistory) {
        return orderService.getOrderSummary(userId, includeHistory);
    }
}
```

#### 2. 缓存注解的 AOP 实现

```java
@Aspect
@Component
public class CacheAspect {
    
    @Around("@annotation(cacheableRedis)")
    public Object handleCache(ProceedingJoinPoint joinPoint, CacheableRedis cacheableRedis) throws Throwable {
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        
        // 获取方法参数名
        String[] paramNames = SpringElUtil.getParameterNames(signature);
        Object[] args = joinPoint.getArgs();
        
        // 解析缓存键表达式
        String keyTemplate = cacheableRedis.key();
        String paramsExpression = cacheableRedis.params();
        
        // 生成实际的缓存键
        String cacheKey = generateCacheKey(keyTemplate, paramsExpression, paramNames, args);
        
        // 尝试从缓存获取
        Object cachedResult = getCachedValue(cacheKey);
        if (cachedResult != null) {
            return cachedResult;
        }
        
        // 执行原方法
        Object result = joinPoint.proceed();
        
        // 缓存结果
        cacheResult(cacheKey, result, cacheableRedis.expireTime());
        
        return result;
    }
    
    private String generateCacheKey(String keyTemplate, String paramsExpression, 
                                   String[] paramNames, Object[] args) {
        // 解析参数表达式
        Object paramValue = SpringElUtil.getValueByExpression(paramsExpression, paramNames, args);
        
        if (paramValue instanceof String) {
            return String.format(keyTemplate, paramValue);
        } else if (paramValue instanceof Object[]) {
            return String.format(keyTemplate, (Object[]) paramValue);
        } else {
            return String.format(keyTemplate, paramValue);
        }
    }
}
```

### 在限流注解中的应用

#### 1. 动态限流键生成

```java
@RestController
public class ApiController {
    
    /**
     * 基于用户ID的限流
     */
    @RequestLimit(
        times = 10, 
        section = Duration.ofMinutes(1),
        keyExpression = "#token"
    )
    public ResponseEntity<String> userSpecificApi(String token) {
        return ResponseEntity.ok("Success");
    }
    
    /**
     * 基于复杂条件的限流
     */
    @RequestLimit(
        times = 5, 
        section = Duration.ofMinutes(1),
        keyExpression = "#request.userId + ':' + #request.apiType"
    )
    public ResponseEntity<String> complexLimitApi(ApiRequest request) {
        return ResponseEntity.ok("Success");
    }
}

@Aspect
@Component
public class RequestLimitAspect {
    
    @Around("@annotation(requestLimit)")
    public Object handleRequestLimit(ProceedingJoinPoint joinPoint, RequestLimit requestLimit) throws Throwable {
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        String[] paramNames = SpringElUtil.getParameterNames(signature);
        Object[] args = joinPoint.getArgs();
        
        // 解析限流键表达式
        String keyExpression = requestLimit.keyExpression();
        Object keyValue = SpringElUtil.getValueByExpression(keyExpression, paramNames, args);
        String limitKey = "limit:" + keyValue;
        
        // 检查限流
        if (isRateLimited(limitKey, requestLimit.times(), requestLimit.section())) {
            throw new RateLimitException("请求过于频繁");
        }
        
        return joinPoint.proceed();
    }
}
```

### 高级应用场景

#### 1. 条件缓存

```java
@Service
public class ConditionalCacheService {
    
    /**
     * 根据条件决定是否缓存
     */
    @CacheableRedis(
        key = "conditional:data:%s", 
        params = "#dataId",
        condition = "#cacheEnabled && #dataType == 'IMPORTANT'",
        expireTime = 3600
    )
    public DataInfo getConditionalData(String dataId, String dataType, boolean cacheEnabled) {
        return dataService.loadData(dataId, dataType);
    }
    
    /**
     * 基于用户级别的不同缓存时间
     */
    @CacheableRedis(
        key = "user:data:%s", 
        params = "#userId",
        expireTime = "#{#userLevel == 'VIP' ? 7200 : 3600}"
    )
    public UserData getUserData(String userId, String userLevel) {
        return userDataService.loadUserData(userId);
    }
}
```

#### 2. 动态方法调用

```java
@Service
public class DynamicMethodService {
    
    /**
     * 根据表达式动态调用不同的处理方法
     */
    public Object processRequest(String requestType, Object data) {
        String[] paramNames = {"requestType", "data"};
        Object[] args = {requestType, data};
        
        // 根据请求类型动态选择处理方法
        String methodExpression = "#requestType == 'ORDER' ? 'processOrder' : " +
                                 "#requestType == 'PAYMENT' ? 'processPayment' : 'processDefault'";
        
        Object methodName = SpringElUtil.getValueByExpression(methodExpression, paramNames, args);
        
        // 使用反射调用对应方法
        try {
            Method method = this.getClass().getDeclaredMethod(methodName.toString(), Object.class);
            return method.invoke(this, data);
        } catch (Exception e) {
            log.error("动态方法调用失败", e);
            return processDefault(data);
        }
    }
    
    private Object processOrder(Object data) {
        return "处理订单: " + data;
    }
    
    private Object processPayment(Object data) {
        return "处理支付: " + data;
    }
    
    private Object processDefault(Object data) {
        return "默认处理: " + data;
    }
}
```

#### 3. 表达式配置化

```java
@Service
public class ConfigurableExpressionService {
    
    @Value("${business.cache.key.expression:user:default:%s}")
    private String cacheKeyExpression;
    
    @Value("${business.cache.condition.expression:#level == 'VIP'}")
    private String cacheConditionExpression;
    
    /**
     * 使用配置化的表达式
     */
    public Object getDataWithConfigurableCache(String userId, String level, Object data) {
        String[] paramNames = {"userId", "level", "data"};
        Object[] args = {userId, level, data};
        
        // 检查缓存条件
        Object conditionResult = SpringElUtil.getValueByExpression(
            cacheConditionExpression, paramNames, args);
        
        if (Boolean.TRUE.equals(conditionResult)) {
            // 生成缓存键
            Object keyValue = SpringElUtil.getValueByExpression(
                "#userId", paramNames, args);
            String cacheKey = String.format(cacheKeyExpression, keyValue);
            
            // 尝试从缓存获取
            Object cachedData = getCachedData(cacheKey);
            if (cachedData != null) {
                return cachedData;
            }
        }
        
        // 加载数据
        Object result = loadData(userId, data);
        
        // 缓存数据（如果满足条件）
        if (Boolean.TRUE.equals(conditionResult)) {
            Object keyValue = SpringElUtil.getValueByExpression(
                "#userId", paramNames, args);
            String cacheKey = String.format(cacheKeyExpression, keyValue);
            cacheData(cacheKey, result);
        }
        
        return result;
    }
}
```

### 工具类扩展

#### 1. 表达式验证工具

```java
@Component
public class ExpressionValidator {
    
    /**
     * 验证表达式语法是否正确
     */
    public boolean isValidExpression(String expression) {
        try {
            Expression expr = SpringElUtil.getExpression(expression);
            return expr != null;
        } catch (Exception e) {
            log.warn("表达式语法错误: {}", expression, e);
            return false;
        }
    }
    
    /**
     * 验证表达式在给定上下文中是否可执行
     */
    public boolean canExecuteExpression(String expression, String[] paramNames, Object[] args) {
        try {
            Object result = SpringElUtil.getValueByExpression(expression, paramNames, args);
            return true;
        } catch (Exception e) {
            log.warn("表达式执行失败: {}", expression, e);
            return false;
        }
    }
    
    /**
     * 获取表达式执行结果的类型
     */
    public Class<?> getExpressionResultType(String expression, String[] paramNames, Object[] args) {
        try {
            Object result = SpringElUtil.getValueByExpression(expression, paramNames, args);
            return result != null ? result.getClass() : Object.class;
        } catch (Exception e) {
            return Object.class;
        }
    }
}
```

#### 2. 表达式缓存优化

```java
@Component
public class CachedExpressionService {
    
    private final Map<String, Expression> expressionCache = new ConcurrentHashMap<>();
    
    /**
     * 带缓存的表达式解析
     */
    public Expression getCachedExpression(String expressionString) {
        return expressionCache.computeIfAbsent(expressionString, SpringElUtil::getExpression);
    }
    
    /**
     * 带缓存的表达式执行
     */
    public Object evaluateWithCache(String expressionString, String[] paramNames, Object[] args) {
        Expression expression = getCachedExpression(expressionString);
        if (expression == null) {
            return null;
        }
        
        try {
            // 构建上下文
            EvaluationContext context = new StandardEvaluationContext();
            for (int i = 0; i < args.length; i++) {
                if (paramNames != null && i < paramNames.length) {
                    context.setVariable(paramNames[i], args[i]);
                }
                context.setVariable("p" + i, args[i]);
            }
            
            return expression.getValue(context);
        } catch (Exception e) {
            log.warn("表达式执行失败: {}", expressionString, e);
            return null;
        }
    }
    
    /**
     * 清理表达式缓存
     */
    public void clearExpressionCache() {
        expressionCache.clear();
    }
}
```

## 性能优化建议

### 1. 表达式缓存

```java
@Configuration
public class ExpressionCacheConfig {
    
    @Bean
    public CacheManager expressionCacheManager() {
        CaffeineCacheManager cacheManager = new CaffeineCacheManager();
        cacheManager.setCaffeine(Caffeine.newBuilder()
            .maximumSize(1000)
            .expireAfterWrite(Duration.ofHours(1)));
        return cacheManager;
    }
}

@Service
public class OptimizedExpressionService {
    
    @Cacheable(value = "expressions", key = "#expression")
    public Expression parseExpression(String expression) {
        return SpringElUtil.getExpression(expression);
    }
    
    @Cacheable(value = "paramNames", key = "#method.toString()")
    public String[] getParameterNames(Method method) {
        return SpringElUtil.getParameterNames(
            (MethodSignature) () -> method);
    }
}
```

### 2. 批量表达式处理

```java
@Service
public class BatchExpressionService {
    
    /**
     * 批量处理表达式
     */
    public Map<String, Object> evaluateBatch(List<String> expressions, 
                                           String[] paramNames, Object[] args) {
        Map<String, Object> results = new HashMap<>();
        
        // 预构建上下文，避免重复创建
        EvaluationContext context = buildContext(paramNames, args);
        
        expressions.parallelStream().forEach(expr -> {
            try {
                Expression expression = SpringElUtil.getExpression(expr);
                if (expression != null) {
                    Object result = expression.getValue(context);
                    results.put(expr, result);
                }
            } catch (Exception e) {
                log.warn("批量表达式处理失败: {}", expr, e);
                results.put(expr, null);
            }
        });
        
        return results;
    }
    
    private EvaluationContext buildContext(String[] paramNames, Object[] args) {
        EvaluationContext context = new StandardEvaluationContext();
        for (int i = 0; i < args.length; i++) {
            if (paramNames != null && i < paramNames.length) {
                context.setVariable(paramNames[i], args[i]);
            }
            context.setVariable("p" + i, args[i]);
        }
        return context;
    }
}
```

## 最佳实践

### 1. 表达式安全性

```java
@Component
public class SecureExpressionService {
    
    private final Set<String> allowedMethods = Set.of(
        "toString", "equals", "hashCode", "length", "isEmpty"
    );
    
    /**
     * 安全的表达式执行
     */
    public Object safeEvaluate(String expression, String[] paramNames, Object[] args) {
        // 检查表达式是否包含危险操作
        if (containsDangerousOperations(expression)) {
            throw new SecurityException("表达式包含不安全的操作: " + expression);
        }
        
        return SpringElUtil.getValueByExpression(expression, paramNames, args);
    }
    
    private boolean containsDangerousOperations(String expression) {
        // 检查是否包含系统调用、文件操作等危险操作
        String[] dangerousPatterns = {
            "System.", "Runtime.", "Process", "File", "Class.forName"
        };
        
        for (String pattern : dangerousPatterns) {
            if (expression.contains(pattern)) {
                return true;
            }
        }
        
        return false;
    }
}
```

### 2. 错误处理和降级

```java
@Service
public class RobustExpressionService {
    
    /**
     * 带降级的表达式执行
     */
    public Object evaluateWithFallback(String expression, String[] paramNames, 
                                     Object[] args, Object fallbackValue) {
        try {
            Object result = SpringElUtil.getValueByExpression(expression, paramNames, args);
            return result != null ? result : fallbackValue;
        } catch (Exception e) {
            log.error("表达式执行失败，使用降级值: expression={}, fallback={}", 
                     expression, fallbackValue, e);
            return fallbackValue;
        }
    }
    
    /**
     * 带重试的表达式执行
     */
    @Retryable(value = {Exception.class}, maxAttempts = 3)
    public Object evaluateWithRetry(String expression, String[] paramNames, Object[] args) {
        return SpringElUtil.getValueByExpression(expression, paramNames, args);
    }
}
```

## 注意事项

### 1. 参数名获取
- 需要在 Maven 编译配置中添加 `-parameters` 参数
- 代理类可能无法直接获取参数名，需要使用反射
- 建议优先使用索引方式（#0, #1）引用参数

### 2. 表达式复杂度
- 避免过于复杂的表达式，影响性能和可读性
- 复杂逻辑建议在 Java 代码中实现
- 表达式中避免调用耗时的方法

### 3. 类型安全
- SpEL 表达式是动态执行的，注意类型转换
- 对于可能为 null 的对象，使用安全导航操作符（?.）
- 表达式结果类型可能与预期不符，需要适当的类型检查

### 4. 安全考虑
- 不要执行来自用户输入的表达式
- 限制表达式中可调用的方法和类
- 对表达式进行白名单验证

## 常见问题

### Q: 为什么获取不到方法参数名？
A: 需要在 Maven 编译插件中添加 `-parameters` 参数，或者使用索引方式（#0, #1）引用参数。

### Q: 表达式执行性能如何优化？
A: 可以缓存解析后的 Expression 对象，避免重复解析；对于批量处理，复用 EvaluationContext。

### Q: 如何处理表达式中的 null 值？
A: 使用安全导航操作符（?.）或在表达式中添加 null 检查，如：`#obj != null ? #obj.property : 'default'`。

### Q: 表达式中可以调用哪些方法？
A: 可以调用对象的公共方法，但出于安全考虑，建议限制可调用的方法范围，避免调用系统级方法。