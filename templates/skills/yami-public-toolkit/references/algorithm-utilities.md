# 算法工具类使用指南

## 概述

Yami-Public 工具包提供了多个算法工具类，用于解决常见的业务算法问题，包括排序算法、组合算法等。这些工具类经过生产环境验证，具有良好的性能和可扩展性。

## 核心算法工具

### 1. CommonAlgorithmUtil - 通用算法工具
- 优先级排序算法
- 集合操作优化
- 通用排序逻辑

### 2. ComboAlgorithmUtil - 组合算法工具
- 多列表组合算法
- 推荐系统算法
- 批量数据处理

## 详细使用指南

### CommonAlgorithmUtil 使用方法

#### 优先级排序算法

这个工具主要用于根据优先级ID列表对元素列表进行排序，常用于商品推荐、搜索结果排序等场景。

```java
@Service
public class ProductRecommendationService {
    
    /**
     * 根据运营配置的优先级对商品进行排序
     */
    public List<ProductInfo> sortProductsByPriority(List<ProductInfo> products, 
                                                   List<String> priorityProductIds) {
        // 使用优先级排序算法
        return CommonAlgorithmUtil.sortByPriority(
            products,                           // 原始商品列表
            priorityProductIds,                 // 优先级商品ID列表
            ProductInfo::getProductId          // 获取商品ID的函数
        );
    }
    
    /**
     * 分类排序示例
     */
    public List<CategoryInfo> sortCategoriesByPriority(List<CategoryInfo> categories,
                                                      List<Integer> priorityCategoryIds) {
        return CommonAlgorithmUtil.sortByPriority(
            categories,
            priorityCategoryIds,
            CategoryInfo::getCategoryId
        );
    }
    
    /**
     * 用户排序示例
     */
    public List<UserInfo> sortUsersByVipLevel(List<UserInfo> users, 
                                             List<String> vipLevels) {
        return CommonAlgorithmUtil.sortByPriority(
            users,
            vipLevels,
            UserInfo::getVipLevel
        );
    }
}
```

#### 实际业务场景应用

```java
@Service
public class SearchResultService {
    
    /**
     * 搜索结果排序 - 结合运营配置和算法排序
     */
    public SearchResultVO sortSearchResults(SearchRequest request) {
        // 1. 获取基础搜索结果
        List<ProductInfo> searchResults = searchService.search(request);
        
        // 2. 获取运营配置的优先级商品
        List<String> priorityProducts = operationConfigService
            .getPriorityProducts(request.getKeyword());
        
        // 3. 应用优先级排序
        List<ProductInfo> sortedResults = CommonAlgorithmUtil.sortByPriority(
            searchResults,
            priorityProducts,
            ProductInfo::getProductId
        );
        
        // 4. 构建返回结果
        SearchResultVO result = new SearchResultVO();
        result.setProducts(sortedResults);
        result.setTotal(sortedResults.size());
        
        return result;
    }
    
    /**
     * 首页推荐排序
     */
    public List<ProductInfo> getHomeRecommendations(String userId) {
        // 获取推荐算法结果
        List<ProductInfo> algorithmResults = recommendationEngine.getRecommendations(userId);
        
        // 获取运营手动配置的优先级商品
        List<String> manualPriorityProducts = operationConfigService
            .getHomePriorityProducts();
        
        // 合并排序：手动配置优先，算法结果其次
        return CommonAlgorithmUtil.sortByPriority(
            algorithmResults,
            manualPriorityProducts,
            ProductInfo::getProductId
        );
    }
}
```

### ComboAlgorithmUtil 使用方法

#### 基本概念

ComboAlgorithmUtil 用于处理多个列表的组合算法，支持两种组合模式：
- **INSERTION（穿插模式）**: 多个列表按批次大小穿插合并
- **ORDER（顺序模式）**: 多个列表按顺序依次合并

#### 1. 穿插组合模式

```java
@Service
public class ContentMixService {
    
    /**
     * 内容流穿插推荐
     * 将不同类型的内容按比例穿插展示
     */
    public List<ContentInfo> mixContentStream(String userId) {
        // 准备不同类型的内容列表
        List<ContentInfo> hotProducts = getHotProducts();      // 热门商品
        List<ContentInfo> personalRec = getPersonalRec(userId); // 个性化推荐
        List<ContentInfo> brandContent = getBrandContent();     // 品牌内容
        
        // 构建组合列表
        List<ComboArrayList<ContentInfo>> comboLists = Arrays.asList(
            new ComboArrayList<>(1, 3, hotProducts),      // 排序1，每批3个
            new ComboArrayList<>(2, 5, personalRec),      // 排序2，每批5个
            new ComboArrayList<>(3, 2, brandContent)      // 排序3，每批2个
        );
        
        // 执行穿插组合算法
        return ComboAlgorithmUtil.comboAlgorithm(
            comboLists,
            ComboType.INSERTION,    // 穿插模式
            50                      // 最多返回50个内容
        );
    }
    
    /**
     * 商品列表页穿插广告
     */
    public List<Object> mixProductsWithAds(List<ProductInfo> products, 
                                          List<AdInfo> ads) {
        // 转换为通用类型
        List<Object> productObjects = new ArrayList<>(products);
        List<Object> adObjects = new ArrayList<>(ads);
        
        List<ComboArrayList<Object>> comboLists = Arrays.asList(
            new ComboArrayList<>(1, 8, productObjects),   // 商品每批8个
            new ComboArrayList<>(2, 1, adObjects)         // 广告每批1个
        );
        
        return ComboAlgorithmUtil.comboAlgorithm(
            comboLists,
            ComboType.INSERTION,
            100
        );
    }
}
```

#### 2. 顺序组合模式

```java
@Service
public class RecommendationService {
    
    /**
     * 推荐结果顺序合并
     * 按优先级顺序展示不同推荐源的结果
     */
    public List<ProductInfo> getCombinedRecommendations(String userId) {
        // 获取不同推荐源的结果
        List<ProductInfo> userBased = getUserBasedRecommendations(userId);
        List<ProductInfo> itemBased = getItemBasedRecommendations(userId);
        List<ProductInfo> hotTrending = getHotTrendingProducts();
        List<ProductInfo> newArrivals = getNewArrivals();
        
        // 构建组合列表（按优先级排序）
        List<ComboArrayList<ProductInfo>> comboLists = Arrays.asList(
            new ComboArrayList<>(1, 10, userBased),    // 最高优先级，取10个
            new ComboArrayList<>(2, 8, itemBased),     // 次优先级，取8个
            new ComboArrayList<>(3, 5, hotTrending),   // 第三优先级，取5个
            new ComboArrayList<>(4, 3, newArrivals)    // 最低优先级，取3个
        );
        
        // 执行顺序组合算法
        return ComboAlgorithmUtil.comboAlgorithm(
            comboLists,
            ComboType.ORDER,        // 顺序模式
            30                      // 最多返回30个商品
        );
    }
    
    /**
     * 搜索结果多源合并
     */
    public List<ProductInfo> getCombinedSearchResults(String keyword) {
        // 不同搜索策略的结果
        List<ProductInfo> exactMatch = getExactMatchResults(keyword);
        List<ProductInfo> fuzzyMatch = getFuzzyMatchResults(keyword);
        List<ProductInfo> relatedProducts = getRelatedProducts(keyword);
        
        List<ComboArrayList<ProductInfo>> comboLists = Arrays.asList(
            new ComboArrayList<>(1, 15, exactMatch),      // 精确匹配优先
            new ComboArrayList<>(2, 10, fuzzyMatch),      // 模糊匹配其次
            new ComboArrayList<>(3, 5, relatedProducts)   // 相关商品最后
        );
        
        return ComboAlgorithmUtil.comboAlgorithm(
            comboLists,
            ComboType.ORDER,
            40
        );
    }
}
```

#### 3. ComboArrayList 构造方法

```java
public class ComboArrayListExample {
    
    public void demonstrateConstructors() {
        List<String> dataList = Arrays.asList("A", "B", "C", "D", "E");
        
        // 方式1：指定排序和批次大小，传入数据列表
        ComboArrayList<String> combo1 = new ComboArrayList<>(1, 3, dataList);
        
        // 方式2：先创建空列表，再添加数据
        ComboArrayList<String> combo2 = new ComboArrayList<>(2, 2);
        combo2.addAll(dataList);
        
        // 方式3：逐个添加数据
        ComboArrayList<String> combo3 = new ComboArrayList<>(3, 1);
        for (String item : dataList) {
            combo3.add(item);
        }
    }
}
```

## 高级应用场景

### 1. 电商首页内容编排

```java
@Service
public class HomePageService {
    
    /**
     * 首页内容智能编排
     * 结合用户画像、运营配置、算法推荐
     */
    public HomePageVO buildHomePage(String userId) {
        // 获取用户画像
        UserProfile profile = userProfileService.getUserProfile(userId);
        
        // 根据用户画像获取不同类型内容
        List<ProductInfo> personalizedProducts = getPersonalizedProducts(profile);
        List<ProductInfo> categoryHotProducts = getCategoryHotProducts(profile.getPreferredCategories());
        List<BrandInfo> recommendedBrands = getRecommendedBrands(profile);
        List<ActivityInfo> relevantActivities = getRelevantActivities(profile);
        
        // 运营配置的优先级内容
        List<String> priorityProductIds = operationConfigService.getHomePriorityProducts();
        List<String> priorityBrandIds = operationConfigService.getHomePriorityBrands();
        
        // 1. 先对各类内容进行优先级排序
        List<ProductInfo> sortedPersonalized = CommonAlgorithmUtil.sortByPriority(
            personalizedProducts, priorityProductIds, ProductInfo::getProductId);
        
        List<ProductInfo> sortedCategoryHot = CommonAlgorithmUtil.sortByPriority(
            categoryHotProducts, priorityProductIds, ProductInfo::getProductId);
        
        List<BrandInfo> sortedBrands = CommonAlgorithmUtil.sortByPriority(
            recommendedBrands, priorityBrandIds, BrandInfo::getBrandId);
        
        // 2. 构建混合内容流
        List<ComboArrayList<Object>> comboLists = Arrays.asList(
            new ComboArrayList<>(1, 6, new ArrayList<>(sortedPersonalized)),  // 个性化商品
            new ComboArrayList<>(2, 4, new ArrayList<>(sortedCategoryHot)),   // 分类热门
            new ComboArrayList<>(3, 2, new ArrayList<>(sortedBrands)),        // 推荐品牌
            new ComboArrayList<>(4, 1, new ArrayList<>(relevantActivities))   // 相关活动
        );
        
        List<Object> mixedContent = ComboAlgorithmUtil.comboAlgorithm(
            comboLists,
            ComboType.INSERTION,
            100
        );
        
        // 3. 构建首页VO
        HomePageVO homePage = new HomePageVO();
        homePage.setMixedContent(mixedContent);
        homePage.setUserId(userId);
        homePage.setGeneratedTime(System.currentTimeMillis());
        
        return homePage;
    }
}
```

### 2. 搜索结果智能排序

```java
@Service
public class SmartSearchService {
    
    /**
     * 智能搜索结果排序
     * 结合相关性、商业价值、用户偏好
     */
    public SearchResultVO smartSearch(SearchRequest request) {
        String keyword = request.getKeyword();
        String userId = request.getUserId();
        
        // 获取不同维度的搜索结果
        List<ProductInfo> relevanceResults = searchByRelevance(keyword);
        List<ProductInfo> commercialResults = searchByCommercialValue(keyword);
        List<ProductInfo> personalResults = searchByUserPreference(keyword, userId);
        
        // 获取运营配置的关键词优先商品
        List<String> keywordPriorityProducts = operationConfigService
            .getKeywordPriorityProducts(keyword);
        
        // 1. 对各维度结果进行优先级排序
        List<ProductInfo> sortedRelevance = CommonAlgorithmUtil.sortByPriority(
            relevanceResults, keywordPriorityProducts, ProductInfo::getProductId);
        
        List<ProductInfo> sortedCommercial = CommonAlgorithmUtil.sortByPriority(
            commercialResults, keywordPriorityProducts, ProductInfo::getProductId);
        
        List<ProductInfo> sortedPersonal = CommonAlgorithmUtil.sortByPriority(
            personalResults, keywordPriorityProducts, ProductInfo::getProductId);
        
        // 2. 根据搜索策略配置决定组合方式
        SearchStrategy strategy = getSearchStrategy(keyword, userId);
        
        List<ComboArrayList<ProductInfo>> comboLists;
        ComboType comboType;
        
        if (strategy == SearchStrategy.BALANCED) {
            // 平衡策略：穿插展示
            comboLists = Arrays.asList(
                new ComboArrayList<>(1, 3, sortedRelevance),
                new ComboArrayList<>(2, 2, sortedCommercial),
                new ComboArrayList<>(3, 1, sortedPersonal)
            );
            comboType = ComboType.INSERTION;
        } else {
            // 优先策略：按重要性顺序
            comboLists = Arrays.asList(
                new ComboArrayList<>(1, 10, sortedRelevance),
                new ComboArrayList<>(2, 5, sortedCommercial),
                new ComboArrayList<>(3, 3, sortedPersonal)
            );
            comboType = ComboType.ORDER;
        }
        
        // 3. 执行组合算法
        List<ProductInfo> finalResults = ComboAlgorithmUtil.comboAlgorithm(
            comboLists,
            comboType,
            request.getPageSize()
        );
        
        // 4. 构建搜索结果
        SearchResultVO result = new SearchResultVO();
        result.setProducts(finalResults);
        result.setKeyword(keyword);
        result.setStrategy(strategy.name());
        result.setTotal(finalResults.size());
        
        return result;
    }
}
```

## 性能优化建议

### 1. 大数据量处理

```java
@Service
public class LargeDataProcessingService {
    
    /**
     * 大数据量分批处理
     */
    public List<ProductInfo> processLargeDataset(List<ProductInfo> largeDataset,
                                               List<String> priorityIds) {
        // 分批处理，避免内存溢出
        int batchSize = 1000;
        List<ProductInfo> result = new ArrayList<>();
        
        for (int i = 0; i < largeDataset.size(); i += batchSize) {
            int endIndex = Math.min(i + batchSize, largeDataset.size());
            List<ProductInfo> batch = largeDataset.subList(i, endIndex);
            
            // 对每批数据进行排序
            List<ProductInfo> sortedBatch = CommonAlgorithmUtil.sortByPriority(
                batch, priorityIds, ProductInfo::getProductId);
            
            result.addAll(sortedBatch);
        }
        
        return result;
    }
    
    /**
     * 并行处理优化
     */
    public List<ProductInfo> parallelProcess(List<ProductInfo> dataset,
                                           List<String> priorityIds) {
        return dataset.parallelStream()
            .collect(Collectors.groupingBy(p -> p.getCategoryId()))
            .entrySet()
            .parallelStream()
            .map(entry -> CommonAlgorithmUtil.sortByPriority(
                entry.getValue(), priorityIds, ProductInfo::getProductId))
            .flatMap(List::stream)
            .collect(Collectors.toList());
    }
}
```

### 2. 缓存优化

```java
@Service
public class CachedAlgorithmService {
    
    @Autowired
    private RedisTemplate<String, String> redisTemplate;
    
    /**
     * 缓存排序结果
     */
    @CacheableRedis(key = "sorted:products:%s", params = "#categoryId", expireTime = 3600)
    public List<ProductInfo> getCachedSortedProducts(String categoryId) {
        List<ProductInfo> products = productService.getProductsByCategory(categoryId);
        List<String> priorityIds = operationConfigService.getCategoryPriorityProducts(categoryId);
        
        return CommonAlgorithmUtil.sortByPriority(
            products, priorityIds, ProductInfo::getProductId);
    }
    
    /**
     * 缓存组合结果
     */
    @CacheableRedis(key = "combo:recommendations:%s", params = "#userId", expireTime = 1800)
    public List<Object> getCachedComboRecommendations(String userId) {
        // 获取各类推荐数据
        List<ProductInfo> products = getPersonalizedProducts(userId);
        List<BrandInfo> brands = getRecommendedBrands(userId);
        List<ActivityInfo> activities = getRelevantActivities(userId);
        
        // 执行组合算法
        List<ComboArrayList<Object>> comboLists = Arrays.asList(
            new ComboArrayList<>(1, 5, new ArrayList<>(products)),
            new ComboArrayList<>(2, 2, new ArrayList<>(brands)),
            new ComboArrayList<>(3, 1, new ArrayList<>(activities))
        );
        
        return ComboAlgorithmUtil.comboAlgorithm(
            comboLists, ComboType.INSERTION, 50);
    }
}
```

## 最佳实践

### 1. 算法参数调优

```java
@Configuration
public class AlgorithmConfig {
    
    @Value("${algorithm.combo.max-try-count:100}")
    private int maxTryCount;
    
    @Value("${algorithm.combo.default-batch-size:5}")
    private int defaultBatchSize;
    
    /**
     * 根据业务场景调整参数
     */
    public ComboAlgorithmParams getOptimalParams(String scene) {
        switch (scene) {
            case "homepage":
                return new ComboAlgorithmParams(50, ComboType.INSERTION);
            case "search":
                return new ComboAlgorithmParams(40, ComboType.ORDER);
            case "recommendation":
                return new ComboAlgorithmParams(30, ComboType.INSERTION);
            default:
                return new ComboAlgorithmParams(20, ComboType.ORDER);
        }
    }
}
```

### 2. 监控和日志

```java
@Service
public class MonitoredAlgorithmService {
    
    public List<ProductInfo> sortWithMonitoring(List<ProductInfo> products,
                                               List<String> priorityIds,
                                               String scene) {
        long startTime = System.currentTimeMillis();
        
        try {
            List<ProductInfo> result = CommonAlgorithmUtil.sortByPriority(
                products, priorityIds, ProductInfo::getProductId);
            
            long duration = System.currentTimeMillis() - startTime;
            
            // 记录性能指标
            log.info("算法排序完成: scene={}, inputSize={}, outputSize={}, duration={}ms",
                scene, products.size(), result.size(), duration);
            
            // 发送监控指标
            metricsService.recordAlgorithmPerformance(scene, duration, products.size());
            
            return result;
            
        } catch (Exception e) {
            log.error("算法排序失败: scene={}, error={}", scene, e.getMessage(), e);
            
            // 发送告警
            alertService.sendAlgorithmAlert(scene, e.getMessage());
            
            // 返回原始列表作为降级
            return products;
        }
    }
}
```

## 注意事项

### 1. 内存管理
- 大数据量处理时注意内存使用，考虑分批处理
- ComboArrayList 会修改原始列表，注意数据安全
- 及时清理不需要的中间结果

### 2. 性能考虑
- 优先级列表过长时会影响性能，建议控制在合理范围内
- 组合算法的批次大小设置要合理，避免过多的循环
- 考虑使用缓存减少重复计算

### 3. 业务逻辑
- 排序算法会过滤掉 null 元素
- 组合算法有最大尝试次数限制，防止死循环
- 注意处理空列表和边界情况

### 4. 扩展性
- 算法工具类支持泛型，可以处理各种类型的数据
- 可以通过继承或组合的方式扩展新的算法
- 建议将算法参数配置化，便于调优