# 配置文件体系

## 配置目录

配置目录：`.openproject/`（应加入 `.gitignore`）

```
.openproject/
├── global.properties        # 全局配置（用户信息、项目信息）
├── config-task.properties   # Task 类型默认字段
├── config-bug.properties    # Bug 类型默认字段
├── config-project.properties # Project 类型默认字段
└── ...                      # 其他类型按需生成
```

## global.properties — 公共配置

所有类型共享的字段，从首次提供的 demo OP 中提取：

```properties
# 项目信息
project.id=3
project.identifier=tech-team

# 默认类型（用户未指定类型时使用）
default.type.id=1
default.type.name=Task

# 用户信息
pic.id=33
pic.name=damon li
requestor.id=33
requestor.name=damon li
assignee.id=33
assignee.name=damon li
responsible.id=13
responsible.name=waylon tian
```

## config-{type}.properties — 类型专属配置

每种类型独立的默认自定义字段值，从该类型的 demo OP 中提取：

```properties
# 示例：config-task.properties（从 OP-12345 提取）
type.id=1
type.name=Task
source.op_id=12345

# 必填自定义字段
channel.id=603
channel.name=SSS-3P
theme.id=245
theme.name=Improvement (改进)
trimester.id=656
trimester.name=T1 2026

# 可选自定义字段（从 demo OP 中有值的字段提取）
dept.id=270
dept.name=Tech
project_type.id=271
project_type.name=Tech
```

## 从 demo OP 提取配置

用户提供链接后，从 URL 中提取工作包 ID，调用：
```json
{"tool": "openproject_get_work_package", "params": {"work_package_id": 26500, "response_format": "json"}}
```

### 提取全局配置字段（写入 global.properties）

- `_embedded.project.id` → project.id
- `_embedded.project.identifier` → project.identifier
- `_embedded.type.id` → default.type.id
- `_embedded.type.name` → default.type.name
- `_embedded.customField9.id/name` → pic.id/name
- `_embedded.customField16.id/name` → requestor.id/name
- `_embedded.assignee.id/name` → assignee.id/name
- `_embedded.responsible.id/name` → responsible.id/name

### 提取类型配置字段（写入 config-{type}.properties）

- `_embedded.type.id/name` → type.id/name
- 工作包 ID → source.op_id
- 遍历该类型的 reference 文档中列出的所有自定义字段
- 对于 `_links` 中的选项/用户字段：从 href 提取 ID，从 title 提取名称
- 对于顶层的文本/日期/布尔字段：直接提取值
- **只提取有值（非 null）的字段**

### 字段名映射规则

| customField | 配置 key | 说明 |
|---|---|---|
| customField1 | channel | 类型配置 |
| customField9 | pic | 全局配置 |
| customField11 | — | 不提取，动态计算周数 |
| customField15 | bug_environment | 类型配置 |
| customField16 | requestor | 全局配置 |
| customField17 | launched_date | 类型配置 |
| customField18 | project_type_option | 类型配置 |
| customField19 | test_case_analyze | 类型配置 |
| customField51 | pm | 类型配置 |
| customField52 | designer | 类型配置 |
| customField54 | theme | 类型配置 |
| customField62 | dept | 类型配置 |
| customField66 | topic | 类型配置 |
| customField85 | sprint_code | 类型配置 |
| customField87 | is_reporting | 类型配置 |
| customField89 | requirement_type | 类型配置 |
| customField92 | tech_confirmed_time | 类型配置 |
| customField126 | trimester | 类型配置 |

### 提取完成后展示确认

> ✅ 已从 OP-{id} 提取 {类型名} 类型的默认配置：
> - Channel: SSS-3P
> - Theme: Improvement (改进)
> - Trimester: T1 2026
> - ...（列出所有提取的字段）

## 注意事项

- 从 URL 提取工作包 ID：`/work_packages/26500` → `26500`
- 自定义字段选项 ID 从 `_links` 中的 href 提取（如 `/api/v3/custom_options/603` → `603`）
- 用户类型字段（customField9/16）从 `_embedded` 中提取 `id` 和 `name`
- 配置目录 `.openproject/` 应加入 `.gitignore`
