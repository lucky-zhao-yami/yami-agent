# Segment 用户画像服务使用指南

## 概述

SegmentService 是 Yami-Public 工具包中用于获取用户画像标签的服务，通过调用 Persona 服务获取用户的各种标签信息，如购买历史、浏览行为、用户偏好等。这些标签数据可用于个性化推荐、精准营销、用户分析等场景。

## 核心功能

### 1. 用户标签查询
- 根据用户 token 和标签类型获取用户画像数据
- 支持多种标签类型的查询
- 自动处理 token 解析和用户 ID 提取
- 提供类型安全的标签数据转换

### 2. 标签类型系统
- 基于 SegmentTagType 的类型安全设计
- 支持自定义标签转换逻辑
- 内置常用标签枚举定义

## 详细使用指南

### 基本使用方法

#### 1. 服务注入

```java
@Service
public class UserRecommendationService {
    
    @Autowired
    private SegmentService segmentService;
    
    // 业务逻辑实现
}
```

#### 2. 查询用户标签

```java
@Service
public class UserProfileService {
    
    @Autowired
    private SegmentService segmentService;
    
    /**
     * 获取用户购买历史标签
     */
    public PurchaseHistoryTag getUserPurchaseHistory(String token) {
        // 定义标签类型
        SegmentTagType<PurchaseHistoryTag> tagType = new SegmentTagType<PurchaseHistoryTag>() {
            @Override
            public SegmentTagEnum getSegmentTagEnum() {
                return SegmentTagEnum.PURCHASE_HISTORY;
            }
            
            @Override
            public SegmentConvert<PurchaseHistoryTag> getSegmentConvert() {
                return tagJson -> {
                    if (StringUtils.isEmpty(tagJson)) {
                        return null;
                    }
                    return JacksonUtil.parseObject(tagJson, PurchaseHistoryTag.class);
                };
            }
        };
        
        // 查询标签数据
        return segmentService.queryTagByUserIdAndTagId(token, tagType);
    }
    
    /**
     * 获取用户浏览行为标签
     */
    public BrowsingBehaviorTag getUserBrowsingBehavior(String token) {
        SegmentTagType<BrowsingBehaviorTag> tagType = new SegmentTagType<BrowsingBehaviorTag>() {
            @Override
            public SegmentTagEnum getSegmentTagEnum() {
                return SegmentTagEnum.BROWSING_BEHAVIOR;
            }
            
            @Override
            public SegmentConvert<BrowsingBehaviorTag> getSegmentConvert() {
                return tagJson -> JacksonUtil.parseObject(tagJson, BrowsingBehaviorTag.class);
            }
        };
        
        return segmentService.queryTagByUserIdAndTagId(token, tagType);
    }
}
```

### 高级使用场景

#### 1. 个性化推荐系统

```java
@Service
public class PersonalizedRecommendationService {
    
    @Autowired
    private SegmentService segmentService;
    
    /**
     * 基于用户画像生成个性化推荐
     */
    public List<ProductInfo> getPersonalizedRecommendations(String token, int limit) {
        // 获取用户购买历史
        PurchaseHistoryTag purchaseHistory = getUserPurchaseHistory(token);
        
        // 获取用户浏览行为
        BrowsingBehaviorTag browsingBehavior = getUserBrowsingBehavior(token);
        
        // 获取用户偏好标签
        UserPreferenceTag preferences = getUserPreferences(token);
        
        // 基于画像数据生成推荐
        RecommendationContext context = RecommendationContext.builder()
            .purchaseHistory(purchaseHistory)
            .browsingBehavior(browsingBehavior)
            .preferences(preferences)
            .limit(limit)
            .build();
        
        return recommendationEngine.generateRecommendations(context);
    }
    
    /**
     * 获取用户偏好标签
     */
    private UserPreferenceTag getUserPreferences(String token) {
        SegmentTagType<UserPreferenceTag> tagType = new SegmentTagType<UserPreferenceTag>() {
            @Override
            public SegmentTagEnum getSegmentTagEnum() {
                return SegmentTagEnum.USER_PREFERENCE;
            }
            
            @Override
            public SegmentConvert<UserPreferenceTag> getSegmentConvert() {
                return tagJson -> {
                    if (StringUtils.isEmpty(tagJson)) {
                        return new UserPreferenceTag(); // 返回默认偏好
                    }
                    return JacksonUtil.parseObject(tagJson, UserPreferenceTag.class);
                };
            }
        };
        
        return segmentService.queryTagByUserIdAndTagId(token, tagType);
    }
}
```

#### 2. 精准营销活动

```java
@Service
public class MarketingCampaignService {
    
    @Autowired
    private SegmentService segmentService;
    
    /**
     * 根据用户画像推送精准营销活动
     */
    public List<CampaignInfo> getTargetedCampaigns(String token) {
        // 获取用户消费能力标签
        ConsumptionCapacityTag consumptionCapacity = getConsumptionCapacity(token);
        
        // 获取用户品类偏好
        CategoryPreferenceTag categoryPreference = getCategoryPreference(token);
        
        // 获取用户生命周期阶段
        LifecycleStageTag lifecycleStage = getLifecycleStage(token);
        
        // 根据画像匹配合适的营销活动
        CampaignMatchingRequest request = CampaignMatchingRequest.builder()
            .consumptionLevel(consumptionCapacity.getLevel())
            .preferredCategories(categoryPreference.getTopCategories())
            .lifecycleStage(lifecycleStage.getStage())
            .build();
        
        return campaignMatchingService.matchCampaigns(request);
    }
    
    private ConsumptionCapacityTag getConsumptionCapacity(String token) {
        SegmentTagType<ConsumptionCapacityTag> tagType = new SegmentTagType<ConsumptionCapacityTag>() {
            @Override
            public SegmentTagEnum getSegmentTagEnum() {
                return SegmentTagEnum.CONSUMPTION_CAPACITY;
            }
            
            @Override
            public SegmentConvert<ConsumptionCapacityTag> getSegmentConvert() {
                return tagJson -> {
                    ConsumptionCapacityTag tag = JacksonUtil.parseObject(tagJson, ConsumptionCapacityTag.class);
                    return tag != null ? tag : ConsumptionCapacityTag.defaultTag();
                };
            }
        };
        
        return segmentService.queryTagByUserIdAndTagId(token, tagType);
    }
    
    private CategoryPreferenceTag getCategoryPreference(String token) {
        SegmentTagType<CategoryPreferenceTag> tagType = new SegmentTagType<CategoryPreferenceTag>() {
            @Override
            public SegmentTagEnum getSegmentTagEnum() {
                return SegmentTagEnum.CATEGORY_PREFERENCE;
            }
            
            @Override
            public SegmentConvert<CategoryPreferenceTag> getSegmentConvert() {
                return tagJson -> JacksonUtil.parseObject(tagJson, CategoryPreferenceTag.class);
            }
        };
        
        return segmentService.queryTagByUserIdAndTagId(token, tagType);
    }
    
    private LifecycleStageTag getLifecycleStage(String token) {
        SegmentTagType<LifecycleStageTag> tagType = new SegmentTagType<LifecycleStageTag>() {
            @Override
            public SegmentTagEnum getSegmentTagEnum() {
                return SegmentTagEnum.LIFECYCLE_STAGE;
            }
            
            @Override
            public SegmentConvert<LifecycleStageTag> getSegmentConvert() {
                return tagJson -> JacksonUtil.parseObject(tagJson, LifecycleStageTag.class);
            }
        };
        
        return segmentService.queryTagByUserIdAndTagId(token, tagType);
    }
}
```

#### 3. 用户分析和报表

```java
@Service
public class UserAnalyticsService {
    
    @Autowired
    private SegmentService segmentService;
    
    /**
     * 生成用户画像分析报告
     */
    public UserProfileReport generateUserProfileReport(String token) {
        UserProfileReport report = new UserProfileReport();
        
        // 获取各类用户标签
        PurchaseHistoryTag purchaseHistory = getUserPurchaseHistory(token);
        BrowsingBehaviorTag browsingBehavior = getUserBrowsingBehavior(token);
        UserPreferenceTag preferences = getUserPreferences(token);
        ConsumptionCapacityTag consumptionCapacity = getConsumptionCapacity(token);
        
        // 构建分析报告
        report.setPurchaseAnalysis(analyzePurchaseHistory(purchaseHistory));
        report.setBehaviorAnalysis(analyzeBrowsingBehavior(browsingBehavior));
        report.setPreferenceAnalysis(analyzePreferences(preferences));
        report.setConsumptionAnalysis(analyzeConsumptionCapacity(consumptionCapacity));
        
        // 生成用户价值评分
        report.setUserValueScore(calculateUserValueScore(
            purchaseHistory, browsingBehavior, preferences, consumptionCapacity));
        
        return report;
    }
    
    /**
     * 批量获取用户画像数据
     */
    public Map<String, UserProfileSummary> batchGetUserProfiles(List<String> tokens) {
        Map<String, UserProfileSummary> profiles = new HashMap<>();
        
        // 并行处理提高效率
        tokens.parallelStream().forEach(token -> {
            try {
                UserProfileSummary summary = getUserProfileSummary(token);
                profiles.put(token, summary);
            } catch (Exception e) {
                log.error("获取用户画像失败: token={}", token, e);
                profiles.put(token, UserProfileSummary.empty());
            }
        });
        
        return profiles;
    }
    
    private UserProfileSummary getUserProfileSummary(String token) {
        // 并行获取多个标签
        CompletableFuture<PurchaseHistoryTag> purchaseFuture = CompletableFuture
            .supplyAsync(() -> getUserPurchaseHistory(token));
        
        CompletableFuture<BrowsingBehaviorTag> browsingFuture = CompletableFuture
            .supplyAsync(() -> getUserBrowsingBehavior(token));
        
        CompletableFuture<UserPreferenceTag> preferenceFuture = CompletableFuture
            .supplyAsync(() -> getUserPreferences(token));
        
        // 等待所有标签获取完成
        CompletableFuture.allOf(purchaseFuture, browsingFuture, preferenceFuture).join();
        
        // 构建摘要
        return UserProfileSummary.builder()
            .purchaseHistory(purchaseFuture.join())
            .browsingBehavior(browsingFuture.join())
            .preferences(preferenceFuture.join())
            .build();
    }
}
```

### 标签类型定义

#### 1. 常用标签枚举

```java
public enum SegmentTagEnum {
    PURCHASE_HISTORY(1001, "购买历史"),
    BROWSING_BEHAVIOR(1002, "浏览行为"),
    USER_PREFERENCE(1003, "用户偏好"),
    CONSUMPTION_CAPACITY(1004, "消费能力"),
    CATEGORY_PREFERENCE(1005, "品类偏好"),
    LIFECYCLE_STAGE(1006, "生命周期阶段"),
    DEVICE_PREFERENCE(1007, "设备偏好"),
    TIME_PREFERENCE(1008, "时间偏好"),
    PRICE_SENSITIVITY(1009, "价格敏感度"),
    BRAND_LOYALTY(1010, "品牌忠诚度");
    
    private final int tag;
    private final String description;
    
    SegmentTagEnum(int tag, String description) {
        this.tag = tag;
        this.description = description;
    }
    
    public int getTag() {
        return tag;
    }
    
    public String getDescription() {
        return description;
    }
}
```

#### 2. 标签数据模型

```java
/**
 * 购买历史标签
 */
@Data
public class PurchaseHistoryTag {
    private List<CategoryPurchase> categoryPurchases;
    private BigDecimal totalAmount;
    private Integer orderCount;
    private Long lastPurchaseTime;
    private List<String> frequentBrands;
    private BigDecimal averageOrderValue;
}

/**
 * 浏览行为标签
 */
@Data
public class BrowsingBehaviorTag {
    private List<CategoryBrowsing> categoryBrowsings;
    private Integer pageViews;
    private Long totalBrowsingTime;
    private List<String> searchKeywords;
    private List<String> viewedProducts;
    private Double bounceRate;
}

/**
 * 用户偏好标签
 */
@Data
public class UserPreferenceTag {
    private List<String> preferredCategories;
    private List<String> preferredBrands;
    private PriceRange preferredPriceRange;
    private List<String> preferredFeatures;
    private String shoppingStyle; // 冲动型、理性型、比价型等
}

/**
 * 消费能力标签
 */
@Data
public class ConsumptionCapacityTag {
    private String level; // HIGH, MEDIUM, LOW
    private BigDecimal monthlyBudget;
    private BigDecimal averageOrderValue;
    private String paymentPreference;
    
    public static ConsumptionCapacityTag defaultTag() {
        ConsumptionCapacityTag tag = new ConsumptionCapacityTag();
        tag.setLevel("MEDIUM");
        tag.setMonthlyBudget(BigDecimal.valueOf(500));
        tag.setAverageOrderValue(BigDecimal.valueOf(50));
        tag.setPaymentPreference("CREDIT_CARD");
        return tag;
    }
}
```

### 工具类封装

#### 1. 标签类型工厂

```java
@Component
public class SegmentTagTypeFactory {
    
    /**
     * 创建购买历史标签类型
     */
    public SegmentTagType<PurchaseHistoryTag> createPurchaseHistoryTagType() {
        return new SegmentTagType<PurchaseHistoryTag>() {
            @Override
            public SegmentTagEnum getSegmentTagEnum() {
                return SegmentTagEnum.PURCHASE_HISTORY;
            }
            
            @Override
            public SegmentConvert<PurchaseHistoryTag> getSegmentConvert() {
                return tagJson -> JacksonUtil.parseObject(tagJson, PurchaseHistoryTag.class);
            }
        };
    }
    
    /**
     * 创建浏览行为标签类型
     */
    public SegmentTagType<BrowsingBehaviorTag> createBrowsingBehaviorTagType() {
        return new SegmentTagType<BrowsingBehaviorTag>() {
            @Override
            public SegmentTagEnum getSegmentTagEnum() {
                return SegmentTagEnum.BROWSING_BEHAVIOR;
            }
            
            @Override
            public SegmentConvert<BrowsingBehaviorTag> getSegmentConvert() {
                return tagJson -> JacksonUtil.parseObject(tagJson, BrowsingBehaviorTag.class);
            }
        };
    }
    
    /**
     * 通用标签类型创建方法
     */
    public <T> SegmentTagType<T> createTagType(SegmentTagEnum tagEnum, Class<T> tagClass) {
        return new SegmentTagType<T>() {
            @Override
            public SegmentTagEnum getSegmentTagEnum() {
                return tagEnum;
            }
            
            @Override
            public SegmentConvert<T> getSegmentConvert() {
                return tagJson -> {
                    if (StringUtils.isEmpty(tagJson)) {
                        return null;
                    }
                    return JacksonUtil.parseObject(tagJson, tagClass);
                };
            }
        };
    }
}
```

#### 2. 用户画像服务封装

```java
@Service
public class UserProfileService {
    
    @Autowired
    private SegmentService segmentService;
    
    @Autowired
    private SegmentTagTypeFactory tagTypeFactory;
    
    /**
     * 获取完整用户画像
     */
    public CompleteUserProfile getCompleteUserProfile(String token) {
        CompleteUserProfile profile = new CompleteUserProfile();
        
        // 获取各类标签
        profile.setPurchaseHistory(segmentService.queryTagByUserIdAndTagId(
            token, tagTypeFactory.createPurchaseHistoryTagType()));
        
        profile.setBrowsingBehavior(segmentService.queryTagByUserIdAndTagId(
            token, tagTypeFactory.createBrowsingBehaviorTagType()));
        
        profile.setPreferences(segmentService.queryTagByUserIdAndTagId(
            token, tagTypeFactory.createTagType(SegmentTagEnum.USER_PREFERENCE, UserPreferenceTag.class)));
        
        profile.setConsumptionCapacity(segmentService.queryTagByUserIdAndTagId(
            token, tagTypeFactory.createTagType(SegmentTagEnum.CONSUMPTION_CAPACITY, ConsumptionCapacityTag.class)));
        
        return profile;
    }
    
    /**
     * 检查用户是否匹配特定条件
     */
    public boolean isUserMatchCondition(String token, UserCondition condition) {
        switch (condition.getType()) {
            case PURCHASE_AMOUNT:
                PurchaseHistoryTag purchaseHistory = segmentService.queryTagByUserIdAndTagId(
                    token, tagTypeFactory.createPurchaseHistoryTagType());
                return purchaseHistory != null && 
                       purchaseHistory.getTotalAmount().compareTo(condition.getMinAmount()) >= 0;
                       
            case CATEGORY_PREFERENCE:
                UserPreferenceTag preferences = segmentService.queryTagByUserIdAndTagId(
                    token, tagTypeFactory.createTagType(SegmentTagEnum.USER_PREFERENCE, UserPreferenceTag.class));
                return preferences != null && 
                       preferences.getPreferredCategories().contains(condition.getCategoryId());
                       
            case CONSUMPTION_LEVEL:
                ConsumptionCapacityTag capacity = segmentService.queryTagByUserIdAndTagId(
                    token, tagTypeFactory.createTagType(SegmentTagEnum.CONSUMPTION_CAPACITY, ConsumptionCapacityTag.class));
                return capacity != null && 
                       condition.getConsumptionLevel().equals(capacity.getLevel());
                       
            default:
                return false;
        }
    }
}
```

## 性能优化

### 1. 缓存策略

```java
@Service
public class CachedSegmentService {
    
    @Autowired
    private SegmentService segmentService;
    
    @Autowired
    private RedisTemplate<String, String> redisTemplate;
    
    /**
     * 带缓存的标签查询
     */
    @CacheableRedis(key = "segment:tag:%s:%s", params = "#userId,#tagEnum.tag", expireTime = 1800)
    public <T> T getCachedUserTag(String userId, SegmentTagEnum tagEnum, Class<T> tagClass) {
        // 构建 token（实际应用中需要从用户ID构建有效token）
        String token = tokenService.buildTokenByUserId(userId);
        
        SegmentTagType<T> tagType = new SegmentTagType<T>() {
            @Override
            public SegmentTagEnum getSegmentTagEnum() {
                return tagEnum;
            }
            
            @Override
            public SegmentConvert<T> getSegmentConvert() {
                return tagJson -> JacksonUtil.parseObject(tagJson, tagClass);
            }
        };
        
        return segmentService.queryTagByUserIdAndTagId(token, tagType);
    }
    
    /**
     * 批量预热缓存
     */
    public void warmupUserTagsCache(List<String> userIds, List<SegmentTagEnum> tagEnums) {
        userIds.parallelStream().forEach(userId -> {
            tagEnums.forEach(tagEnum -> {
                try {
                    // 预热各种标签缓存
                    switch (tagEnum) {
                        case PURCHASE_HISTORY:
                            getCachedUserTag(userId, tagEnum, PurchaseHistoryTag.class);
                            break;
                        case BROWSING_BEHAVIOR:
                            getCachedUserTag(userId, tagEnum, BrowsingBehaviorTag.class);
                            break;
                        case USER_PREFERENCE:
                            getCachedUserTag(userId, tagEnum, UserPreferenceTag.class);
                            break;
                        // 其他标签类型...
                    }
                } catch (Exception e) {
                    log.error("预热用户标签缓存失败: userId={}, tagEnum={}", userId, tagEnum, e);
                }
            });
        });
    }
}
```

### 2. 异步处理

```java
@Service
public class AsyncSegmentService {
    
    @Autowired
    private SegmentService segmentService;
    
    @Async("segmentTaskExecutor")
    public CompletableFuture<PurchaseHistoryTag> getPurchaseHistoryAsync(String token) {
        SegmentTagType<PurchaseHistoryTag> tagType = createPurchaseHistoryTagType();
        PurchaseHistoryTag result = segmentService.queryTagByUserIdAndTagId(token, tagType);
        return CompletableFuture.completedFuture(result);
    }
    
    @Async("segmentTaskExecutor")
    public CompletableFuture<BrowsingBehaviorTag> getBrowsingBehaviorAsync(String token) {
        SegmentTagType<BrowsingBehaviorTag> tagType = createBrowsingBehaviorTagType();
        BrowsingBehaviorTag result = segmentService.queryTagByUserIdAndTagId(token, tagType);
        return CompletableFuture.completedFuture(result);
    }
    
    /**
     * 并行获取多个标签
     */
    public CompleteUserProfile getCompleteProfileAsync(String token) {
        CompletableFuture<PurchaseHistoryTag> purchaseFuture = getPurchaseHistoryAsync(token);
        CompletableFuture<BrowsingBehaviorTag> browsingFuture = getBrowsingBehaviorAsync(token);
        
        // 等待所有异步任务完成
        CompletableFuture.allOf(purchaseFuture, browsingFuture).join();
        
        CompleteUserProfile profile = new CompleteUserProfile();
        profile.setPurchaseHistory(purchaseFuture.join());
        profile.setBrowsingBehavior(browsingFuture.join());
        
        return profile;
    }
}
```

## 最佳实践

### 1. 异常处理

```java
@Service
public class RobustSegmentService {
    
    @Autowired
    private SegmentService segmentService;
    
    /**
     * 安全的标签查询，带降级处理
     */
    public <T> T safeQueryUserTag(String token, SegmentTagType<T> tagType, T defaultValue) {
        try {
            T result = segmentService.queryTagByUserIdAndTagId(token, tagType);
            return result != null ? result : defaultValue;
        } catch (Exception e) {
            log.error("查询用户标签失败: tagEnum={}", tagType.getSegmentTagEnum(), e);
            return defaultValue;
        }
    }
    
    /**
     * 带重试的标签查询
     */
    @Retryable(value = {Exception.class}, maxAttempts = 3, backoff = @Backoff(delay = 1000))
    public <T> T queryUserTagWithRetry(String token, SegmentTagType<T> tagType) {
        return segmentService.queryTagByUserIdAndTagId(token, tagType);
    }
}
```

### 2. 监控和日志

```java
@Service
public class MonitoredSegmentService {
    
    @Autowired
    private SegmentService segmentService;
    
    @Autowired
    private MeterRegistry meterRegistry;
    
    public <T> T queryUserTagWithMonitoring(String token, SegmentTagType<T> tagType) {
        Timer.Sample sample = Timer.start(meterRegistry);
        String tagName = tagType.getSegmentTagEnum().name();
        
        try {
            T result = segmentService.queryTagByUserIdAndTagId(token, tagType);
            
            // 记录成功指标
            meterRegistry.counter("segment.query.success", "tag", tagName).increment();
            
            if (result != null) {
                meterRegistry.counter("segment.query.hit", "tag", tagName).increment();
            } else {
                meterRegistry.counter("segment.query.miss", "tag", tagName).increment();
            }
            
            return result;
            
        } catch (Exception e) {
            // 记录失败指标
            meterRegistry.counter("segment.query.error", "tag", tagName).increment();
            throw e;
            
        } finally {
            // 记录耗时
            sample.stop(Timer.builder("segment.query.duration")
                .tag("tag", tagName)
                .register(meterRegistry));
        }
    }
}
```

## 注意事项

### 1. Token 有效性
- 确保传入的 token 是有效的用户 token
- Token 过期或无效时会导致查询失败
- 建议在调用前验证 token 的有效性

### 2. 标签数据格式
- 不同标签的 JSON 格式可能不同，需要正确定义转换逻辑
- 空值处理要考虑业务场景，决定是返回 null 还是默认值
- 标签数据可能包含敏感信息，注意数据安全

### 3. 性能考虑
- 标签查询涉及网络调用，建议使用缓存
- 批量查询时考虑并行处理提高效率
- 避免在高频接口中同步调用多个标签查询

### 4. 错误处理
- 网络异常、服务不可用等情况需要有降级方案
- 标签数据解析失败时要有合理的默认处理
- 记录详细的错误日志便于问题排查

## 常见问题

### Q: 如何处理标签数据为空的情况？
A: 可以在 SegmentConvert 中定义默认值逻辑，或者在业务层判断 null 值并提供默认行为。

### Q: 标签查询性能如何优化？
A: 建议使用 Redis 缓存标签数据，设置合理的过期时间；对于批量查询，使用异步并行处理。

### Q: 如何扩展新的标签类型？
A: 在 SegmentTagEnum 中添加新的枚举值，定义对应的数据模型类，然后创建相应的 SegmentTagType 实现。

### Q: 标签数据的时效性如何保证？
A: 标签数据由 Persona 服务维护，通常有定时更新机制。如需实时性较高的数据，可以考虑缩短缓存时间或使用事件驱动更新。