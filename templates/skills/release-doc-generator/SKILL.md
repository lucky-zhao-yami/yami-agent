---
name: release-doc-generator
description: Generate test release documentation by comparing current branch changes against master across multiple Git repositories. Use this skill when preparing for testing, creating release notes, or documenting changes across multiple services. Automatically identifies changed repositories, analyzes code changes, and generates structured test documentation highlighting API changes, database modifications, configuration updates, and testing priorities.
---

# Release Documentation Generator

Automatically generate test-focused release documentation by analyzing Git changes across multiple repositories in the workspace.

## When to Use

- Preparing for QA testing
- Creating release notes for multiple services
- Documenting cross-service changes
- Generating test checklists

## Quick Start

User says: "生成测试发布文档" or "生成提测文档"

## Process Overview

### 1. Identify Changed Repositories

**Read cache first**: Check `workspace_git_projects.md` in workspace root
- If exists and valid → use cached list
- If missing → scan `.code-workspace` for Git projects

**Quick branch scan**: For each repository:
```bash
git branch --show-current > git_logs/<service>_branch.txt
```

**Filter**: Keep only non-master branches

**Early exit**: If all on master → skip to step 5

### 2. Merge Master (Non-master branches only)

For each non-master repository:
```bash
git fetch origin master
git merge origin/master
```

**Handle conflicts**:
- ✅ Success → continue
- ⚠️ Conflicts → pause, prompt user to resolve
- ❌ Failure → log and continue with others

### 3. Collect Changes (Non-master branches only)

For each non-master repository, save to `git_logs/`:

```bash
# Commits
git log master..HEAD --oneline --no-merges > <service>_commits.txt

# Stats
git diff master --stat > <service>_diff_stat.txt

# Files
git diff master --name-only > <service>_diff_files.txt

# Full diff
git diff master > <service>_full_diff.txt

# Remote name
git remote get-url origin | xargs basename -s .git > <service>_remote_name.txt
```

### 4. Analyze Changes

Focus on test-critical changes:
- **Controllers** → API testing
- **Mappers/SQL** → Data validation
- **Config files** → Configuration checks
- **Redis keys** → Cache validation
- **Scheduled tasks** → Job execution tests
- **MQ handlers** → Message flow tests
- **Cross-service calls** → Integration tests

#### ⚠️ 测试重点必须面向测试同学，不是开发

分析变更时，必须从后端代码**反向追踪到前端用户操作**：

**追踪链路**：`Controller 方法` → `接口 URL` → `哪个前端页面调用了这个接口` → `用户在页面上的具体操作`

#### 后端服务 → 前端项目映射表

根据变更的后端服务，查找对应的前端项目和页面区域：

**后台管理系统**（AngularJS，central-*-web）：

| 后端服务 | 前端项目 | 路径 | 典型页面 |
|---------|---------|------|---------|
| central-so-service | central-so-web | `/mnt/d/code/yami/central-so-web/` | 后台 → 订单管理（订单列表、订单详情、合并订单、财务） |
| central-rma-service | central-rma-web | `/mnt/d/code/yami/central-rma-web/` | 后台 → RMA管理（退货列表、退货详情、退款处理） |
| central-customer-service | central-crm-web | `/mnt/d/code/yami/central-crm-web/` | 后台 → 客户管理（客户列表、客户详情） |
| central-fp-service | central-fp-web | `/mnt/d/code/yami/central-fp-web/` | 后台 → FP管理（履约合作伙伴） |

**前台 PC 站**（Laravel 现版 + Next.js 新版迁移中）：

| 后端服务 | 前端项目 | 路径 | 典型页面 |
|---------|---------|------|---------|
| ec-so-service | ec-website-trade-nb (Laravel) / ec-website-next (Next.js) | `/mnt/d/code/yami/ec-website-trade-nb/` | 前台PC → 购物车、下单流程、支付 |
| ec-so-service | ec-website-customer-nb (Laravel) / ec-website-customer-next (Next.js) | `/mnt/d/code/yami/ec-website-customer-nb/` | 前台PC → 我的订单、订单详情 |
| ec-customer-service | ec-website-customer-nb / ec-website-customer-next | 同上 | 前台PC → 个人中心、会员信息、地址管理 |
| ec-payment-service | ec-website-trade-nb / ec-website-next | 同上 | 前台PC → 支付页面、支付结果 |
| ec-rma-service | ec-website-customer-nb / ec-website-customer-next | 同上 | 前台PC → 退货申请、退货进度 |
| ec-activity-service | ec-website-nb (Laravel) / ec-website-next (Next.js) | `/mnt/d/code/yami/ec-website-nb/` | 前台PC → 活动页面、优惠券、秒杀 |
| ec-distributor-service | ec-website-nb / ec-website-next | 同上 | 前台PC → 分销相关页面 |

**前台移动站**（Nuxt/Vue）：

| 后端服务 | 前端项目 | 路径 | 典型页面 |
|---------|---------|------|---------|
| ec-so-service | ec-mobilesite-nb (Nuxt) | `/mnt/d/code/yami/ec-mobilesite-nb/` | 移动站 → 购物车、下单、我的订单 |
| ec-rma-service | ec-mobilesite-rma (Vue) | `/mnt/d/code/yami/ec-mobilesite-rma/` | 移动站 → 退货申请、退货进度 |
| ec-customer-service | ec-mobilesite-nb | 同上 | 移动站 → 个人中心、会员 |
| ec-payment-service | ec-mobilesite-nb | 同上 | 移动站 → 支付流程 |
| ec-activity-service | ec-mobilesite-nb | 同上 | 移动站 → 活动、优惠券 |

**App**（Flutter / iOS / Android）：

| 后端服务 | 前端项目 | 路径 |
|---------|---------|------|
| ec-so-service, ec-customer-service, ec-payment-service 等 | mobile_flutter | `/mnt/d/code/yami/mobile_flutter/` |
| 同上 | mobile_ios | `/mnt/d/code/yami/mobile_ios/` |
| 同上 | mobile_android | `/mnt/d/code/yami/mobile_android/` |

**无直接前端页面的服务**：

| 后端服务 | 影响方式 |
|---------|---------|
| ec-inventory-service | 无直接页面，通过 ec-so-service 间接影响库存展示和下单流程 |
| ec-tax-service | 无直接页面，通过下单流程间接影响税费计算和展示 |
| mail-service-job | 无页面，影响邮件发送，测试时验证邮箱收件 |

**使用方法**：
1. 确定变更的后端服务
2. 查映射表找到对应的前端项目和典型页面区域
3. 结合接口路径和业务语义，推断具体的页面操作路径
4. 如果需要更精确，可以在前端项目中 grep 接口路径（如 `grep -r "/order/detail" /mnt/d/code/yami/central-so-web/`）

**具体做法**：
1. 识别变更的 Controller/RestImpl 方法，拿到接口路径（如 `GET /order/detail`）
2. 根据接口路径和业务语义，推断前端页面和操作路径（如"订单详情页 → 查看订单"）
3. 如果是内部方法变更（Service/DAO 层），向上追踪到调用它的 Controller，再追到前端页面
4. 如果是 Job/MQ 变更（无前端入口），说明触发条件和用户可感知的结果
5. **汇总所有受影响的前端入口**：分析完所有服务后，将所有涉及的前端页面去重汇总到「受影响的前端入口」表中，按端（后台/前台PC/移动站/App）分组，让测试同学一眼看到完整的测试范围

**禁止**：
- ❌ 测试要点中出现内部方法名（如 `queryOrderLog`、`getOrderOriginalAddress`）
- ❌ 只写接口路径不写页面操作（如 `GET /order/detail` 但不说在哪个页面触发）
- ❌ 使用开发术语描述测试动作（如"调用接口验证返回值"）

**正确写法示例**：
- ✅ `后台 → 订单管理 → 订单详情 → 查看订单日志，验证历史订单日志显示正常`
- ✅ `前台 → 我的订单 → 点击订单号进入详情 → 检查备注信息是否正确显示`
- ✅ `后台 → RMA管理 → 退货详情 → 查看退货商品列表，验证 2023 年及更早订单的商品信息完整`

**Job/MQ 类变更的写法**：
- ✅ `定时任务：秒杀商品售完扫描（每 5 分钟自动执行）→ 验证秒杀活动结束后商品状态正确更新`
- ✅ `MQ 消息：订单支付成功后自动触发 → 验证支付完成后订单状态变为"已支付"`

### 5. Generate Documentation

**Check prerequisites**:
- All on master → "No changes to document"
- Non-master but no changes → "No changes to document"
- Has changes → generate doc

**Document template**:

```markdown
# [Branch] [Feature Title]

## 📋 Basic Info
- **Generated**: [YYYY-MM-DD HH:MM:SS]
- **Services**: [N]
- **Main Branch**: [branch-name]

## 🔧 Service Branches
| Service | Branch | Files Changed |
|---------|--------|---------------|
| [repo] | [[branch]](https://github.com/yamibuy/[repo]/pulls?q=is:pr+head:[branch]) | X |

## 🎯 测试重点

### 受影响的前端入口

> 本次变更涉及以下前端页面/功能入口，测试时请逐一覆盖。

| # | 端 | 入口路径 | 受影响功能 | 关联后端服务 |
|---|---|---------|-----------|------------|
| 1 | [后台/前台PC/移动站/App] | [菜单 → 子菜单 → 页面名] 或 [URL 路径] | [受影响的具体功能] | [service-name] |
| 2 | ... | ... | ... | ... |

> 以下按后端服务分组列出详细测试要点。每个要点都标注了对应的前端入口路径。

### [Service Name]
**功能概述**: [一句话说明本次变更对用户可感知的影响]

**页面功能验证**:
- [ ] **[前台/后台] → [页面路径] → [具体操作]**: [预期结果]
- [ ] **[前台/后台] → [页面路径] → [具体操作]**: [预期结果]

**后台任务/消息验证**（如有 Job/MQ 变更）:
- [ ] **[任务名称]**（[触发条件]）→ [用户可感知的结果]

**数据验证**（如有数据库变更）:
- [ ] [验证什么数据、在哪里看]

## ⚙️ Configuration Changes

### [Service Name]

#### Apollo Config
```properties
# Purpose: [explanation]
key=value
```

#### SQL Changes
```sql
-- Purpose: [explanation]
ALTER TABLE ...
```

#### Redis Keys
```
# Purpose: [explanation]
redis:key:pattern:*
```

## 🔗 Service Dependencies
[If cross-service calls exist]
```
Service A → Service B → Service C
```

## ⚠️ Testing Notes
1. **Environment**: [setup requirements]
2. **Order**: [if dependencies exist]
3. **Regression**: [areas to retest]
4. **Data**: [validation points]
```

**Save as**: `[branch] [title].md` in workspace root

## Key Rules

### Optimization
- **Two-pass scan**: Branch check first (1 cmd/repo), then detailed analysis (5 cmds/repo)
- **Skip master branches**: Don't analyze repos already on master
- **Efficiency**: 13 repos with 2 changed = 75% fewer Git operations

### PR Links
- Format: `[branch](https://github.com/yamibuy/[repo]/pulls?q=is:pr+head:[branch])`
- Only for non-master branches

### Focus
- ✅ Test-relevant information (page paths, user operations, expected results)
- ✅ Configuration changes
- ✅ API modifications (as supplementary info, not primary test description)
- ❌ Internal method names in test points
- ❌ API paths without page context
- ❌ Commit details
- ❌ Full file lists
- ❌ Implementation details

### Remote Name
```bash
git remote get-url origin | xargs basename -s .git
```

## Output
- Language: Chinese
- Location: Workspace root
- Logs: Preserved in `git_logs/` directory
