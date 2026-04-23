---
name: web-test
description: 当需要进行 Web UI 测试、验证页面功能、检查前端展示是否正确时使用。支持 EC 端（C端用户页面）和 Central 端（后台管理页面）的测试。触发词：web测试, UI测试, 页面测试, 前端测试, 浏览器测试, 验证页面
---

# Web UI 测试 Skill

使用 Playwright Chromium (headless) 操作浏览器，对测试环境进行 Web UI 测试。
登录状态通过 storage_state 持久化，登录一次后续复用。

## 测试环境

| 环境 | 地址 | 说明 |
|------|------|------|
| EC（C端） | https://dev-customer.yamibuy.tech/zh/ | 默认测试环境 |
| Central（后台） | https://dev-central.yamibuy.tech | 需要 --chrome 模式（Google OAuth） |

**EC 测试账号**：`lucky.zhao@yamibuy.com` / `123456`

## 浏览器控制脚本

路径: `/mnt/d/workspace/all/.kiro/skills/web-test/scripts/browser.py`

### 命令列表

```bash
BROWSER="/mnt/d/workspace/all/.kiro/skills/web-test/scripts/browser.py"

# 导航到页面，输出页面元素快照
python3 $BROWSER navigate <url>

# 截图
python3 $BROWSER screenshot <filename> <url>

# 点击元素（先导航到 url，再点击 selector）
python3 $BROWSER click <selector> <url>

# 填写输入框
python3 $BROWSER fill <selector> <text> <url>

# 选择下拉框
python3 $BROWSER select <selector> <value> <url>

# 执行 JavaScript
python3 $BROWSER eval <js_expression> <url>

# EC 登录
python3 $BROWSER login-ec <email> <password>

# 运行测试脚本（JSON 格式的步骤）
python3 $BROWSER test <url> <steps.json>

# 运行自定义 Playwright Python 脚本
python3 $BROWSER run <script.py>
```

### 关键说明

- **Headless 模式**：每次命令都是独立的浏览器实例，通过 storage_state 文件共享登录状态
- **navigate 是核心命令**：导航后自动输出页面所有可交互元素（按钮、输入框、链接等），Agent 根据输出决定下一步操作
- **selector 格式**：支持 CSS 选择器、text=、id=、[name="xxx"] 等 Playwright 选择器
- **截图目录**：`/mnt/d/data/playwright-screenshots/`
- **登录状态**：`/mnt/d/data/playwright-profile/state.json`

## 工作流程

### 1. 确定测试范围

根据代码改动分析需要测试的页面：
- 读取 git diff 或架构文档，识别涉及的 API
- 映射到前端页面和功能点
- 列出测试用例

### 2. 执行测试

```
Step 1: navigate 到目标页面 → 获取元素快照
Step 2: 根据快照中的元素信息，决定 click/fill/select 操作
Step 3: 再次 navigate 或 screenshot 验证结果
Step 4: 记录 PASS/FAIL
```

### 3. 批量测试（JSON 步骤文件）

创建 steps.json：
```json
[
  {"action": "fill", "selector": "input[name='search']", "value": "test"},
  {"action": "click", "selector": "button[type='submit']"},
  {"action": "wait", "ms": 2000},
  {"action": "screenshot", "name": "search_result.png"},
  {"action": "assert_text", "selector": ".result-count", "expected": "条结果"}
]
```

执行：`python3 browser.py test https://example.com steps.json`

### 4. 输出测试报告

```markdown
# Web UI 测试报告
## 测试环境: QC
## 日期: YYYY-MM-DD

| # | 用例 | 预期 | 实际 | 状态 |
|---|------|------|------|------|
| 1 | xxx  | xxx  | xxx  | ✅/❌ |

## 截图: /mnt/d/data/playwright-screenshots/
## 问题: [描述 + 截图路径]
```
