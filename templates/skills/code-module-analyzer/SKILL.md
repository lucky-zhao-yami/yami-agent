---
name: "code-module-analyzer"
description: "当需要分析代码模块、理解代码结构、追踪调用链、生成代码文档时使用。触发词：这段代码, 帮我看看, 分析一下, 这个模块, 什么意思, 怎么实现的, 代码分析"
---

# 代码模块分析器

自动分析指定代码模块，生成面向开发者的可读文档，方便后续修改和维护。

## 核心原则（必须遵守）

**只分析，不修改：**
- ✅ 阅读代码、分析结构、追踪调用链
- ✅ 生成分析文档（Markdown）
- ✅ 回答用户关于代码的问题
- ❌ 禁止修改任何源代码文件
- ❌ 禁止修复 bug 或重构代码

**输出方式（强制规则）：**

| 场景 | 输出方式 | 示例 |
|------|----------|------|
| 单个方法/函数解释 | 对话回答 | "这个方法是做什么的" |
| 单行代码含义 | 对话回答 | "这行代码什么意思" |
| 模块/目录分析 | **必须生成 MD 文件** | "分析这个模块"、"帮我看看这个目录" |
| 多文件分析 | **必须生成 MD 文件** | "分析订单模块"、"看看用户中心" |
| 接口调用链分析 | **必须生成 MD 文件** | "这个接口怎么实现的" |
| 流程/架构分析 | **必须生成 MD 文件** | "登录流程是怎样的" |

**文件输出规则：**
1. 文件路径：`{工作区}/docs/{模块名}-analysis.md`
2. 文件命名：使用模块名或功能名，如 `order-module-analysis.md`
3. **分析完成后必须告知用户文件保存位置**

**判断原则：涉及 2 个以上文件或需要画流程图时，必须输出 MD 文件**

## 分析流程

1. **识别技术栈** - 判断 Java/前端/混合项目
2. **扫描结构** - 按分析要点清单逐项扫描
3. **提取关键信息** - 入口、流程、依赖、鉴权
4. **生成文档** - 输出符合模板的 Markdown

## Java 后端分析要点

| 维度 | 识别方式 |
|------|----------|
| 项目结构 | `pom.xml` modules、目录结构 |
| 入口点 | `@RestController`、`@RabbitListener`、`@Scheduled`、`@DubboService` |
| 分层架构 | 包名、类名后缀（Controller/Service/Dao） |
| 数据访问 | Mapper XML、`@Repository`、`@Mapper` |
| 业务 SQL | Mapper XML 中的 SQL、`@Select`/`@Update`/`@Insert`/`@Delete` 注解 |
| 远程调用 | `@FeignClient`、`@DubboReference` |
| 消息队列 | `@RabbitListener`、`@KafkaListener` |
| 配置管理 | `@Value`、`@ConfigurationProperties` |
| AOP/注解 | `@Aspect`、自定义 `@interface` |
| 异常处理 | `@ControllerAdvice`、自定义 Exception |
| 设计模式 | 接口+多实现、`xxxStrategy`、`xxxFactory` |

## 接口 SQL 追踪

分析接口时，需追踪完整的数据访问链路：

### 追踪步骤
1. **定位 Controller 方法** - 找到接口入口
2. **追踪 Service 调用** - 识别业务逻辑层
3. **定位 Mapper/Dao** - 找到数据访问层
4. **提取 SQL 语句** - 从 XML 或注解中提取

### SQL 识别方式

| 来源 | 识别方法 |
|------|----------|
| Mapper XML | `<select>`、`<insert>`、`<update>`、`<delete>` 标签 |
| 注解 SQL | `@Select`、`@Insert`、`@Update`、`@Delete` |
| 动态 SQL | `<if>`、`<foreach>`、`<choose>`、`<where>`、`<set>` |
| 关联查询 | `<resultMap>`、`<association>`、`<collection>` |

### 输出格式

分析接口时，SQL 信息按以下格式输出：

```markdown
### 接口 SQL 分析

**接口：** `POST /api/order/create`

**调用链路：**
```
OrderController.createOrder()
  → OrderService.create()
    → OrderMapper.insert()
    → OrderItemMapper.batchInsert()
```

**涉及 SQL：**

| 方法 | SQL 类型 | 表名 | 说明 |
|------|----------|------|------|
| OrderMapper.insert | INSERT | t_order | 插入订单主表 |
| OrderItemMapper.batchInsert | INSERT | t_order_item | 批量插入订单明细 |

**SQL 详情：**

1. **OrderMapper.insert**
```sql
INSERT INTO t_order (order_no, user_id, total_amount, status)
VALUES (#{orderNo}, #{userId}, #{totalAmount}, #{status})
```

2. **OrderItemMapper.batchInsert**
```sql
INSERT INTO t_order_item (order_id, product_id, quantity, price)
VALUES
<foreach collection="items" item="item" separator=",">
  (#{item.orderId}, #{item.productId}, #{item.quantity}, #{item.price})
</foreach>
```
```

## 前端分析要点

| 维度 | 识别方式 |
|------|----------|
| 技术栈 | `package.json` 依赖（react/vue/angular） |
| 路由配置 | `router/`、`routes.ts`、文件后缀 |
| 状态管理 | `store/`、redux/vuex/pinia/zustand |
| API 层 | `api/`、`services/`、`request.ts` |
| 组件结构 | `pages/`、`views/`、`components/` |
| Hook/Composable | `hooks/`、`composables/`、`use*.ts` |
| 样式方案 | 文件后缀（.module.css/.less/.scss） |
| 构建工具 | `vite.config.ts`、`webpack.config.js` |
| 类型定义 | `types/`、`*.d.ts` |

## 登录鉴权分析（管理系统）

### 后端
- 认证方式：搜索 `token`、`jwt`、`session`、`oauth`
- 登录入口：搜索 `login`、`auth`、`signin` Controller
- 权限拦截：`Interceptor`、`Filter`、`@PreAuthorize`
- 用户上下文：`UserContext`、`SecurityContextHolder`

### 前端
- 登录页面：`Login/`、`login.tsx`、`SignIn`
- Token 存储：`localStorage`、`sessionStorage`、`Cookies`
- 请求拦截：axios interceptor
- 路由守卫：`AuthRoute`、`beforeEach`、`PrivateRoute`

## 输出文档模板

生成的文档必须包含以下章节：

```markdown
# [模块名] 开发者指南

## 1. 模块概览
- 一句话说明
- 业务场景
- 技术栈

## 2. 快速定位
| 我想... | 看这里 |

## 3. 核心流程
- 流程图（Mermaid）
- 数据流转

## 4. 关键类/组件速查
| 类名/组件 | 职责 | 修改时注意 |

## 5. 边界与依赖
- 对外接口
- 依赖服务
- 数据存储

## 6. 接口 SQL 分析（如适用）
- 接口与 SQL 映射表
- 核心 SQL 详情
- 动态 SQL 说明

## 7. 登录与鉴权（如适用）
- 认证方式
- 登录入口
- Token 处理

## 8. 注意事项与踩坑记录

## 9. 开发指南
- 本地启动
- 调试技巧
- 相关配置
```

## 执行步骤

1. 用户指定模块路径
2. 扫描目录结构，识别技术栈
3. 按分析要点逐项检查
4. 阅读关键文件提取信息
5. 生成 Mermaid 流程图
6. **输出完整 Markdown 文档到 `docs/` 目录**
7. **告知用户文件保存路径**

## 注意事项

- 优先分析入口文件（Controller、路由、main）
- 流程图使用 Mermaid 语法
- 表格要填充具体内容，不要留空
- 如果某章节不适用，说明原因后跳过
- **分析完成后必须生成 MD 文件，不要只在对话中输出**
- **文件生成后必须明确告知用户保存路径**
