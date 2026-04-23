# 技术栈

## 构建系统
- **构建工具**: Maven 3.x
- **Java版本**: JDK 1.8
- **编码**: UTF-8
- **父POM**: yami-global-dependencies 3.0.10-SNAPSHOT

## 核心框架
- **Spring Boot**: 2.4.x
- **Spring Cloud**: 微服务架构支持
- **Spring Cloud OpenFeign**: 服务间 RPC 调用
- **MyBatis**: 数据持久化框架

## 测试框架
- **Groovy + Spock**: 单元测试和集成测试（推荐）
- **Mockito**: Mock 框架（包括 mockito-inline 用于静态方法 mock）
- 测试代码位于 `src/test/groovy` 目录

## 主要依赖库

### 消息队列
- **Spring AMQP**: RabbitMQ 消息队列集成
- 用于服务间异步通信和事件驱动

### 配置管理
- **Apollo**: 分布式配置中心
- 配置命名空间: `application`, `public_central`, `public_ec`
- 支持配置热更新

### 定时任务
- **XXL-Job**: 分布式任务调度框架
- 支持任务编排、失败重试、执行日志

### 第三方服务集成
- **AfterShip SDK** (2.1.10): 物流追踪服务
- **Avalara AvaTax** (22.11.0): 税务计算服务
- **OkHttp3** (4.6.0): HTTP 客户端
- **Gson** (2.8.6): JSON 处理

### 文档处理
- **PD4ML**: PDF 生成
- **EasyExcel**: Excel 文件处理
- **Apache POI**: Office 文档处理
- **OpenHtmlToPdf** (rayin-htmladapter): HTML 转 PDF

### 工具库
- **Guava Retrying** (2.0.0): 重试机制
- **Joda-Time**: 日期时间处理
- **Commons IO**: IO 工具类
- **JsonPath**: JSON 路径查询

## 常用命令

### 编译构建
```bash
# 编译整个项目（在服务根目录）
mvn clean install

# 跳过测试编译
mvn clean install -DskipTests

# 只编译某个模块
mvn clean install -pl <module-name> -am

# 示例：只编译 REST 模块
mvn clean install -pl central-so-rest -am
```

### 运行应用
```bash
# 运行 REST 服务
cd <service-name>-rest
mvn spring-boot:run

# 运行定时任务服务
cd <service-name>-job
mvn spring-boot:run
```

### 测试
```bash
# 运行所有测试
mvn test

# 运行指定测试类
mvn test -Dtest=<TestClassName>

# 示例
mvn test -Dtest=SendEmailServiceTest
```

### Docker 部署
```bash
# 构建 Docker 镜像
docker build -f <service-name>-rest/Dockerfile -t <service-name>-rest:latest .

# 使用 docker stack 部署（开发环境）
docker stack deploy -c docker-stack.dev.yml <service-name>

# 使用 docker stack 部署（测试环境）
docker stack deploy -c docker-stack.qc.yml <service-name>

# 使用 docker stack 部署（生产环境）
docker stack deploy -c docker-stack.prd.yml <service-name>
```

### Public 模块发布
```bash
# 发布 central-purchase-tool
mvn deploy -P release -pl central/purchase -am

# 发布 ec-purchase-tool
mvn deploy -P release -pl ec/purchase -am -f pom.xml

# 发布所有模块
mvn deploy -P release -f pom.xml
```

## 环境配置

### Apollo 配置
- **开发环境**: `apollo.cluster=LOCAL-UAT`
- **应用ID命名**: `<service-name>-service`（如 `central-so-service`）
- 需要在 `application.properties` 中配置 Apollo 相关参数

### 多环境支持
每个服务提供三套环境配置：
- **dev**: 开发环境 (`docker-stack.dev.yml` 或 `docker-stack-ec.dev.yml`)
- **qc**: 测试环境 (`docker-stack.qc.yml` 或 `docker-stack-ec.qc.yml`)
- **prd**: 生产环境 (`docker-stack.prd.yml` 或 `docker-stack-ec.prd.yml`)

### 服务命名规范
- Central 服务: `docker-stack.{env}.yml`
- EC 服务: `docker-stack-ec.{env}.yml`
- Job 服务: `docker-stack-job.{env}.yml` 或 `docker-stack-ec-job.{env}.yml`

## 代码规范

### 包命名规范
- **基础包名**: `com.yamibuy.<domain>.<service>`
  - Central 服务: `com.yamibuy.central.<service>`
  - EC 服务: `com.yamibuy.ec.<service>`
- **REST 接口**: `*.rest`
- **服务层**: `*.service`
- **数据访问**: `*.dao`
- **实体类**: `*.entity`
- **客户端**: `*.client`
- **工具类**: `*.utils`

### 国际化
- **资源文件命名**: `business_{locale}.properties`
- **支持语言**: zh_CN, zh_TW, en_US, ja, ko
- **消息代码**: 使用 6 位数字编码（如: 100001）

### 类命名约定
- REST 实现: `*RestImpl`
- 服务类: `*Service`
- DAO 接口: `*Dao`
- 实体类: 直接使用业务名称（如 `OrderInfo`）
- 请求对象: `*Request`
- 响应对象: `*Response`
- 枚举类: `*Enum`
- 常量类: `*Constant`

### 日志级别规范
- 只使用 `log.info` 和 `log.error` 两个级别
- 不使用 `log.debug`、`log.warn`、`log.trace`
- 正常业务流程使用 `log.info`
- 异常捕获使用 `log.error`

### 方法命名约定
- 查询: `get*`, `query*`, `find*`, `list*`
- 新增: `add*`, `create*`, `insert*`
- 修改: `update*`, `modify*`
- 删除: `delete*`, `remove*`
- 业务操作: 使用动词开头（如 `cancelOrder`, `refundOrder`）

## Maven 仓库
- **Releases**: https://nexus.yamibuy.net/repository/maven-releases/
- **Snapshots**: https://nexus.yamibuy.net/repository/maven-snapshots/
- **Public**: https://nexus.yamibuy.net/repository/maven-public/

## 注意事项
- 使用 SNAPSHOT 版本进行开发测试
- 合并到 master 后发布 RELEASE 版本
- 不要直接在 Nexus 上修改仓库
- 修改父 POM 的 dependencyManagement 版本号时，需累加父 POM 版本号
