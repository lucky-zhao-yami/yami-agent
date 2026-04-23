---
name: "yami-public-toolkit"
description: "当需要使用 Redis 缓存注解、接口限流、分布式锁、文件上传、AB测试等公共工具时使用。触发词：yami-public, 工具包, 缓存, 限流, 分布式锁, AB测试, 文件上传, CacheableRedis, RequestLimit, RedisLockClient, BatchTask, Segment, SpringEL, 算法"
---

# Yami-Public 工具包

亚米网微服务公共工具包，提供缓存、限流、分布式锁、文件上传、AB测试、批量任务处理等功能。

## 前置条件

1. pom.xml 中已添加对应的依赖（ec-purchase-tool 或 central-purchase-tool）
2. 如果启动类包路径不是 `com.yamibuy`，需添加 `@EnablePublicEcPurchase` 或 `@EnablePublicCentralPurchase` 注解
3. Redis 连接配置正确

## 工具包结构

```
yami-public/
├── ec/purchase/                    # EC 模块 (C端服务)
│   ├── 缓存工具 (CacheableRedis)
│   ├── 限流工具 (RequestLimitUtil)
│   ├── 分布式锁 (RedisLockClient)
│   ├── AB测试 (ABTestService)
│   ├── 文件上传 (YamibuyUploader)
│   ├── 批量任务 (BatchTask)
│   └── 通用工具 (CommonUtil)
└── central/purchase/               # Central 模块 (中台服务)
    ├── 缓存工具 (CacheableRedis)
    ├── 限流工具 (RequestLimitUtil)
    ├── 分布式锁 (RedisLockClient)
    ├── 重试工具 (RetryUtil)
    └── 通用工具 (CommonUtil)
```

## Maven 依赖

**EC 模块:**
```xml
<dependency>
    <groupId>com.yamibuy</groupId>
    <artifactId>ec-purchase-tool</artifactId>
    <version>1.2.2</version>
</dependency>
```

**Central 模块:**
```xml
<dependency>
    <groupId>com.yamibuy</groupId>
    <artifactId>central-purchase-tool</artifactId>
    <version>1.1.0</version>
</dependency>
```

## 启用自动配置

如果启动类包路径不是 `com.yamibuy`，需要手动启用：

**EC 模块:**
```java
@EnablePublicEcPurchase
@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
```

**Central 模块:**
```java
@EnablePublicCentralPurchase
@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
```

## 快速参考

| 功能 | 核心类/注解 | 适用场景 |
|------|------------|----------|
| 缓存 | `@CacheableRedis` | 方法级 Redis 缓存、数据库查询结果缓存 |
| 限流 | `@RequestLimit` / `RequestLimitUtil` | API 接口限流、防刷保护 |
| 分布式锁 | `RedisLockClient` | 并发控制、资源互斥访问 |
| AB测试 | `ABTestService` | 功能灰度发布、用户行为实验 |
| 文件上传 | `YamibuyUploader` | 图片/文档上传、资源管理 |
| 批量任务 | `BatchTask` | 并行数据处理、批量接口调用 |
| 算法工具 | `CommonAlgorithmUtil` / `ComboAlgorithmUtil` | 商品推荐、搜索排序、内容编排 |
| 用户画像 | `SegmentService` | 个性化推荐、精准营销、用户分析 |
| Spring EL | `SpringElUtil` | 缓存键生成、条件判断、动态配置 |
| Servlet 工具 | `ServletUtil` | 请求信息获取、多语言支持、平台差异化 |

## 使用示例

### 缓存
```java
@CacheableRedis(
    key = "user:info:%s", 
    params = "#userId", 
    expireTime = 3600
)
public UserInfo getUserInfo(String userId) {
    return userMapper.selectById(userId);
}
```

### 限流
```java
@RequestLimit(times = 10, section = Duration.ofMinutes(1))
public void sensitiveOperation() {
    // 敏感操作，每分钟最多10次
}
```

### 分布式锁
```java
@Autowired
private RedisLockClient redisLockClient;

public void criticalSection() {
    String lockKey = "order:process:" + orderId;
    boolean locked = redisLockClient.tryLock(lockKey, TimeUnit.SECONDS, 5, 30);
    if (locked) {
        try {
            // 临界区代码
        } finally {
            redisLockClient.unlock(lockKey);
        }
    }
}
```

## 关键规则

1. **依赖管理**: 使用稳定版本，避免 SNAPSHOT；定期更新到最新稳定版本
2. **缓存策略**: 合理设置过期时间；避免缓存穿透和雪崩；监控命中率
3. **限流配置**: 根据业务场景设置合理阈值；考虑多维度限流组合
4. **分布式锁**: 设置合理的锁超时时间；避免死锁；确保锁的正确释放
5. **异常处理**: 工具类调用要有异常处理；提供降级方案；记录关键操作日志

## 注意事项

1. **启动类配置**: 包路径不匹配时需手动添加 Enable 注解
2. **版本选择**: 生产环境使用 RELEASE 版本
3. **依赖冲突**: 注意与项目中其他依赖的版本冲突
4. **性能监控**: 关注工具使用对系统性能的影响

## 版本信息

### EC 模块 (当前: 1.2.2)
- 1.2.2: 修正历史浏览segment响应问题，增强AB工具null字符串判断
- 1.2.1: 增加segment方法调用封装
- 1.2.0: 增加包装feign异常返回的情况

### Central 模块 (当前: 1.1.0)
- 1.1.0: 增加包装feign异常返回的情况
- 1.0.8: core升级3.0.17
- 1.0.7: 缓存bug修改，支持param为空

## 参考文档

- 安装和配置依赖 → `references/installation.md`
- 使用 Redis 缓存注解（@CacheableRedis） → `references/cache-tools.md`
- 使用接口限流（@RequestLimit） → `references/rate-limiting.md`
- 使用分布式锁（RedisLockClient） → `references/distributed-lock.md`
- 文件上传功能 → `references/file-upload.md`
- AB 测试功能 → `references/ab-testing.md`
- 批量任务处理（BatchTask） → `references/batch-processing.md`
- 通用工具类 → `references/common-utilities.md`
- 算法工具（排序、组合） → `references/algorithm-utilities.md`
- Segment 用户画像服务 → `references/segment-service.md`
- Spring EL 表达式工具 → `references/spring-el-utilities.md`
- Servlet 工具（HTTP 请求处理） → `references/servlet-utilities.md`
- 最佳实践和注意事项 → `references/best-practices.md`
- 常见问题和解决方案 → `references/troubleshooting.md`
