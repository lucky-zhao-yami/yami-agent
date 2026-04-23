---
name: "pr-create"
description: "当需要创建 PR、推送分支、提交代码到远程仓库时使用。触发词：pr, pull request, 创建pr, push pr, git push, 提交代码"
---

# PR 创建助手

基于 GitHub CLI (`gh`) 一键完成提交、推送、创建 PR 的工作流。

## 前置条件

1. GitHub CLI 已安装：`gh --version`
2. 已登录 GitHub：`gh auth status`

**如果未登录 GitHub：**
```powershell
gh auth login
```

## 核心数据来源

| 来源 | 用途 |
|------|------|
| `gh api` | 获取仓库默认分支、分支差异 |
| `git status` | 检查本地变更状态 |
| `git log` | 获取提交记录 |
| `gh pr create` | 创建 Pull Request |
| `openproject` MCP | 将 PR 链接回写到 OP 工作包 |

## 仓库配置

仓库列表从当前工作区的 `workspace-projects.json` 读取。

```json
{
  "projects": [
    {
      "name": "seller-service",
      "path": "D:/projects/seller-service",
      "description": "卖家核心业务服务",
      "tags": ["java", "spring-boot"],
      "scope": ["pr-create", "pr-publish", "review-code-changes"]
    }
  ]
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | 项目唯一标识，同时作为显示别名 |
| `path` | 是 | 本地仓库绝对路径 |
| `description` | 否 | 项目描述 |
| `tags` | 否 | 标签数组 |
| `scope` | 否 | skill name 白名单数组，未定义或空数组表示对所有 skills 可见 |

运行时通过 `git -C <path> remote -v` 动态提取 `owner` 和 `repo`，无需在配置中硬编码。

## 核心流程

### Step 1: 读取仓库配置

从当前工作区的 `workspace-projects.json` 读取项目列表。

如果文件不存在，阅读 `switch-workspace` 技能的"自动生成 workspace-projects.json"章节，按其流程生成配置文件后再继续。

**scope 过滤**：只保留 `scope` 未定义、为空数组、或包含 `"pr-create"` 的项目，忽略其余项目。

对每个项目，通过 `git -C <path> remote -v` 动态提取 `owner` 和 `repo`。

### Step 2: 扫描分支状态

对每个配置的仓库，进入其本地 `path` 执行：

```powershell
git branch --show-current
git status --porcelain
git log master..HEAD --oneline --no-merges
git diff master --stat
```

筛选出非 master/main 分支的仓库。

### Step 3: 展示扫描结果

```
📋 非 master 分支的项目列表：

【seller-service】 分支: OP-31617
  提交: 3 个 | 变更: +150/-20 | 文件: 5 个
  未提交变更: 2 个文件

【ec-payment】 分支: feature-pay
  提交: 1 个 | 变更: +80/-25 | 文件: 3 个

---
请选择要创建 PR 的仓库（输入序号，多个用逗号分隔，如：1,2）
或输入 'all' 为所有仓库创建 PR
```

**⚠️ 重要：此时必须停下来等待用户选择。**

### Step 4: Review 检查（前置门禁）

创建 PR 前，必须确认代码已通过 review。对用户选择的每个仓库：

1. 检查 `git_logs/[服务名]_review.md` 是否存在
2. 根据检查结果决定下一步：

| 情况 | 处理方式 |
|------|----------|
| review 文件不存在 | 激活 `review-code-changes` 技能执行代码审查，等待审查完成后再继续 |
| 存在未处理的 P0/P1 问题（`[ ]` 状态） | 列出未处理的 P0/P1 问题，阻断流程，要求用户先处理 |
| P0/P1 全部已处理（`[x]`/`[-]`/`[?]`） | 通过检查，继续下一步 |

**展示格式（存在未处理问题时）：**

```
⛔ Review 门禁未通过：

【seller-service】git_logs/seller-service_review.md
  未处理 P0: 1 个, P1: 2 个
  - [ ] #1 [OrderService.java:45] SQL 注入风险 (P0)
  - [ ] #3 [PaymentController.java:120] 缺少权限校验 (P1)

请先处理以上问题后再创建 PR。
可选操作：
1. 修复问题后重新运行
2. 标记为 [-] Won't fix（需注明原因）
3. 标记为 [?] Needs discussion
```

**⚠️ 重要：P0/P1 未处理时必须阻断，不允许跳过直接创建 PR。**

### Step 5: 提交并推送代码

对用户选择的每个仓库，进入其本地 `path` 执行：

```powershell
git add .
git commit -m "<message>"
git push -u origin <branch>
```

**Commit Message 规则：**
- 从分支名提取 OP 号（如有），格式：`[OP-31617] <描述>`
- 无 OP 号时，基于变更内容生成描述

### Step 6: 创建 PR

```powershell
gh pr create -R <owner>/<repo> --title "[<branch>] <title>" --body "<body>"
```

**PR 标题格式：**
- `[OP-31617] feat: 新增订单校验功能`
- `[feature-pay] 优化支付流程`

**PR 描述格式：**

```markdown
## OP 链接
https://openproject.yamibuy.net/work_packages/<OP编号>

## 变更摘要
- 要点1
- 要点2

## 测试计划
- [ ] 测试项1
```

### Step 7: 展示创建结果

```
✅ PR 创建完成：

【seller-service】
  PR #124: [OP-31617] feat: 新增订单校验功能
  URL: https://github.com/yamibuy/seller-service/pull/124

【ec-payment】
  PR #90: [feature-pay] 优化支付流程
  URL: https://github.com/yamibuy/ec-payment/pull/90
```

### Step 8: 更新 PR 链接至 OP

PR 创建成功后，对含有 OP 号的仓库，自动将 PR 链接回写到对应的 OP 工作包。

**触发条件：** 分支名中包含 OP 号（如 `OP-31617`）

**操作方式：** 使用 `openproject` MCP 的 `mcp_openproject_openproject_update_work_package` 工具，将 PR 链接追加到工作包的描述（description）中。

**流程：**

1. 从分支名提取 OP 编号（如 `31617`）
2. 调用 `mcp_openproject_openproject_get_work_package` 获取当前工作包详情，读取现有 description
3. 在 description 末尾追加 PR 链接区块（避免重复追加）：
   ```markdown
   ## PR 链接
   - [<repo>#<pr_number>](<pr_url>)
   ```
4. 调用 `mcp_openproject_openproject_update_work_package` 更新 description

**展示结果：**

```
🔗 OP 已更新：

【seller-service】OP-31617 → 已添加 PR #124 链接
【ec-payment】无 OP 号，跳过
```

**注意事项：**
- 如果 description 中已存在相同 PR 链接，跳过更新
- 如果 OP 工作包不存在或无权限更新，记录警告并继续，不阻断流程
- 无 OP 号的仓库直接跳过此步骤

## OP 号提取规则

从分支名提取 OP 号：

| 分支名 | 提取结果 |
|--------|----------|
| `OP-31617` | `31617` |
| `feature/OP-31617-order-validation` | `31617` |
| `feature-payment` | 无 OP 号，显示分支名 |

## PR 描述生成规则

**数据来源优先级：**

| 优先级 | 数据来源 | 用途 |
|--------|----------|------|
| 1 | `git diff master --name-status` | 分析变更的文件列表 |
| 2 | `git log master..HEAD --oneline` | 提交记录中的变更说明 |
| 3 | `git diff master --stat` | 变更统计（增删行数） |

## 常用 gh 命令

| 命令 | 说明 |
|------|------|
| `gh pr create -R owner/repo --title "title" --body "body"` | 创建 PR |
| `gh pr list -R owner/repo --state open` | 列出打开的 PR |
| `gh pr view <number> -R owner/repo` | 查看 PR 详情 |
| `gh api user --jq '.login'` | 获取当前登录用户名 |
| `gh auth status` | 检查登录状态 |

## 关键规则

1. **必须等待用户选择** - 展示项目列表后，等待用户输入要创建 PR 的仓库
2. **Review 门禁** - 创建 PR 前必须通过 review 检查，P0/P1 未处理时阻断流程；无 review 文件时自动触发 `review-code-changes`
3. **OP 号从分支名提取** - 格式为 `OP-31617` → `31617`
4. **PR 创建后更新 OP** - PR 创建成功后，必须将 PR 链接回写到对应的 OP 工作包描述中（通过 openproject MCP）
5. **网络要求** - 需要能访问 GitHub API 和 OpenProject API
6. **权限要求** - 需要有仓库的写入权限和 OP 工作包的编辑权限
7. **配置文件位置** - `workspace-projects.json` 在当前工作区根目录

## Troubleshooting

| 错误 | 解决方案 |
|------|----------|
| `gh: command not found` | `winget install GitHub.cli` |
| `authentication required` | `gh auth login` |
| `Could not resolve to a Repository` | 确认仓库名称正确且有写入权限 |
| `git push` 失败 | 检查远程仓库：`git remote -v` |
| 所有仓库都在 master 分支 | 无需创建 PR |
| Review 门禁未通过 | 先处理 `git_logs/[服务名]_review.md` 中的 P0/P1 问题，或标记为 `[-]`/`[?]` |
| Review 文件不存在 | 自动触发 `review-code-changes` 技能执行审查 |
| OP 工作包更新失败 | 确认 OpenProject MCP 已配置且有编辑权限 |
