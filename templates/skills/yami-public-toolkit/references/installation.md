# 安装和配置指南

## Maven 依赖配置

### EC 模块依赖

适用于 C端服务（如 ec-so、ec-payment、ec-customer 等）

```xml
<dependency>
    <groupId>com.yamibuy</groupId>
    <artifactId>ec-purchase-tool</artifactId>
    <version>1.2.2</version>
</dependency>
```

### Central 模块依赖

适用于中台服务（如 central-so、central-payment、central-fp 等）

```xml
<dependency>
    <groupId>com.yamibuy</groupId>
    <artifactId>central-purchase-tool</artifactId>
    <version>1.1.0</version>
</dependency>
```

## 自动配置启用

### 默认情况（推荐）

如果你的 Spring Boot 启动类包路径是 `com.yamibuy.*`，工具包会自动加载，无需额外配置。

```java
package com.yamibuy.ec.so;

@SpringBootApplication
public class EcSoApplication {
    public static void main(String[] args) {
        SpringApplication.run(EcSoApplication.class, args);
    }
}
```

### 手动启用配置

如果启动类包路径不是 `com.yamibuy.*`，需要手动添加注解：

**EC 模块手动启用:**
```java
package com.example.myapp;

import com.yamibuy.purchase.EnablePublicEcPurchase;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@EnablePublicEcPurchase
@SpringBootApplication
public class MyApplication {
    public static void main(String[] args) {
        SpringApplication.run(MyApplication.class, args);
    }
}
```

**Central 模块手动启用:**
```java
package com.example.myapp;

import com.yamibuy.purchase.EnablePublicCentralPurchase;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@EnablePublicCentralPurchase
@SpringBootApplication
public class MyApplication {
    public static void main(String[] args) {
        SpringApplication.run(MyApplication.class, args);
    }
}
```

## 必要的基础依赖

工具包依赖以下基础组件，确保你的项目中已包含：

### Redis 配置

工具包需要 Redis 支持，确保项目中配置了 Redis：

```properties
# application.properties
spring.redis.host=your-redis-host
spring.redis.port=6379
spring.redis.password=your-password
spring.redis.database=0
```

### Redisson 配置

分布式锁功能需要 Redisson 支持：

```xml
<dependency>
    <groupId>org.redisson</groupId>
    <artifactId>redisson-spring-boot-starter</artifactId>
    <version>3.16.8</version>
</dependency>
```

### OkHttp 配置

文件上传功能使用 OkHttp：

```xml
<dependency>
    <groupId>com.squareup.okhttp3</groupId>
    <artifactId>okhttp</artifactId>
    <version>4.6.0</version>
</dependency>
```

## 版本选择策略

### 生产环境

使用稳定的 RELEASE 版本：

```xml
<dependency>
    <groupId>com.yamibuy</groupId>
    <artifactId>ec-purchase-tool</artifactId>
    <version>1.2.2</version> <!-- 使用具体版本号 -->
</dependency>
```

### 开发测试环境

可以使用 SNAPSHOT 版本进行测试：

```xml
<dependency>
    <groupId>com.yamibuy</groupId>
    <artifactId>ec-purchase-tool</artifactId>
    <version>1.2.3-SNAPSHOT</version>
</dependency>
```

## Maven 仓库配置

确保项目可以访问亚米网的 Maven 仓库：

```xml
<repositories>
    <repository>
        <id>yami-repo</id>
        <name>Yami Nexus Central</name>
        <url>https://nexus.yamibuy.net/repository/maven-public/</url>
        <releases>
            <enabled>true</enabled>
        </releases>
        <snapshots>
            <enabled>true</enabled>
        </snapshots>
    </repository>
</repositories>
```

## 编译参数配置

为了更好地支持 Spring EL 表达式参数名解析，建议添加编译参数：

```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-compiler-plugin</artifactId>
    <configuration>
        <compilerArgs>
            <arg>-parameters</arg>
        </compilerArgs>
    </configuration>
</plugin>
```

## 配置验证

### 验证自动配置是否生效

启动应用后，检查日志中是否有相关 Bean 的加载信息：

```
INFO  - Bean 'publicRedisLockClient' of type [RedisLockClient] is not eligible for getting processed
INFO  - Bean 'publicABTestService' of type [ABTestService] is not eligible for getting processed
```

### 验证工具类是否可用

创建一个测试 Controller 验证：

```java
@RestController
public class TestController {
    
    @Autowired
    private RedisLockClient redisLockClient;
    
    @Autowired
    private ABTestService abTestService;
    
    @GetMapping("/test/tools")
    public String testTools() {
        // 测试分布式锁
        boolean locked = redisLockClient.tryLock("test:lock", TimeUnit.SECONDS, 5, 10);
        if (locked) {
            redisLockClient.unlock("test:lock");
        }
        
        // 测试AB测试服务
        String abValue = abTestService.getAbValue("test-token", "test-device", "test-yami-id", "test-experiment", false);
        
        return "工具包配置成功！AB测试结果: " + abValue;
    }
}
```

## 常见配置问题

### 问题1: Bean 重复定义

**错误信息:**
```
The bean 'publicABTestclient.feignclientspecification' could not be registered. 
A bean with that name has already been defined and overriding is disabled.
```

**解决方案:**
这通常发生在启动类扫描路径包含 `com.yamibuy` 时。使用手动启用注解而不是自动扫描：

```java
@EnablePublicEcPurchase  // 手动启用
@SpringBootApplication(scanBasePackages = "com.yourcompany.yourapp")  // 限制扫描范围
public class Application {
}
```

### 问题2: Redis 连接失败

**错误信息:**
```
Could not get a resource from the pool
```

**解决方案:**
检查 Redis 配置和网络连接：

```properties
# 增加连接池配置
spring.redis.jedis.pool.max-active=20
spring.redis.jedis.pool.max-idle=10
spring.redis.jedis.pool.min-idle=5
spring.redis.timeout=3000
```

### 问题3: 版本冲突

**错误信息:**
```
NoSuchMethodError 或 ClassNotFoundException
```

**解决方案:**
检查依赖版本冲突，使用 Maven 依赖分析：

```bash
mvn dependency:tree -Dverbose
```

排除冲突的传递依赖：

```xml
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
```

## 升级指南

### 从旧版本升级

1. **检查版本变更日志**: 查看 POWER.md 中的版本历史
2. **更新依赖版本**: 修改 pom.xml 中的版本号
3. **检查 API 变更**: 关注是否有 API 变更
4. **测试验证**: 在测试环境充分验证
5. **逐步发布**: 生产环境逐步发布

### 版本兼容性

| 工具包版本 | Spring Boot | Java | Redis |
|-----------|-------------|------|-------|
| 1.2.x     | 2.3+        | 8+   | 3.0+  |
| 1.1.x     | 2.2+        | 8+   | 3.0+  |
| 1.0.x     | 2.1+        | 8+   | 2.8+  |

## 性能调优

### JVM 参数建议

```bash
-Xms2g -Xmx4g
-XX:+UseG1GC
-XX:MaxGCPauseMillis=200
-XX:+HeapDumpOnOutOfMemoryError
```

### 连接池配置

```properties
# Redis 连接池
spring.redis.jedis.pool.max-active=50
spring.redis.jedis.pool.max-idle=20
spring.redis.jedis.pool.min-idle=10

# 数据库连接池
spring.datasource.hikari.maximum-pool-size=20
spring.datasource.hikari.minimum-idle=5
```

### 监控配置

添加 Actuator 监控：

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
```

```properties
management.endpoints.web.exposure.include=health,info,metrics
management.endpoint.health.show-details=always
```