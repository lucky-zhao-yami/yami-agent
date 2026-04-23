---
name: apollo-config-sync
description: "当需要同步 Apollo 配置、拉取微服务配置、查看远程配置到本地时使用。触发词：apollo, 配置同步, 拉取配置, app.id"
---

# Apollo 配置同步工具

自动扫描工作区 Java 项目的 `application.properties` 文件，提取 `app.id` 配置项，从亚米 Apollo 配置中心拉取对应配置到本地。

## 功能

- 自动解析 `*.code-workspace` 文件获取多工作区项目路径
- 扫描所有工作区文件夹中的 Java 项目 `app.id`
- 从 Apollo 配置中心拉取配置（固定使用亚米 Apollo 地址）
- JSON 转 Properties 格式
- 配置文件输出到 `apollo_config/{app.id}.properties`

## 脚本位置

配置同步脚本：`scripts/pull_apollo_configs.ps1`（相对于本 SKILL.md 所在目录）

```powershell
& scripts/pull_apollo_configs.ps1 -WorkspacePath <workspace_path>
```

输出目录：`<workspace_path>/apollo_config/`

## 调用示例

```powershell
# 自动扫描工作区（会解析 .code-workspace 文件）
& scripts/pull_apollo_configs.ps1 -WorkspacePath "D:\workspace"

# 直接指定 app.id 列表
& scripts/pull_apollo_configs.ps1 -WorkspacePath "D:\workspace" -AppIds "ec-so-service","ec-customer-service"

# 指定输出目录
& scripts/pull_apollo_configs.ps1 -WorkspacePath "D:\workspace" -OutputDir "my_config"
```

## 参数说明

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| WorkspacePath | string | 是 | - | 工作区路径，配置文件输出到此目录下 |
| OutputDir | string | 否 | `apollo_config` | 配置文件输出目录名 |
| AppIds | string[] | 否 | - | 直接指定 app.id 列表，跳过自动扫描 |

## 扫描逻辑

1. 查找 WorkspacePath 下的 `*.code-workspace` 文件
2. 解析 JSON 获取 `folders` 数组中的所有项目路径
3. 扫描每个项目路径下的 `src/main/resources/application.properties`
4. 提取 `app.id` 配置项并去重

## 核心函数

| 函数 | 作用 |
|------|------|
| `Get-WorkspaceFolders` | 解析 .code-workspace 文件获取项目路径列表 |
| `Find-AppIds` | 扫描指定路径下的 Java 项目，提取 app.id |
| `Get-ApolloConfig` | 从 Apollo 获取指定 AppId 的配置 |
| `ConvertTo-Properties` | 将 JSON 配置转换为 Properties 格式 |

## 执行流程

1. 解析 `*.code-workspace` 文件获取所有项目路径
2. 扫描每个项目的 `application.properties` 提取 `app.id`
3. 去重后逐个从 Apollo 拉取配置
4. 转换为 Properties 格式并保存到输出目录

## 输出文件

配置文件保存在 `{WorkspacePath}/apollo_config/` 目录下：
- `{app.id}.properties` - 对应服务的 Apollo 配置

## 注意事项

1. Apollo 地址固定为 `https://apollo-configservice.yamibuy.net`
2. 配置文件可能包含敏感信息，请妥善保管
3. 脚本执行间隔 200ms 避免请求过快
4. 自动去重，同一 app.id 只拉取一次
