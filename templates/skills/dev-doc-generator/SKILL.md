---
name: dev-doc-generator
description: "当需要生成开发发布文档、查看多仓库代码变更、生成技术变更报告、准备上线文档时使用。触发词：dev doc, 开发文档, 发布文档, 代码变更, 技术文档"
---

# 开发文档生成器

自动扫描工作区中的 Git 仓库，对比当前分支与 master 分支的代码差异，生成面向开发人员的发布文档。

## 执行步骤

### 1. 激活 code-branch-diff Skill

执行分支对比，获取代码差异。

### 2. 读取对比结果

读取 `git_logs` 目录下的文件：
- `*_branch.txt` - 分支名称
- `*_diff_stat.txt` - 变更统计
- `*_diff_files.txt` - 变更文件列表
- `*_full_diff.txt` - 完整代码差异
- `*_remote_name.txt` - 远程仓库名称

### 3. 筛选有效仓库

**无变更仓库处理**：
- 如果仓库当前分支是 `master`，跳过该仓库
- 如果非master分支但没有变更（diff为空），在文档中标注"无变更"
- 只有存在非master分支且有变更的仓库，才纳入文档

### 4. 分析代码变更

**判断项目类型**：
- 前端项目：包含 `package.json`、`vue.config.js`、`vite.config.js` 等
- 后端项目：包含 `pom.xml`、`build.gradle`、`*Mapper.xml` 等

**后端项目重点分析**：
- 接口变更（Controller层）
- 数据库变更（Mapper/SQL）
- 配置变更（Apollo/CMS Config）
- Redis Key变更
- 定时任务变更
- MQ消息变更
- 跨服务调用关系

**前端项目重点分析**：
- 页面/组件变更
- 路由变更
- API调用变更
- 状态管理变更
- 依赖变更
- 构建配置变更

### 5. 提取SQL语句和表权限信息（仅后端项目）

1. 筛选 `*Mapper.xml` 文件
2. 提取新增或修改的SQL语句
3. 解析涉及的表名和权限需求

### 6. 生成开发发布文档

按模板生成markdown文档，保存到工作空间根目录。

## 文件名格式规范

- 格式：`[分支号] [功能标题].md`
- 示例：`feature-123 优化订单查询性能.md`
- 如果多个服务使用不同分支，使用主要分支号或用下划线连接多个分支号
- 保存位置：工作空间根目录

## 文档模板结构

```markdown
# [分支号] [功能标题] - 开发文档

## 📋 基本信息
- **生成时间**: [YYYY-MM-DD HH:MM:SS]
- **涉及服务**: [N个]
- **主要分支**: [主分支号]

## 🔧 服务分支信息
| 服务名称 | 当前分支 | 变更文件数 |
|---------|---------|----------|
| [远程仓库名称] | [[分支名]](https://github.com/yamibuy/[远程仓库名称]/pulls?q=is:pr+head:[分支名]) | X |

---

## 🔄 代码变更详情

### [远程仓库名称1]
**功能概述**: [一句话说明本次变更的核心功能]

**变更要点**:
- **接口变更**: `[HTTP方法] [接口路径]` - [功能说明]
- **定时任务**: `[任务类名]` - [执行逻辑]
- **MQ消息**: `[队列名/类名]` - [消息处理逻辑]
- **数据库**: [涉及的表和操作类型]

---

## ⚙️ 配置变更

### [远程仓库名称1]

#### Apollo配置
```properties
# 配置说明：[说明配置的用途和影响]
config.key1=value1
config.key2=value2
```

#### CMS/Config配置
```properties
# 配置说明：[说明配置的用途和影响]
config.key1=value1
```

#### Redis Key变更
```
# Key说明：[说明Key的用途和影响范围]
redis:key:pattern:*
redis:another:key
```

---

## 🗄️ SQL语句变更

> 从 Mapper XML 文件中提取新增或修改的 SQL 语句

### [远程仓库名称1]

#### 新增SQL
```sql
-- Mapper文件: XxxMapper.xml
-- 方法: selectXxx
SELECT id, name, status FROM table_name WHERE condition = #{param}
```

#### 修改SQL
```sql
-- Mapper文件: XxxMapper.xml  
-- 方法: updateXxx
-- 变更说明: [说明修改了什么]
UPDATE table_name SET column1 = #{value1} WHERE id = #{id}
```

---

## 🔐 表权限检查

> 上线前需确认以下表的查询/写入权限，避免权限不足导致报错

| 表名 | 操作类型 | 涉及服务 | 备注 |
|-----|---------|---------|------|
| table_name_1 | SELECT | [服务名] | [用途说明] |
| table_name_2 | INSERT/UPDATE | [服务名] | [用途说明] |
| table_name_3 | DELETE | [服务名] | [用途说明] |

**权限申请checklist**:
- [ ] 确认所有新增表的读权限
- [ ] 确认所有写操作表的写权限
- [ ] 确认跨库查询的权限配置

---

## 🔗 服务依赖关系

[如果涉及跨服务调用，用简单的流程说明]

```
服务A → 服务B → 服务C
```

---

## 🚀 部署注意事项

1. **配置准备**: [需要提前配置的Apollo/CMS项]
2. **部署顺序**: [如果有依赖关系，说明部署先后顺序]
3. **数据迁移**: [需要执行的SQL脚本或数据处理]
4. **回滚方案**: [出现问题时的回滚步骤]
```

## 服务分支信息表格规范

| 服务名称 | 当前分支 | 变更文件数 |
|---------|---------|----------|
| [远程仓库名称] | [[分支名]](https://github.com/yamibuy/[远程仓库名称]/pulls?q=is:pr+head:[分支名]) | X |

**分支名必须生成为超链接**，格式：`[分支名](https://github.com/yamibuy/服务名/pulls?q=is:pr+head:分支名)`

## 配置变更分类

配置变更必须按类型分开展示：

| 配置类型 | 说明 | 示例文件 |
|---------|------|---------|
| Apollo配置 | 动态配置中心 | application.yml 中的 apollo 相关 |
| CMS/Config配置 | 业务配置 | ConfigService/LangConfigService |
| Redis Key | 缓存键 | RedisKey 常量类 |
| SQL变更 | DDL语句 | ALTER TABLE / CREATE INDEX |

## 无变更仓库处理

- **master分支仓库**：不在服务分支信息表格中列出
- **非master但无变更**：在文档中标注"无变更"
- **所有仓库都在master**：提示用户"所有仓库都在master分支，没有需要生成文档的内容"

## 注意事项

1. 使用 code-branch-diff Skill 自动收集 git 差异信息
2. 服务分支信息表格中的分支名必须生成为超链接
3. SQL语句和表权限必须清晰列出（仅后端项目）
4. 配置变更必须按 Apollo/CMS/Redis 分类展示
5. 使用中文生成所有内容
6. git_logs目录会保留，方便开发人员后续review

**依赖:** code-branch-diff Skill
