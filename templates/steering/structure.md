# 项目结构

## Workspace 组织

**工作空间根目录**: `/mnt/d/workspace/all/`  
**代码仓库目录**: `/mnt/d/code/yami/`

```
/mnt/d/workspace/all/             # Workspace 配置目录
├── .kiro/                        # Kiro 配置和 steering 规则
│   ├── steering/                 # Steering 规则文档
│   └── workspace.json            # 仓库路径配置

/mnt/d/code/yami/                 # 代码仓库根目录
├── central-activity-service/     # Central 活动服务
├── central-crm-web/              # Central CRM Web
├── central-customer-service/     # Central 客户服务
├── central-distributor-service/  # Central 分销商服务
├── central-fp-service/           # Central FP 服务
├── central-fp-web/               # Central FP Web
├── central-payment-service/      # Central 支付服务
├── central-rma-service/          # Central RMA 服务
├── central-rma-web/              # Central RMA Web
├── central-so-service/           # Central 销售订单服务
├── central-so-web/               # Central SO Web
├── ec-activity-service/          # EC 活动服务
├── ec-customer-service/          # EC 客户服务
├── ec-distributor-service/       # EC 分销商服务
├── ec-inventory-service/         # EC 库存服务
├── ec-payment-service/           # EC 支付服务
├── ec-rma-service/               # EC RMA 服务
├── ec-so-service/                # EC 销售订单服务
├── ec-tax-service/               # EC 税务服务
├── mail-service-job/             # 邮件服务任务
└── public/                       # 公共工具库
```
└── public/                       # 公共工具库
```

## 标准微服务结构

每个微服务（如 `central-so-service`、`ec-so-service`）都采用相同的 Maven 多模块架构：

```
<service-name>/
├── pom.xml                       # 父 POM
├── docker-stack.{env}.yml        # Docker 部署配置
├── <service-name>-api/           # API 接口定义模块
├── <service-name>-service/       # 核心业务服务模块
├── <service-name>-rest/          # REST API 实现模块
└── <service-name>-job/           # 定时任务模块（可选）
```

### 模块职责

#### 1. API 模块 (`*-api`)
**职责**: 定义对外暴露的 API 接口和实体类

**目录结构**:
```
<service-name>-api/
├── src/main/java/com/yamibuy/<domain>/<service>/
│   ├── api/                      # REST 接口定义
│   │   ├── *Rest.java            # 接口定义（使用 @FeignClient）
│   │   └── ...
│   └── entity/                   # 实体类
│       ├── *Info.java            # 业务实体
│       ├── *Request.java         # 请求对象
│       ├── *Response.java        # 响应对象
│       └── ...
└── pom.xml
```

**特点**:
- 仅包含接口定义和数据模型
- 不包含业务逻辑实现
- 可被其他服务通过 Feign 调用
- 依赖最小化（通常只依赖 purchase-tool）

#### 2. Service 模块 (`*-service`)
**职责**: 核心业务逻辑实现

**目录结构**:
```
<service-name>-service/
├── src/
│   ├── main/
│   │   ├── java/com/yamibuy/<domain>/<service>/
│   │   │   ├── client/           # 外部服务客户端（Feign）
│   │   │   │   ├── *Client.java
│   │   │   │   └── ...
│   │   │   ├── common/           # 公共常量和枚举
│   │   │   │   ├── *Constant.java
│   │   │   │   ├── *Enum.java
│   │   │   │   ├── *MessageCode.java
│   │   │   │   └── ...
│   │   │   ├── dao/              # 数据访问层
│   │   │   │   ├── *Dao.java
│   │   │   │   └── ...
│   │   │   ├── service/          # 业务服务层
│   │   │   │   ├── *Service.java
│   │   │   │   └── ...
│   │   │   ├── rabbitmq/         # 消息队列
│   │   │   │   ├── consumer/     # 消息消费者
│   │   │   │   ├── RabbitSender.java
│   │   │   │   └── RabbitmqConfig.java
│   │   │   ├── redis/            # Redis 缓存
│   │   │   │   ├── *RedisService.java
│   │   │   │   └── ...
│   │   │   └── utils/            # 工具类
│   │   │       └── ...
│   │   └── resources/
│   │       ├── mapper/           # MyBatis XML 映射文件
│   │       │   ├── *Mapper.xml
│   │       │   └── ...
│   │       └── business_*.properties  # 国际化资源文件
│   └── test/
│       └── groovy/               # Groovy + Spock 测试
│           └── com/yamibuy/<domain>/<service>/
│               ├── service/      # 服务层测试
│               └── ...
└── pom.xml
```

**特点**:
- 包含所有业务逻辑实现
- 依赖 `*-api` 模块
- 使用 MyBatis 进行数据访问
- 集成 RabbitMQ、Redis 等中间件
- 使用 Groovy + Spock 编写测试

#### 3. REST 模块 (`*-rest`)
**职责**: REST API 实现和 Web 层

**目录结构**:
```
<service-name>-rest/
├── src/main/
│   ├── java/com/yamibuy/<domain>/
│   │   ├── *RestApplication.java # 主启动类
│   │   └── <service>/rest/       # REST 实现
│   │       ├── *RestImpl.java
│   │       └── ...
│   └── resources/
│       ├── application.properties # 应用配置
│       ├── templates/            # HTML 模板（可选）
│       └── fonts/                # 字体文件（可选）
├── Dockerfile                    # Docker 镜像构建文件
└── pom.xml
```

**特点**:
- 实现 `*-api` 模块中定义的接口
- 使用 `@EnableFeignClients` 启用 Feign 客户端
- 使用 `@EnablePublic*Purchase` 启用采购功能
- 依赖 `*-service` 模块
- 包含 Spring Boot 启动类

#### 4. Job 模块 (`*-job`)（可选）
**职责**: 定时任务和后台作业

**目录结构**:
```
<service-name>-job/
├── src/main/java/com/yamibuy/<domain>/
│   ├── *JobRestApplication.java  # 主启动类
│   └── <service>/
│       ├── handler/              # 任务处理器
│       │   ├── *Handler.java     # XXL-Job 任务处理器
│       │   └── ...
│       ├── entity/               # 任务相关实体
│       └── config/
│           └── XxlJobConfig.java # XXL-Job 配置
├── Dockerfile
└── pom.xml
```

**特点**:
- 使用 `@EnableScheduling` 启用定时任务
- 集成 XXL-Job 分布式任务调度
- 依赖 `*-service` 模块
- 独立部署，不影响主服务

## Public 公共模块

```
public/
├── pom.xml                       # 父 POM
├── central/
│   └── purchase/                 # Central 采购工具库
│       └── src/main/java/com/yamibuy/purchase/
└── ec/
    └── purchase/                 # EC 采购工具库
        └── src/main/java/com/yamibuy/purchase/
```

**特点**:
- 提供跨服务的公共功能
- 发布到 Maven 仓库供其他服务依赖
- 仅包含非业务代码
- 使用 SNAPSHOT 版本开发，RELEASE 版本发布

## 分层架构

```
┌─────────────────────────────────────┐
│  REST Layer (*-rest)                │  ← REST API 入口
│  - Controller 实现                  │
│  - 参数验证                          │
│  - 异常处理                          │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  Service Layer (*-service)          │  ← 业务逻辑层
│  - 业务服务                          │
│  - 事务管理                          │
│  - 外部服务调用（Feign Client）      │
│  - 消息发送（RabbitMQ）              │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  DAO Layer (*-service)              │  ← 数据访问层
│  - MyBatis Mapper                   │
│  - 数据库操作                        │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  Infrastructure                     │  ← 基础设施层
│  - MySQL                            │
│  - Redis                            │
│  - RabbitMQ                         │
│  - Apollo                           │
└─────────────────────────────────────┘
```

## 服务间通信

### 同步调用（Feign）
```
Service A (*-rest)
    ↓ @Autowired
Service A Client (定义在 *-service)
    ↓ @FeignClient
Service B API (定义在 Service B 的 *-api)
    ↓ 实现
Service B REST (定义在 Service B 的 *-rest)
```

### 异步通信（RabbitMQ）
```
Service A
    ↓ RabbitSender.send()
RabbitMQ Exchange/Queue
    ↓ @RabbitListener
Service B Consumer
```

## 关键设计模式

### 1. 接口与实现分离
- API 接口定义在 `*-api` 模块
- 实现在 `*-rest` 模块
- 便于服务间调用和版本管理

### 2. 服务编排
- Service 层负责业务编排
- 通过 Feign Client 调用其他微服务
- 使用 RabbitMQ 实现异步解耦

### 3. 配置外部化
- 使用 Apollo 配置中心管理配置
- 支持多环境配置切换
- 敏感信息不写入代码

### 4. 国际化支持
- 所有用户可见文本使用资源文件
- 支持 5 种语言（中文简繁体、英文、日文、韩文）
- 消息代码统一管理

## 部署架构

### Docker 部署
- 每个服务独立打包为 Docker 镜像
- 使用 Docker Stack 进行编排部署
- 支持多环境配置（dev/qc/prd）

### 服务部署清单
- REST 服务: 提供 HTTP API
- Job 服务: 执行定时任务（独立部署）
- 每个服务可独立扩展和部署

## 注意事项

### 模块依赖规则
- `*-api` 模块: 最小依赖，只依赖 purchase-tool
- `*-service` 模块: 依赖 `*-api` 和其他服务的 `*-api`
- `*-rest` 模块: 依赖 `*-service`
- `*-job` 模块: 依赖 `*-service`

### 代码组织原则
- 按功能模块划分包结构
- 相同层次的代码放在同一包下
- 避免循环依赖
- 保持模块职责单一
