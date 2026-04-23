---
name: "codebase-knowledge-graph"
description: "分析代码库生成交互式知识图谱并存入长期记忆。当需要理解项目架构、可视化代码关系、新人 onboarding、分析代码变更影响时使用。触发词：知识图谱, knowledge graph, 代码架构, 架构分析, understand, 可视化, onboarding, 代码地图, 分析代码库"
---

# 代码库知识图谱 → 长期记忆

分析代码库，提取架构知识，**全部灌入 wecom-memory**。
以后问任何代码相关问题，直接从记忆里检索回答，不用每次重新读代码。

核心原则：**脚本提取结构 + LLM 语义理解 + 记忆持久化**

## 最终效果

分析完 ec-so-service 后，以后的对话中：
- "ec-so-service 下单流程怎么走的？" → 从记忆搜出 service 实体 + 调用链关系，直接回答
- "OrderService 依赖什么？" → 搜出所有 depends_on/calls 关系
- "哪些服务监听了订单消息？" → 搜出 subscribes 关系
- "改了 OrderDao 会影响什么？" → 搜出被依赖关系，列出影响范围

## 记忆存储映射

### 知识图谱 → 记忆实体

| 图谱节点类型 | 记忆 entity type | 示例 |
|-------------|-----------------|------|
| 项目整体 | `service` | name="ec-so-service", description="亚米网电商订单服务，处理下单、支付、发货全流程" |
| 架构层 | `config` | name="ec-so-service/API层", description="REST 控制器，包含 OrderController、PaymentController 等 8 个接口入口" |
| 核心类/文件 | `service` | name="ec-so-service/OrderService", description="订单核心业务逻辑，处理创建、取消、状态流转，依赖 OrderDao、InventoryClient" |
| 业务概念 | `rule` | name="ec-so-service/订单状态机", description="订单状态流转：CREATED→PAID→SHIPPED→DELIVERED→COMPLETED，异常状态：CANCELLED、REFUNDING" |
| 重要方法 | `rule` | name="ec-so-service/OrderService.createOrder", description="下单入口方法，流程：参数校验→风控→预占库存→创建订单→发MQ通知" |

### 知识图谱 → 记忆关系

| 图谱边类型 | 记忆 relation | 示例 |
|-----------|--------------|------|
| calls / imports | `调用` | from="ec-so-service/OrderController" → to="ec-so-service/OrderService" |
| depends_on | `依赖` | from="ec-so-service/OrderService" → to="ec-inventory-service" |
| subscribes | `监听消息` | from="ec-so-service/OrderStatusListener" → to="MQ:order.status.change" |
| publishes | `发送消息` | from="ec-so-service/OrderService" → to="MQ:order.created" |
| inherits | `继承` | from="ec-so-service/OrderServiceImpl" → to="ec-so-service/OrderService" |
| reads_from | `读取` | from="ec-so-service/OrderDao" → to="DB:persistence.order_v2" |
| writes_to | `写入` | from="ec-so-service/OrderDao" → to="DB:persistence.order_v2" |
| configures | `配置` | from="ec-so-service/application.yml" → to="ec-so-service/数据源配置" |

### 命名规范

实体和关系的 name 统一用 `{服务名}/{组件名}` 格式，这样：
- 搜 "ec-so-service" 能搜出该服务所有知识
- 搜 "OrderService" 能搜出所有服务中的 OrderService
- 搜 "MQ:order" 能搜出所有订单相关消息

---

## 执行流程

### Phase 0 — 预检

1. 确定项目根目录 `$PROJECT_ROOT`：
   - 用户指定了路径 → 直接使用
   - 用户说了项目名（如 ec-so-service）→ `/mnt/d/code/yami/{项目名}`
   - 未指定 → 询问用户

2. 先搜记忆看看是否已分析过：
   ```bash
   MEMORY_CHATID="cli_default" python3 /mnt/d/code/yami/kiro-wecom-bridge/memory_cli.py search '{"query": "{项目名}", "ns": "dev"}'
   ```
   如果已有丰富的记忆且 git commit 未变 → 报告"已分析过，记忆是最新的"并停止

3. 收集项目基本信息：
   ```bash
   cd $PROJECT_ROOT
   COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "no-git")
   ```

### Phase 1 — 扫描（脚本提取）

编写 bash 脚本扫描项目，输出文件清单 JSON。

脚本职责：
- `git ls-files` 获取文件列表
- 过滤出源代码文件（.java/.groovy/.xml/.yml/.properties/.js/.ts 等）
- 排除 target/、node_modules/、dist/、build/
- 统计每个文件行数
- 检测语言和框架（读 pom.xml 检测 Spring Boot/Dubbo/MyBatis/RabbitMQ 等）
- 输出到 `/tmp/ua-scan-{项目名}.json`

### Phase 2 — 结构提取（脚本）

针对 Java 项目，编写提取脚本，对每个文件用 grep/awk 提取：

| 提取项 | 方法 |
|--------|------|
| 类/接口声明 | `grep -n 'class \|interface \|enum '` |
| 方法签名 | `grep -n 'public \|private \|protected .*(.*){'` |
| 注解 | `grep -n '@RestController\|@Service\|@RabbitListener\|@DubboService\|@Scheduled\|@Autowired\|@DubboReference'` |
| import | `grep '^import '` |
| 继承/实现 | `grep 'extends \|implements '` |

输出结构化 JSON 到 `/tmp/ua-extract-{项目名}.json`

### Phase 3 — LLM 语义分析 + 存入记忆

这是核心步骤。读取脚本提取结果，**边分析边存记忆**。

#### 3a. 存项目总览实体

```bash
MEMORY_CHATID="cli_default" python3 memory_cli.py save_entity '{
  "type": "service",
  "name": "{项目名}",
  "description": "一段话概括项目职责、核心功能、技术栈",
  "properties": {
    "languages": "java",
    "frameworks": "Spring Boot, Dubbo, MyBatis, RabbitMQ",
    "git_commit": "{commit_hash}",
    "file_count": 120,
    "analyzed_at": "2025-03-20"
  },
  "ns": "dev"
}'
```

#### 3b. 存架构层实体

根据目录结构和 Java 包名，识别架构层并存储：

```bash
# 对每个识别出的层
MEMORY_CHATID="cli_default" python3 memory_cli.py save_entity '{
  "type": "config",
  "name": "{项目名}/架构层:{层名}",
  "description": "该层包含哪些组件、职责是什么、包含 N 个文件",
  "ns": "dev"
}'
```

#### 3c. 存核心组件实体

**不是每个文件都存**，只存重要的：

| 重要性判断 | 存不存 |
|-----------|--------|
| Controller（API 入口） | ✅ 必存 |
| Service（核心业务逻辑） | ✅ 必存 |
| MQ Listener/Producer | ✅ 必存 |
| Dubbo 接口 | ✅ 必存 |
| 定时任务 @Scheduled | ✅ 必存 |
| Dao/Mapper | ✅ 存，但描述简短 |
| Entity/Model | ⚠️ 只存核心实体，描述字段含义 |
| Config 类 | ⚠️ 只存有业务意义的配置 |
| Util/Helper | ❌ 不存，太碎 |
| DTO/VO/Req/Resp | ❌ 不存，太碎 |

对每个核心组件：

```bash
MEMORY_CHATID="cli_default" python3 memory_cli.py save_entity '{
  "type": "service",
  "name": "{项目名}/{类名}",
  "description": "2-3句话描述：这个类做什么、核心方法有哪些、依赖什么",
  "properties": {
    "file_path": "src/main/java/.../OrderService.java",
    "layer": "service",
    "key_methods": "createOrder, cancelOrder, updateStatus",
    "annotations": "@Service"
  },
  "ns": "dev"
}'
```

**Summary 写作要求**：
- 中文
- 说清楚业务职责，不是重复类名
- 列出核心方法和它们的作用
- 提到关键依赖

#### 3d. 存关系

对每个核心组件，存它的调用/依赖关系：

```bash
# Controller → Service 调用
MEMORY_CHATID="cli_default" python3 memory_cli.py save_relation '{
  "from_name": "{项目名}/OrderController",
  "relation": "调用",
  "to_name": "{项目名}/OrderService",
  "ns": "dev"
}'

# Service → 外部服务依赖
MEMORY_CHATID="cli_default" python3 memory_cli.py save_relation '{
  "from_name": "{项目名}/OrderService",
  "relation": "依赖",
  "to_name": "ec-inventory-service",
  "ns": "dev"
}'

# MQ 消息发送
MEMORY_CHATID="cli_default" python3 memory_cli.py save_relation '{
  "from_name": "{项目名}/OrderService",
  "relation": "发送消息",
  "to_name": "MQ:order.created",
  "ns": "dev"
}'

# MQ 消息监听
MEMORY_CHATID="cli_default" python3 memory_cli.py save_relation '{
  "from_name": "{项目名}/OrderStatusListener",
  "relation": "监听消息",
  "to_name": "MQ:order.status.change",
  "ns": "dev"
}'

# 数据库读写
MEMORY_CHATID="cli_default" python3 memory_cli.py save_relation '{
  "from_name": "{项目名}/OrderDao",
  "relation": "读写",
  "to_name": "DB:persistence.order_v2",
  "ns": "dev"
}'
```

#### 3e. 存业务流程/概念

对识别出的重要业务流程，存为 rule 实体：

```bash
MEMORY_CHATID="cli_default" python3 memory_cli.py save_entity '{
  "type": "rule",
  "name": "{项目名}/下单流程",
  "description": "1. OrderController.createOrder 接收请求 → 2. OrderService.createOrder 校验参数 → 3. 调用 ec-inventory-service 预占库存 → 4. OrderDao 写入订单 → 5. 发送 MQ:order.created 通知 → 6. 返回订单号",
  "ns": "dev"
}'
```

### Phase 4 — 存 Tour（学习路径）

基于 Phase 3 的分析，生成一个学习路径存入记忆：

```bash
MEMORY_CHATID="cli_default" python3 memory_cli.py save_entity '{
  "type": "rule",
  "name": "{项目名}/学习路径",
  "description": "1. 从 Application 启动类了解服务配置 → 2. 看 Controller 层了解对外接口 → 3. 看 Service 层理解核心业务逻辑 → 4. 看 MQ Listener 了解异步处理 → 5. 看 Dao 层了解数据模型 → 6. 看 Dubbo 接口了解跨服务调用",
  "ns": "dev"
}'
```

### Phase 5 — 报告

分析完成后向用户报告：
- 存了多少个实体（按类型统计）
- 存了多少条关系（按类型统计）
- 识别了哪些架构层
- 识别了哪些核心业务流程
- 提示用户可以开始提问了

---

## 分批策略

大项目文件多，需要分批处理：

1. **扫描和结构提取**：一次性跑完（脚本很快）
2. **LLM 分析 + 存记忆**：按架构层分批
   - 先分析 Controller 层 → 存记忆
   - 再分析 Service 层 → 存记忆
   - 再分析 MQ 层 → 存记忆
   - 再分析 Dao 层 → 存记忆
   - 最后分析 Config 层 → 存记忆
3. **每批完成后立即存记忆**，不等全部分析完。这样即使中途中断，已分析的部分也不会丢失。

## 增量更新

如果项目已分析过，只更新变更部分：

1. `git diff {上次commit}..HEAD --name-only` 获取变更文件
2. 只重新分析变更文件涉及的组件
3. `save_entity` 会自动归档旧版本，直接覆盖写入即可

## 注意事项

- `MEMORY_CHATID` 统一用 `cli_default`（命令行场景）
- `ns` 统一用 `dev`（开发知识命名空间）
- 实体名用 `{项目名}/{组件名}` 格式，保证可搜索性
- 不存 DTO/VO/Util 等碎片文件，只存有业务意义的核心组件
- description 用中文，写清楚业务含义
