---
name: "manage-openproject"
description: >
  当需要查询 OP、创建 OP、更新 OP、查看项目工作包、管理工作包状态时使用。
  触发词：openproject, 创建OP, 查看OP, OP, 工作包, work package, 建个Task, 建个Bug, 项目管理, 工作包列表
---

# OpenProject 项目管理

连接亚米 OpenProject 系统，提供项目查询、工作包创建与管理功能。

## 使用场景

- 查询项目列表、项目详情
- 创建工作包（Task、Bug、Feature、User Story 等）
- 查看、筛选、更新工作包
- 查询用户、状态、类型、优先级等元数据
- 不适用：非 OpenProject 的项目管理操作

## 前置条件

1. API Key 配置在 `~/.kiro/settings/mcp.json` 中（路径：`mcpServers.openproject.env.OPENPROJECT_API_KEY`）
2. 通过 curl 直接调用 OpenProject REST API v3，不依赖 MCP 服务器

## API 调用方式

**不使用 MCP 工具，直接通过 curl 调用 OpenProject REST API v3。**

### 获取 API Key

从 `.openproject/global.properties` 中读取：

```bash
API_KEY=$(grep 'api.key=' .openproject/global.properties | cut -d= -f2)
BASE_URL=$(grep 'api.base_url=' .openproject/global.properties | cut -d= -f2)
```

`.openproject/global.properties` 路径定位优先级：
1. 工作区根目录：`<workspace>/.openproject/global.properties`
2. 用户主目录：`~/.openproject/global.properties`

### 认证方式

所有请求使用 Basic Auth：`-u "apikey:$API_KEY"`

### 创建工作包

```bash
curl -s -X POST "https://openproject.yamibuy.net/api/v3/projects/{project_identifier}/work_packages" \
  -H "Content-Type: application/json" \
  -u "apikey:$API_KEY" \
  -d '{
    "subject": "标题",
    "description": {"format": "markdown", "raw": "描述内容"},
    "startDate": "2026-04-10",
    "customField11": "202615",
    "_links": {
      "type": {"href": "/api/v3/types/1"},
      "assignee": {"href": "/api/v3/users/359"},
      "parent": {"href": "/api/v3/work_packages/33800"},
      "customField1": [{"href": "/api/v3/custom_options/6"}],
      "customField9": {"href": "/api/v3/users/31"},
      "customField16": {"href": "/api/v3/users/359"},
      "customField19": {"href": "/api/v3/custom_options/45"},
      "customField54": {"href": "/api/v3/custom_options/242"},
      "customField126": [{"href": "/api/v3/custom_options/656"}]
    }
  }'
```

### HAL+JSON 格式要点

- **标量字段**（subject、description、startDate、customField11 等文本/日期字段）放在 JSON 根级别
- **资源引用字段**（type、project、assignee、parent、以及选项/用户类型的 customField）放在 `_links` 中，值为 `{"href": "/api/v3/..."}`
- **数组类型的选项字段**（如 customField1、customField126）用数组格式：`[{"href": "..."}]`
- **description** 必须是对象格式：`{"format": "markdown", "raw": "内容"}`

### 查询工作包

```bash
curl -s "https://openproject.yamibuy.net/api/v3/work_packages/{id}" -u "apikey:$API_KEY"
```

### 更新工作包

```bash
curl -s -X PATCH "https://openproject.yamibuy.net/api/v3/work_packages/{id}" \
  -H "Content-Type: application/json" \
  -u "apikey:$API_KEY" \
  -d '{"lockVersion": N, "subject": "新标题"}'
```

### 搜索工作包

```bash
curl -s "https://openproject.yamibuy.net/api/v3/work_packages?filters=[{\"subject\":{\"operator\":\"~\",\"values\":[\"关键词\"]}}]" \
  -u "apikey:$API_KEY"
```

### 列出用户

```bash
curl -s "https://openproject.yamibuy.net/api/v3/users?filters=[{\"name\":{\"operator\":\"~\",\"values\":[\"moc\"]}}]" \
  -u "apikey:$API_KEY"
```

## 快速参考（REST API 端点）

| 操作 | 方法 | 端点 |
|------|------|------|
| 列出项目 | GET | `/api/v3/projects` |
| 获取项目 | GET | `/api/v3/projects/{id}` |
| 列出工作包 | GET | `/api/v3/work_packages?filters=...` |
| 获取工作包 | GET | `/api/v3/work_packages/{id}` |
| 创建工作包 | POST | `/api/v3/projects/{id}/work_packages` |
| 更新工作包 | PATCH | `/api/v3/work_packages/{id}` |
| 删除工作包 | DELETE | `/api/v3/work_packages/{id}` |
| 列出用户 | GET | `/api/v3/users` |
| 列出状态 | GET | `/api/v3/statuses` |
| 列出类型 | GET | `/api/v3/types` |

## 常用类型速查表

| ID | 类型名称 | 适用场景 | Schema 参考 |
|----|----------|----------|-------------|
| 1 | Task | 日常任务、小需求 | `references/type-task.md` |
| 6 | User Story | 用户故事 | `references/type-user-story.md` |
| 7 | Bug | 缺陷修复 | `references/type-bug.md` |
| 4 | Feature | 功能需求 | `references/type-feature.md` |
| 8 | Project | 项目级工作包（默认） | `references/type-project.md` |
| 9 | Requirement | 需求 | `references/type-requirement.md` |
| 23 | QA-Task | QA 测试任务 | `references/type-qa-task.md` |
| 49 | Incident | 线上事故 | `references/type-incident.md` |
| 2 | Milestone | 里程碑 | `references/type-milestone.md` |
| 24 | Release | 发布（里程碑） | `references/type-release.md` |

用户可通过名称或 ID 指定类型，如"创建一个 Bug"、"类型 Task"、"type_id=7"。

## 常用状态速查表（Project 类型）

| ID | 状态名称 | 说明 |
|----|----------|------|
| 1 | New | 新建（默认） |
| 4 | Confirmed | 已确认 |
| 5 | To be scheduled | 待排期 |
| 6 | Scheduled | 已排期 |
| 7 | In progress | 进行中 |
| 9 | In testing | 测试中 |
| 13 | On hold | 暂停 |
| 14 | Rejected | 已拒绝（已关闭） |
| 15 | Done | 已完成（已关闭） |
| 116 | In Acceptance | 验收中 |
| 16 | Launched | 已上线 |
| 12 | Closed | 已关闭（已关闭） |

不同工作包类型可用的状态不同，以上为 Project 类型的状态流转。其他类型可通过 `list-statuses` 查询。
用户可通过名称或 ID 指定状态，如"改成 In progress"、"状态改为 7"。

## 核心流程：创建工作包

### 步骤 1: 确定类型

- 用户明确说了类型名称或 ID → 使用对应类型
- 用户未指定类型 → 读取 `global.properties` 中的 `default.type.id` 和 `default.type.name` 作为默认类型
- 如果 `global.properties` 不存在或未配置 `default.type` → **必须停下来询问用户，禁止自行推断或猜测类型**：

> ⚠️ 你还没有设置默认工作包类型，请选择一个：
>
> | ID | 类型 | 适用场景 |
> |----|------|----------|
> | 1 | Task | 日常任务、小需求 |
> | 4 | Feature | 功能需求 |
> | 6 | User Story | 用户故事 |
> | 7 | Bug | 缺陷修复 |
> | 8 | Project | 项目级工作包 |
> | 9 | Requirement | 需求 |
>
> 回复类型名称或 ID 即可，选择后会保存为默认类型。

**⛔ 严格要求：用户未回复前，不得继续后续步骤。不得根据用户描述内容推断类型。**

用户选择后，将 `default.type.id` 和 `default.type.name` 写入 `global.properties`（文件不存在则仅写入这两项，其余字段等步骤 2a 初始化时补全）。

### 步骤 2: 检查配置文件

确定类型后，检查 `.openproject/` 下两个配置文件：

1. `global.properties` — 不存在则要求初始化（步骤 2a）
2. `config-{type}.properties` — 不存在则要求该类型的 demo OP（步骤 2b）

两个文件都存在 → 跳到步骤 3。

配置文件结构和提取规则详见 `references/config-guide.md`。

#### 步骤 2a: 初始化全局配置

> ⚠️ 首次使用需要初始化配置。
>
> 请提供一个你之前创建的 OP 链接作为模板，例如：
> `https://openproject.yamibuy.net/projects/tech-team/work_packages/26500`

从 demo OP 提取公共字段生成 `global.properties`。若该 demo OP 类型恰好是目标类型，一并生成 `config-{type}.properties`。

#### 步骤 2b: 初始化类型配置

> ⚠️ 你还没有 {类型名} 类型的默认配置。
>
> 请提供一个 {类型名} 类型的 OP 链接作为模板。

### 步骤 3: 组装参数并预览

1. 读取 `global.properties` 获取用户信息
2. 读取 `config-{type}.properties` 获取类型默认字段
3. 读取 `references/type-{type}.md` 获取必填字段列表和创建示例
4. 动态计算周数 customField11（格式 `YYYYWW`，通过 shell 获取当前时间计算）
5. **日期默认值**：如果用户未指定以下日期字段，默认填充当前日期（格式 `YYYY-MM-DD`，通过 shell 获取）：
   - `start_date`（开始日期）
   - `customField92`（Tech confirmed time）
6. 用户描述中提到的字段覆盖默认值

**⛔ 组装参数时，必须遍历 `config-{type}.properties` 中所有有值的字段，全部纳入创建参数。不得遗漏任何配置中有值的字段（如 tech_confirmed_time、designer、dept 等）。**

展示预览表格时，**必须列出所有将要提交的字段**（包括必填字段、配置中有值的可选字段、用户指定的字段），确保用户能完整审查。

**必须等待用户明确回复"是"或"创建"后才能调用 MCP 创建工作包。**

### 步骤 4: 创建工作包

按 `references/type-{type}.md` 中的创建示例格式组装 HAL+JSON 参数，通过 curl 调用 REST API 创建。

- custom_fields 中只包含：必填字段 + 用户指定字段 + 配置中有值的可选字段
- 周数 (customField11) 每次动态计算，格式 YYYYWW
- 里程碑类型（Milestone/Release）使用 `date` 字段，不是 `start_date`/`due_date`

返回创建成功的工作包 ID 和链接。

## 描述格式规范

创建工作包时，`description` 字段是**必填项**（最少 10 个字符），使用 Markdown 格式。

**⛔ 如果用户没有提供描述内容，不要询问用户，直接根据标题和用户提供的上下文自动生成描述。** 生成规则：
1. 优先参考对应 `references/type-{type}.md` 中的"描述格式规范"模板
2. 如果上下文信息不足以生成详细描述，用标题内容扩展为一段简短描述即可
3. 生成的描述在预览表格中展示，用户确认后创建

每种类型有不同的推荐模板，详见对应的 `references/type-{type}.md` 中的"描述格式规范"章节。

## 关键规则

1. **配置分层**：全局配置存用户信息，类型配置存该类型的默认自定义字段
2. **按需初始化**：只在缺少配置时要求用户提供 demo OP，不阻塞其他操作
3. **确认创建**：调用 REST API 创建前，必须展示预览并等待用户明确确认
4. **周数动态计算**：customField11 每次创建时通过 shell 获取当前时间计算，格式 `YYYYWW`
5. **类型文档优先**：创建参数以 `references/type-*.md` 为准，配置文件提供默认值
6. **里程碑特殊处理**：Milestone (2) 和 Release (24) 使用 `date` 字段
7. 用户回复"重置配置"时，删除对应配置文件并重新要求提供 demo OP

## 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 缺少必填字段 | 未读取 type reference 文档 | 读取 `references/type-{type}.md` 确认必填字段 |
| 配置中有值的可选字段被遗漏 | 组装参数时未遍历配置文件所有字段 | 遍历 `config-{type}.properties` 所有有值字段，全部纳入 |
| Dept./Topic 等选项字段报 ResourceTypeMismatch | 被错误当成用户类型字段 | 确认字段类型，选项字段不要设 `is_user` |
| 自定义字段 ID 错误 | 使用了名称而非 ID | 从配置文件或 `_links` href 中提取数字 ID |
| 里程碑创建失败 | 使用了 start_date/due_date | Milestone/Release 使用 `date` 字段 |
| 周数格式错误 | 硬编码或格式不对 | 通过 shell 动态计算，格式 `YYYYWW` |

## 参考文档

references/ 目录路径定位优先级：
1. 工作区级别：`<workspace>/.kiro/skills/manage-openproject/references/`
2. 用户全局级别：`~/.kiro/skills/manage-openproject/references/`

工作区优先，找到即停止。按需读取，不预加载到上下文。

| 场景 | 参考文档 |
|------|----------|
| 配置文件结构与字段映射 | `references/config-guide.md` |
| Task 类型 Schema | `references/type-task.md` |
| Bug 类型 Schema | `references/type-bug.md` |
| Feature 类型 Schema | `references/type-feature.md` |
| User Story 类型 Schema | `references/type-user-story.md` |
| Project 类型 Schema | `references/type-project.md` |
| Requirement 类型 Schema | `references/type-requirement.md` |
| QA-Task 类型 Schema | `references/type-qa-task.md` |
| Incident 类型 Schema | `references/type-incident.md` |
| Milestone 类型 Schema | `references/type-milestone.md` |
| Release 类型 Schema | `references/type-release.md` |
