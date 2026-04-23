---
name: code-branch-diff
description: "当需要对比分支代码差异、查看代码变更、分析提交记录、生成 diff 报告时使用。触发词：diff, 代码对比, 分支差异, git diff, 代码变更"
---

# 代码分支对比器

自动扫描工作区中的 Git 仓库，对比当前分支与 master 分支的代码差异，生成详细的对比报告。

**项目扫描方式：** 优先从 `*.code-workspace` 文件读取项目列表，如果不存在则回退到扫描目录下的 Git 项目。

## 脚本位置

代码对比脚本：`scripts/code_diff_generator.py`（相对于本 SKILL.md 所在目录）

```powershell
python scripts/code_diff_generator.py <workspace_path> -o <workspace_path>/git_logs
```

输出目录：`<workspace_path>/git_logs/`

## 调用示例

```powershell
# 基本用法
python scripts/code_diff_generator.py "D:\workspace" -o "D:\workspace\git_logs"

# 使用默认输出目录
python scripts/code_diff_generator.py "D:\workspace"
```

## 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| `workspace` | 是 | 工作区路径，包含多个 Git 仓库的目录 |
| `-o, --output` | 否 | 输出目录，默认为工作区下的 `git_logs` 目录 |

## 输出文件

| 文件 | 说明 |
|------|------|
| `[服务名]_branch.txt` | 当前分支名称 |
| `[服务名]_commits.txt` | 相对于 master 的提交记录 |
| `[服务名]_diff_stat.txt` | 变更统计（文件数、增删行数） |
| `[服务名]_diff_files.txt` | 变更文件列表（新增/修改/删除） |
| `[服务名]_full_diff.txt` | 完整的代码差异内容 |

## 核心函数

| 函数 | 说明 |
|------|------|
| `find_workspace_file()` | 使用 glob 查找 `*.code-workspace` 文件 |
| `scan_projects_from_workspace()` | 解析 workspace 文件，提取项目路径列表 |
| `scan_git_in_directory()` | 扫描目录下的 Git 项目 |
| `get_current_branch()` | 获取仓库当前分支名 |
| `get_commits_diff()` | 获取相对于 master 的提交记录 |
| `get_diff_stat()` | 获取变更统计 |
| `get_diff_files()` | 获取变更文件列表 |
| `get_full_diff()` | 获取完整的代码差异内容 |

## 执行流程

1. 查找工作区文件 - 扫描 `*.code-workspace` 文件
2. 读取项目列表 - 从 workspace 文件的 `folders` 配置读取
3. 清空输出目录
4. 获取分支信息
5. 筛选非 master 分支
6. 收集差异信息 - 执行 git diff/log 命令
7. 输出报告 - UTF-8 编码文本文件

**回退机制：** 未找到 `.code-workspace` 文件时，自动扫描包含 `.git` 的子目录。

## Troubleshooting

| 错误 | 解决方案 |
|------|----------|
| git: command not found | 安装 Git 并添加到 PATH |
| fatal: not a git repository | 确保目录包含 `.git` 文件夹 |
| master branch not found | 检查仓库是否使用 main 作为主分支 |

## 注意事项

1. 优先从 `*.code-workspace` 文件读取项目列表
2. 确保系统已安装 Git 并配置在 PATH 中
3. 仓库必须有 master 分支才能进行对比
4. 所有输出文件使用 UTF-8 编码
