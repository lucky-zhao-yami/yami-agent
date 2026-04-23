---
name: "pr-publish"
description: "当需要生成发布邮件、填写上线通知、查看 PR 合并记录、扫描 GitHub 仓库已合并 PR 时使用。触发词：发布邮件, 上线通知, PR合并, release, 发布TAG, 回滚TAG, Google Sheets 模板, gh pr list"
---

# PR 发布邮件助手

基于 GitHub CLI (`gh`) 查询仓库已合并 PR，生成发布内容并填充 Google Sheets 发布模板。

## 前置条件

1. GitHub CLI 已安装：`gh --version`
2. 已登录 GitHub：`gh auth status`
3. 有 Google Sheets 模板的编辑权限

**如果未登录 GitHub：**
```powershell
gh auth login
```

## 核心数据来源

| 来源 | 用途 |
|------|------|
| `gh pr list` | 获取已合并的 PR 列表 |
| `gh pr view` | 获取 PR 详情（文件变更、提交记录） |
| `gh release list` | 获取发布 TAG 和回滚 TAG |
| OpenProject | 补充 OP 需求标题（可选） |

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

**scope 过滤**：只保留 `scope` 未定义、为空数组、或包含 `"pr-publish"` 的项目，忽略其余项目。

对每个项目，通过 `git -C <path> remote -v` 动态提取 `owner` 和 `repo`。

### Step 2: 扫描已合并的 PR

对每个配置的仓库执行：

```powershell
gh pr list -R <owner>/<repo> --state merged --limit 20 --json number,title,headRefName,mergedAt,mergedBy,additions,deletions
```

### Step 3: 展示 PR 列表

```
📋 最近合并到 master 的 PR 列表：

【seller-service】
#123 | OP-31617 | 2025-01-08 | feat: 新增订单校验功能 (+150/-20)
#120 | OP-31500 | 2025-01-05 | fix: 修复积分计算bug (+30/-10)

【ec-payment】
#89 | feature-pay | 2025-01-07 | 优化支付流程 (+80/-25)

---
请输入您要发布的 PR 号（多个用逗号分隔，如：seller#123,payment#89）
或输入 'all' 发布所有 PR
```

**⚠️ 重要：此时必须停下来等待用户输入。**

### Step 4: 获取选中 PR 的详情

```powershell
gh pr view <pr_number> -R <owner>/<repo> --json title,body,files,commits,additions,deletions
```

### Step 5: 获取发布 TAG 和回滚 TAG

```powershell
gh release list -R <owner>/<repo> --limit 2 --json tagName,publishedAt,isLatest
```

**TAG 规则：**
- **发布 TAG**：`isLatest: true` 的 tagName
- **回滚 TAG**：第二个 tagName（上一个版本）

**如果仓库没有 Release，尝试获取 Git Tag：**
```powershell
gh api repos/<owner>/<repo>/tags --jq '.[0:2] | .[] | .name'
```

### Step 6: 生成发布内容

基于 PR 的 `files` 和 `body` 字段，总结发布内容。

### Step 7: 补充 OP 信息（可选）

如果 PR 分支名包含 OP 号（如 `OP-31617`），调用 OpenProject 获取需求标题。

### Step 8: 填充 Google Sheets 发布模板

**模板地址**: `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}`
**Sheet名称**: `上线通知模板`

填充内容：
- **C9**: 发布人（GitHub 用户名）
- **A10:C10**: 系统名称、发布TAG、回滚TAG
- **A11**: 发布内容

### Step 9: 更新 OP 状态为 Launched

Google Sheets 模板填充完成后，自动将本次发布涉及的所有 OP 状态更新为 **Launched**（状态 ID: 16）。

**执行条件：** Step 7 中成功提取到 OP 号的 PR 才会执行此步骤。

**流程：**
1. 收集本次发布所有 PR 中提取到的 OP 号列表
2. 使用 `manage-openproject` 技能的 `update-work-package` 工具，逐个将 OP 状态更新为 Launched（status_id: 16）
3. 汇总更新结果

**输出示例：**
```
✅ OP 状态已更新为 Launched：
- OP-31617: 新增订单校验功能 → Launched ✅
- OP-31500: 修复积分计算bug → Launched ✅

⚠️ 以下 PR 无关联 OP，跳过状态更新：
- ec-payment#89 (分支: feature-pay)
```

**异常处理：**
- 如果 OP 当前状态不允许流转到 Launched，记录警告并继续处理下一个
- 如果 OpenProject MCP 不可用，提示用户手动更新并列出需要更新的 OP 链接

## 常用 gh 命令

| 命令 | 说明 |
|------|------|
| `gh pr list -R owner/repo --state merged --limit 20` | 列出已合并的 PR |
| `gh pr view <number> -R owner/repo --json files,commits` | 获取 PR 详情 |
| `gh release list -R owner/repo --limit 2 --json tagName,isLatest` | 获取最新的 Release TAG |
| `gh api repos/owner/repo/tags --jq '.[0:2]'` | 获取最新的 Git Tag（无 Release 时） |
| `gh api user --jq '.login'` | 获取当前登录用户名 |

## OP 号提取规则

从 PR 的 `headRefName`（分支名）提取 OP 号：

| 分支名 | 提取结果 |
|--------|----------|
| `OP-31617` | `31617` |
| `feature/OP-31617-order-validation` | `31617` |
| `feature-payment` | 无 OP 号，显示分支名 |

## 发布内容生成规则

**数据来源优先级：**

| 优先级 | 数据来源 | 用途 |
|--------|----------|------|
| 1 | `gh pr view --json files` | 分析变更的文件列表 |
| 2 | `gh pr view --json body` | PR 描述中的变更说明 |
| 3 | OpenProject OP 详情 | 补充需求标题 |

## 发布内容格式

```markdown
【seller-service】
- #123 OP-31617: 新增订单提交时的重复商品校验功能
- #120 OP-31500: 修复积分计算bug

【ec-payment】
- #89: 优化支付流程

发布相关OP地址：
https://openproject.yamibuy.net/work_packages/31617
https://openproject.yamibuy.net/work_packages/31500
```

## 关键规则

1. **必须等待用户选择** - 展示 PR 列表后，等待用户输入要发布的 PR 号
2. **OP 号从分支名提取** - 格式为 `OP-31617` → `31617`
3. **网络要求** - 需要能访问 GitHub API
4. **权限要求** - 需要有仓库的读取权限和 Google Sheets 的编辑权限
5. **配置文件位置** - `workspace-projects.json` 在当前工作区根目录
6. **自动更新 OP 状态** - Google Sheets 填充完成后，自动将关联 OP 状态改为 Launched（ID: 16），无需用户手动操作

## MCP 工具依赖

| 工具 | 说明 |
|------|------|
| `mcp_openproject_get_work_package` | 获取 OP 需求标题（可选） |
| `mcp_google_sheets_update_cells` | 更新 Google Sheets 单元格 |
| `mcp_openproject_update_work_package` | 更新 OP 状态为 Launched（Step 9） |

## Troubleshooting

| 错误 | 解决方案 |
|------|----------|
| `gh: command not found` | `winget install GitHub.cli` |
| `authentication required` | `gh auth login` |
| `Could not resolve to a Repository` | 确认仓库名称正确且有读取权限 |
| 获取不到最近的 PR | 增加 `--limit` 参数，如 `--limit 50` |
