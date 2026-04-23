# AB测试工具使用指南

## 概述

ABTestService 是亚米网的AB测试工具，用于获取用户所属的实验分组，支持功能灰度发布和用户行为实验。该工具通过多种用户标识（token、设备ID、亚米ID）来确定用户的实验分组。

## 核心功能

### 1. 用户分组获取
- 支持多种用户标识方式
- 异常容错处理
- 灵活的实验配置
- 新老用户区分

### 2. 实验管理
- 实验代码标识
- 分组值返回
- 仅限新用户实验支持

## 使用方法

### 1. 基本用法

```java
@Autowired
private ABTestService abTestService;

public void handleUserRequest(String token, String deviceId, String yamiId) {
    // 获取用户的AB测试分组
    String abGroup = abTestService.getAbValue(
        token, 
        deviceId, 
        yamiId, 
        "new_checkout_flow", 
        false
    );
    
    if ("experimental".equals(abGroup)) {
        // 使用实验版本的功能
        handleExperimentalCheckout();
    } else {
        // 使用默认版本的功能
        handleDefaultCheckout();
    }
}
```

### 2. 仅限新用户实验

```java
public void newUserExperiment(String token, String deviceId, String yamiId) {
    // 只对新用户进行AB测试
    String abGroup = abTestService.getAbValue(
        token, 
        deviceId, 
        yamiId, 
        "new_user_onboarding", 
        true  // 仅限新用户
    );
    
    if ("version_b".equals(abGroup)) {
        showNewOnboardingFlow();
    } else {
        showDefaultOnboardingFlow();
    }
}
```

## 方法参数说明

### getAbValue 方法

```java
public String getAbValue(String token, String deviceId, String yamiId, String abExperimentCode, boolean onlyNonCustomer)
```

**参数说明：**
- `token`: 用户认证令牌
- `deviceId`: 设备唯一标识
- `yamiId`: 亚米用户ID
- `abExperimentCode`: AB实验代码标识
- `onlyNonCustomer`: 是否仅限新用户（true=仅新用户，false=所有用户）

**返回值：**
- 成功：返回用户所属的分组值（如 "control", "experimental", "version_a" 等）
- 失败或异常：返回空字符串 ""

## 实际应用场景

### 1. 功能灰度发布

```java
@Service
public class CheckoutService {
    
    @Autowired
    private ABTestService abTestService;
    
    public CheckoutResult processCheckout(CheckoutRequest request) {
        String abGroup = abTestService.getAbValue(
            request.getToken(),
            request.getDeviceId(),
            request.getYamiId(),
            "new_payment_flow",
            false
        );
        
        switch (abGroup) {
            case "new_flow":
                return processNewPaymentFlow(request);
            case "optimized_flow":
                return processOptimizedPaymentFlow(request);
            default:
                return processDefaultPaymentFlow(request);
        }
    }
}
```

### 2. UI界面实验

```java
@RestController
public class HomePageController {
    
    @Autowired
    private ABTestService abTestService;
    
    @GetMapping("/api/homepage/config")
    public HomePageConfig getHomePageConfig(
        @RequestHeader("token") String token,
        @RequestHeader("device-id") String deviceId,
        @RequestParam("yami_id") String yamiId) {
        
        String layoutVersion = abTestService.getAbValue(
            token, deviceId, yamiId, "homepage_layout", false
        );
        
        HomePageConfig config = new HomePageConfig();
        
        if ("grid_layout".equals(layoutVersion)) {
            config.setLayoutType("grid");
            config.setShowRecommendations(true);
        } else if ("list_layout".equals(layoutVersion)) {
            config.setLayoutType("list");
            config.setShowRecommendations(false);
        } else {
            // 默认布局
            config.setLayoutType("default");
            config.setShowRecommendations(true);
        }
        
        return config;
    }
}
```

### 3. 营销活动实验

```java
@Service
public class PromotionService {
    
    @Autowired
    private ABTestService abTestService;
    
    public PromotionInfo getPromotionForUser(String token, String deviceId, String yamiId) {
        String promotionGroup = abTestService.getAbValue(
            token, deviceId, yamiId, "holiday_promotion", false
        );
        
        PromotionInfo promotion = new PromotionInfo();
        
        switch (promotionGroup) {
            case "discount_20":
                promotion.setDiscountPercent(20);
                promotion.setPromotionText("限时8折优惠！");
                break;
            case "discount_15":
                promotion.setDiscountPercent(15);
                promotion.setPromotionText("特惠85折！");
                break;
            case "free_shipping":
                promotion.setFreeShipping(true);
                promotion.setPromotionText("免费包邮！");
                break;
            default:
                // 无特殊优惠
                promotion.setDiscountPercent(0);
                break;
        }
        
        return promotion;
    }
}
```

### 4. 新用户专属实验

```java
@Service
public class OnboardingService {
    
    @Autowired
    private ABTestService abTestService;
    
    public OnboardingFlow getOnboardingFlow(String token, String deviceId, String yamiId) {
        // 仅对新用户进行引导流程实验
        String flowVersion = abTestService.getAbValue(
            token, deviceId, yamiId, "onboarding_flow", true
        );
        
        OnboardingFlow flow = new OnboardingFlow();
        
        if ("simplified".equals(flowVersion)) {
            flow.setSteps(Arrays.asList("welcome", "preferences", "complete"));
            flow.setDuration("2分钟");
        } else if ("detailed".equals(flowVersion)) {
            flow.setSteps(Arrays.asList("welcome", "profile", "preferences", "tutorial", "complete"));
            flow.setDuration("5分钟");
        } else {
            // 默认流程
            flow.setSteps(Arrays.asList("welcome", "complete"));
            flow.setDuration("1分钟");
        }
        
        return flow;
    }
}
```

## 最佳实践

### 1. 异常处理和降级

```java
public String getAbValueSafely(String token, String deviceId, String yamiId, String experimentCode) {
    try {
        String abValue = abTestService.getAbValue(token, deviceId, yamiId, experimentCode, false);
        
        // 记录AB测试结果用于分析
        logABTestResult(yamiId, experimentCode, abValue);
        
        return abValue;
    } catch (Exception e) {
        log.error("AB测试获取失败，使用默认分组: experimentCode={}", experimentCode, e);
        return "control"; // 降级到控制组
    }
}
```

### 2. 缓存优化

```java
@Service
public class CachedABTestService {
    
    @Autowired
    private ABTestService abTestService;
    
    @Autowired
    private RedisTemplate<String, String> redisTemplate;
    
    public String getAbValueWithCache(String token, String deviceId, String yamiId, String experimentCode) {
        String cacheKey = String.format("ab_test:%s:%s", yamiId, experimentCode);
        
        // 先从缓存获取
        String cachedValue = redisTemplate.opsForValue().get(cacheKey);
        if (cachedValue != null) {
            return cachedValue;
        }
        
        // 缓存未命中，调用AB测试服务
        String abValue = abTestService.getAbValue(token, deviceId, yamiId, experimentCode, false);
        
        // 缓存结果（缓存1小时）
        if (!abValue.isEmpty()) {
            redisTemplate.opsForValue().set(cacheKey, abValue, Duration.ofHours(1));
        }
        
        return abValue;
    }
}
```

### 3. 批量获取

```java
public Map<String, String> getMultipleAbValues(String token, String deviceId, String yamiId, List<String> experimentCodes) {
    Map<String, String> results = new HashMap<>();
    
    for (String experimentCode : experimentCodes) {
        try {
            String abValue = abTestService.getAbValue(token, deviceId, yamiId, experimentCode, false);
            results.put(experimentCode, abValue);
        } catch (Exception e) {
            log.error("获取AB测试失败: experimentCode={}", experimentCode, e);
            results.put(experimentCode, ""); // 失败时返回空字符串
        }
    }
    
    return results;
}
```

### 4. 实验配置管理

```java
@Component
public class ABTestConfig {
    
    // 实验配置常量
    public static final String CHECKOUT_FLOW_EXPERIMENT = "new_checkout_flow";
    public static final String HOMEPAGE_LAYOUT_EXPERIMENT = "homepage_layout";
    public static final String PROMOTION_EXPERIMENT = "holiday_promotion";
    public static final String ONBOARDING_EXPERIMENT = "onboarding_flow";
    
    // 分组值常量
    public static final String CONTROL_GROUP = "control";
    public static final String EXPERIMENTAL_GROUP = "experimental";
    public static final String VERSION_A = "version_a";
    public static final String VERSION_B = "version_b";
    
    public boolean isExperimentalGroup(String abValue) {
        return EXPERIMENTAL_GROUP.equals(abValue) || VERSION_B.equals(abValue);
    }
}
```

## 注意事项

### 1. 用户标识优先级
- 优先使用 yamiId（已登录用户）
- 其次使用 deviceId（设备标识）
- 最后使用 token（临时标识）

### 2. 异常容错
- 服务异常时返回空字符串
- 建议在业务代码中提供降级方案
- 记录异常日志便于排查

### 3. 性能考虑
- AB测试调用有网络开销，考虑缓存
- 批量获取时注意超时设置
- 避免在高频接口中同步调用

### 4. 实验管理
- 实验代码要有明确的命名规范
- 及时清理过期的实验配置
- 记录实验结果用于数据分析

## 常见问题

### Q: 为什么返回空字符串？
A: 可能的原因：
1. 实验代码不存在或已过期
2. 用户不在实验范围内
3. 服务异常或网络问题
4. 用户标识无效

### Q: 如何处理AB测试失败？
A: 建议的处理方式：
1. 提供默认的降级逻辑
2. 记录失败日志
3. 监控失败率
4. 考虑本地缓存

### Q: onlyNonCustomer 参数如何使用？
A: 
- `true`: 仅对新用户进行实验
- `false`: 对所有用户进行实验
- 用于控制实验范围

### Q: 如何确保实验的一致性？
A: 
1. 使用稳定的用户标识（yamiId）
2. 实验期间保持配置不变
3. 考虑使用缓存保持分组稳定
4. 记录用户的实验历史