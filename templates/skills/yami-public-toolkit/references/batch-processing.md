# 批量任务处理工具使用指南

## 概述

BatchTask 是亚米网的并行任务执行框架，提供了简单易用的并行处理能力。该工具支持线程池管理、异常处理、上下文传递，特别适用于需要并行执行多个独立任务的场景。

## 核心功能

### 1. 并行任务执行
- 支持 Supplier 和 Runnable 任务
- 自动线程池管理
- 任务结果收集
- 异常隔离处理

### 2. 上下文传递
- MDC 日志上下文传递
- Spring RequestAttributes 传递
- 线程安全的上下文管理

### 3. 性能监控
- 线程池状态监控
- 任务执行时间统计
- 资源使用预警

## 使用方法

### 1. 基本用法 - Supplier 任务

```java
// 创建并行任务
BatchTask batchTask = BatchTask.create(
    () -> userService.getUserInfo(userId),
    () -> orderService.getOrderList(userId),
    () -> pointService.getPointBalance(userId)
);

// 执行任务
batchTask.exec();

// 获取结果
UserInfo userInfo = batchTask.get(0);
List<Order> orders = batchTask.get(1);
Integer points = batchTask.get(2);
```

### 2. 基本用法 - Runnable 任务

```java
// 创建并行任务
BatchTask batchTask = BatchTask.create(
    () -> cacheService.refreshUserCache(userId),
    () -> logService.recordUserActivity(userId),
    () -> notificationService.sendWelcomeMessage(userId)
);

// 执行任务
batchTask.exec();

// Runnable 任务没有返回值，但可以检查执行状态
```

### 3. 命名任务

```java
BatchTask batchTask = BatchTask.init()
    .addTask("getUserInfo", () -> userService.getUserInfo(userId))
    .addTask("getOrders", () -> orderService.getOrderList(userId))
    .addTask("getPoints", () -> pointService.getPointBalance(userId))
    .exec();

// 通过名称获取结果
UserInfo userInfo = batchTask.get("getUserInfo");
List<Order> orders = batchTask.get("getOrders");
Integer points = batchTask.get("getPoints");
```

### 4. 混合任务类型

```java
BatchTask batchTask = BatchTask.init()
    .addTask("userInfo", () -> userService.getUserInfo(userId))
    .addTask("refreshCache", () -> cacheService.refreshUserCache(userId))
    .addTask("orderCount", () -> orderService.getOrderCount(userId))
    .exec();

// 获取有返回值的任务结果
UserInfo userInfo = batchTask.get("userInfo");
Integer orderCount = batchTask.get("orderCount");
// refreshCache 是 Runnable，没有返回值
```

## 实际应用场景

### 1. 用户信息聚合

```java
@Service
public class UserProfileService {
    
    public UserProfileVO getUserProfile(String userId) {
        BatchTask batchTask = BatchTask.init()
            .addTask("basicInfo", () -> userService.getBasicInfo(userId))
            .addTask("preferences", () -> userService.getPreferences(userId))
            .addTask("addresses", () -> addressService.getUserAddresses(userId))
            .addTask("paymentMethods", () -> paymentService.getPaymentMethods(userId))
            .addTask("orderStats", () -> orderService.getOrderStatistics(userId))
            .exec();
        
        UserProfileVO profile = new UserProfileVO();
        profile.setBasicInfo(batchTask.get("basicInfo"));
        profile.setPreferences(batchTask.get("preferences"));
        profile.setAddresses(batchTask.get("addresses"));
        profile.setPaymentMethods(batchTask.get("paymentMethods"));
        profile.setOrderStats(batchTask.get("orderStats"));
        
        return profile;
    }
}
```

### 2. 订单详情页面数据

```java
@Service
public class OrderDetailService {
    
    public OrderDetailVO getOrderDetail(String orderId) {
        BatchTask batchTask = BatchTask.init()
            .addTask("orderInfo", () -> orderService.getOrderInfo(orderId))
            .addTask("orderItems", () -> orderService.getOrderItems(orderId))
            .addTask("logistics", () -> logisticsService.getLogisticsInfo(orderId))
            .addTask("payment", () -> paymentService.getPaymentInfo(orderId))
            .addTask("refund", () -> refundService.getRefundInfo(orderId))
            .exec();
        
        OrderDetailVO detail = new OrderDetailVO();
        detail.setOrderInfo(batchTask.get("orderInfo"));
        detail.setOrderItems(batchTask.get("orderItems"));
        detail.setLogistics(batchTask.get("logistics"));
        detail.setPayment(batchTask.get("payment"));
        detail.setRefund(batchTask.get("refund"));
        
        return detail;
    }
}
```

### 3. 数据预热和缓存刷新

```java
@Service
public class CacheWarmupService {
    
    public void warmupUserData(String userId) {
        BatchTask.create(
            () -> cacheService.preloadUserInfo(userId),
            () -> cacheService.preloadUserOrders(userId),
            () -> cacheService.preloadUserPreferences(userId),
            () -> cacheService.preloadRecommendations(userId)
        ).exec();
        
        log.info("用户数据预热完成: {}", userId);
    }
    
    public void refreshAllCaches() {
        BatchTask.create(
            () -> cacheService.refreshProductCache(),
            () -> cacheService.refreshCategoryCache(),
            () -> cacheService.refreshPromotionCache(),
            () -> cacheService.refreshConfigCache()
        ).exec();
        
        log.info("所有缓存刷新完成");
    }
}
```

### 4. 批量数据处理

```java
@Service
public class DataProcessingService {
    
    public ProcessResult processUserBatch(List<String> userIds) {
        List<Supplier<UserProcessResult>> tasks = userIds.stream()
            .map(userId -> (Supplier<UserProcessResult>) () -> processUser(userId))
            .collect(Collectors.toList());
        
        BatchTask batchTask = BatchTask.init();
        for (int i = 0; i < tasks.size(); i++) {
            batchTask.addTask("user_" + i, tasks.get(i));
        }
        
        batchTask.exec();
        
        // 收集所有结果
        List<UserProcessResult> results = batchTask.getAll();
        
        return ProcessResult.builder()
            .totalCount(userIds.size())
            .successCount((int) results.stream().filter(Objects::nonNull).count())
            .results(results)
            .build();
    }
    
    private UserProcessResult processUser(String userId) {
        // 具体的用户处理逻辑
        return userProcessor.process(userId);
    }
}
```

## 高级用法

### 1. 异常处理

```java
public class SafeBatchTaskService {
    
    public UserDataVO getUserDataSafely(String userId) {
        BatchTask batchTask = BatchTask.init()
            .addTask("userInfo", () -> {
                try {
                    return userService.getUserInfo(userId);
                } catch (Exception e) {
                    log.error("获取用户信息失败: {}", userId, e);
                    return null; // 返回默认值
                }
            })
            .addTask("orders", () -> orderService.getOrderList(userId))
            .exec();
        
        UserDataVO data = new UserDataVO();
        
        // 使用 false 参数避免异常抛出
        UserInfo userInfo = batchTask.get("userInfo", false);
        List<Order> orders = batchTask.get("orders", false);
        
        data.setUserInfo(userInfo != null ? userInfo : getDefaultUserInfo());
        data.setOrders(orders != null ? orders : Collections.emptyList());
        
        return data;
    }
}
```

### 2. 条件任务执行

```java
public UserDashboardVO getUserDashboard(String userId, boolean includeRecommendations) {
    BatchTask batchTask = BatchTask.init()
        .addTask("userInfo", () -> userService.getUserInfo(userId))
        .addTask("recentOrders", () -> orderService.getRecentOrders(userId));
    
    // 条件性添加任务
    if (includeRecommendations) {
        batchTask.addTask("recommendations", () -> recommendationService.getRecommendations(userId));
    }
    
    batchTask.exec();
    
    UserDashboardVO dashboard = new UserDashboardVO();
    dashboard.setUserInfo(batchTask.get("userInfo"));
    dashboard.setRecentOrders(batchTask.get("recentOrders"));
    
    if (batchTask.containTask("recommendations")) {
        dashboard.setRecommendations(batchTask.get("recommendations"));
    }
    
    return dashboard;
}
```

### 3. 任务依赖处理

```java
public class DependentTaskService {
    
    public OrderProcessResult processOrder(String orderId) {
        // 第一批：获取基础数据
        BatchTask basicDataTask = BatchTask.init()
            .addTask("orderInfo", () -> orderService.getOrderInfo(orderId))
            .addTask("userInfo", () -> userService.getUserInfo(getUserIdFromOrder(orderId)))
            .exec();
        
        OrderInfo orderInfo = basicDataTask.get("orderInfo");
        UserInfo userInfo = basicDataTask.get("userInfo");
        
        // 第二批：基于基础数据的处理
        BatchTask processingTask = BatchTask.init()
            .addTask("inventory", () -> inventoryService.checkInventory(orderInfo.getItems()))
            .addTask("pricing", () -> pricingService.calculatePrice(orderInfo, userInfo))
            .addTask("shipping", () -> shippingService.calculateShipping(orderInfo, userInfo))
            .exec();
        
        return OrderProcessResult.builder()
            .orderInfo(orderInfo)
            .userInfo(userInfo)
            .inventoryResult(processingTask.get("inventory"))
            .pricingResult(processingTask.get("pricing"))
            .shippingResult(processingTask.get("shipping"))
            .build();
    }
}
```

## 最佳实践

### 1. 任务粒度控制

```java
// 好的做法：任务粒度适中
BatchTask.create(
    () -> userService.getUserInfo(userId),           // 单个用户信息
    () -> orderService.getRecentOrders(userId, 10),  // 最近10个订单
    () -> pointService.getPointBalance(userId)       // 积分余额
).exec();

// 避免：任务粒度过细
BatchTask.create(
    () -> userService.getUserName(userId),
    () -> userService.getUserEmail(userId),
    () -> userService.getUserPhone(userId)
    // 这些应该合并为一个 getUserInfo 调用
).exec();
```

### 2. 异常隔离

```java
public class RobustBatchService {
    
    public DashboardData getDashboardData(String userId) {
        BatchTask batchTask = BatchTask.init()
            .addTask("essentialData", () -> getEssentialData(userId))  // 必需数据
            .addTask("optionalData1", () -> getOptionalData1(userId))  // 可选数据1
            .addTask("optionalData2", () -> getOptionalData2(userId))  // 可选数据2
            .exec();
        
        DashboardData data = new DashboardData();
        
        // 必需数据，异常时抛出
        data.setEssentialData(batchTask.get("essentialData", true));
        
        // 可选数据，异常时使用默认值
        data.setOptionalData1(batchTask.get("optionalData1", false));
        data.setOptionalData2(batchTask.get("optionalData2", false));
        
        return data;
    }
}
```

### 3. 性能监控

```java
@Component
public class BatchTaskMonitor {
    
    public <T> T executeBatchWithMonitoring(String businessType, Supplier<T> batchExecution) {
        long startTime = System.currentTimeMillis();
        
        try {
            T result = batchExecution.get();
            long duration = System.currentTimeMillis() - startTime;
            
            // 记录性能指标
            recordMetrics(businessType, duration, true);
            
            if (duration > 5000) { // 超过5秒预警
                log.warn("批量任务执行时间过长: businessType={}, duration={}ms", businessType, duration);
            }
            
            return result;
        } catch (Exception e) {
            long duration = System.currentTimeMillis() - startTime;
            recordMetrics(businessType, duration, false);
            throw e;
        }
    }
    
    private void recordMetrics(String businessType, long duration, boolean success) {
        // 记录到监控系统
        metricsService.recordBatchTaskMetrics(businessType, duration, success);
    }
}
```

## 注意事项

### 1. 线程池管理
- 使用全局线程池，注意资源竞争
- 监控线程池状态，避免资源耗尽
- 合理控制并发任务数量

### 2. 内存使用
- 大量数据处理时注意内存占用
- 及时释放不需要的结果
- 考虑分批处理大数据集

### 3. 异常处理
- 区分必需任务和可选任务
- 提供合理的降级策略
- 记录详细的异常信息

### 4. 上下文传递
- MDC 和 RequestAttributes 会自动传递
- 注意线程安全问题
- 及时清理上下文信息

## 常见问题

### Q: 如何控制并发数量？
A: BatchTask 使用全局线程池，可以通过以下方式控制：
1. 调整 YamiCoreFixedThreadPoolUtil 的线程数配置
2. 分批执行任务
3. 使用自定义线程池

### Q: 任务执行失败怎么办？
A: 
1. 使用 `get(taskName, false)` 避免异常抛出
2. 检查返回值是否为 null
3. 提供降级逻辑
4. 记录失败日志

### Q: 如何处理任务间的依赖？
A: 
1. 将有依赖的任务分批执行
2. 第一批执行基础任务
3. 使用第一批结果执行第二批任务

### Q: 性能如何优化？
A: 
1. 合理设置任务粒度
2. 避免过多的小任务
3. 监控线程池状态
4. 考虑缓存常用数据