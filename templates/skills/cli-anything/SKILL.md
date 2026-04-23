---
name: "cli-anything"
description: "为任意 GUI 软件构建 CLI 工具。当用户要求为某个软件生成 CLI、构建命令行接口、让软件支持 Agent 调用时使用。触发词：cli-anything, 生成CLI, 构建CLI, CLI harness, agent-native, 命令行工具生成"
---

# CLI-Anything: Making ALL Software Agent-Native

为任意 GUI 应用构建生产级 CLI 工具，使其可被 AI Agent 调用。

基于 [HKUDS/CLI-Anything](https://github.com/HKUDS/CLI-Anything) 项目。

## 前置条件

- Python 3.10+
- `click` - CLI 框架
- `pytest` - 测试框架

```bash
pip install click pytest
```

## ⚠️ 核心规则：必须先读 HARNESS.md

**在执行任何操作之前，必须先读取本 skill 目录下的 `HARNESS.md` 文件。** 它定义了完整的方法论、架构标准和实现模式。所有阶段都必须遵循 HARNESS.md，不要自行发挥。

HARNESS.md 路径：与本文件同目录的 `HARNESS.md`

---

## 命令 1: build — 构建完整 CLI

为任意 GUI 应用构建完整的、有状态的 CLI 工具。

### 用法

用户说类似以下内容时触发：
- "给 gimp 生成一个 CLI"
- "cli-anything /home/user/gimp"
- "cli-anything https://github.com/blender/blender"

### 参数

- `<software-path-or-repo>` — **必需**。本地路径或 GitHub 仓库 URL。
  - 不接受纯软件名（如 "gimp"），必须提供源码路径或仓库 URL。

### 执行阶段

**Phase 0: 源码获取**
- 如果是 GitHub URL，先 clone 到本地
- 验证路径存在且包含源码
- 从目录名推导软件名（如 `/home/user/gimp` → `gimp`）

**Phase 1: 代码分析**
- 分析源码架构和数据模型
- 映射 GUI 操作到 API 调用
- 识别现有 CLI 工具
- 记录架构文档

**Phase 2: CLI 架构设计**
- 设计与应用领域匹配的命令组
- 规划状态模型和输出格式
- 创建软件专属 SOP 文档（如 GIMP.md）

**Phase 3: 实现**
- 创建目录结构：`agent-harness/cli_anything/<software>/core`, `utils`, `tests`
- 实现核心模块（project, session, export 等）
- 构建基于 Click 的 CLI，支持 REPL 模式
- 实现 `--json` 输出模式
- 所有 import 使用 `cli_anything.<software>.*` 命名空间

**Phase 4: 测试规划**
- 创建 `TEST.md`
- 规划单元测试和 E2E 测试
- 设计真实工作流场景

**Phase 5: 测试实现**
- 编写单元测试（`test_core.py`）— 合成数据，无外部依赖
- 编写 E2E 测试（`test_full_e2e.py`）— 真实文件，完整流水线
- 实现工作流测试
- 添加 `TestCLISubprocess` 类，使用 `_resolve_cli("cli-anything-<software>")`

**Phase 6: 测试文档**
- 运行 `pytest -v --tb=no`
- 将结果追加到 `TEST.md`

**Phase 6.5: SKILL.md 生成**
- 使用 `skill_generator.py` 提取 CLI 元数据
- 生成 SKILL.md（含 YAML frontmatter）
- 输出到 `cli_anything/<software>/skills/SKILL.md`

**Phase 7: PyPI 打包与安装**
- 创建 `setup.py`，使用 `find_namespace_packages(include=["cli_anything.*"])`
- 包名：`cli-anything-<software>`
- `cli_anything/` 无 `__init__.py`（PEP 420 命名空间包）
- 测试本地安装：`pip install -e .`

### 输出结构

```
<software-name>/
└── agent-harness/
    ├── <SOFTWARE>.md
    ├── setup.py
    └── cli_anything/          # 命名空间包（无 __init__.py）
        └── <software>/        # 子包（有 __init__.py）
            ├── README.md
            ├── <software>_cli.py
            ├── core/
            │   ├── project.py
            │   ├── session.py
            │   ├── export.py
            │   └── ...
            ├── skills/
            │   └── SKILL.md
            ├── utils/
            └── tests/
                ├── TEST.md
                ├── test_core.py
                └── test_full_e2e.py
```

### 成功标准

1. 所有核心模块已实现且可用
2. CLI 支持一次性命令和 REPL 模式
3. `--json` 输出模式对所有命令生效
4. 所有测试通过（100% 通过率）
5. subprocess 测试使用 `_resolve_cli()` 且通过
6. TEST.md 包含计划和结果
7. README.md 记录安装和使用方法
8. SKILL.md 已生成
9. setup.py 已创建且本地安装成功
10. CLI 可通过 PATH 访问：`cli-anything-<software>`

---

## 命令 2: refine — 扩展现有 CLI 覆盖范围

对已构建的 CLI 进行增量扩展，提高功能覆盖率。

### 用法

用户说类似以下内容时触发：
- "扩展 gimp 的 CLI 覆盖范围"
- "给 blender CLI 加上粒子系统的支持"
- "cli-anything:refine /home/user/shotcut 画中画功能"

### 参数

- `<software-path>` — **必需**。本地源码路径。
- `[focus]` — **可选**。自然语言描述要聚焦的功能领域。

### 执行步骤

**Step 1: 盘点当前覆盖范围**
- 读取现有 CLI 入口和所有核心模块
- 列出所有已实现的命令、子命令和选项
- 构建覆盖地图

**Step 2: 分析软件能力**
- 重新扫描源码
- 识别所有公共 API、CLI 工具、脚本接口
- 如果提供了 `[focus]`，只分析指定领域

**Step 3: 差距分析**
- 对比当前覆盖范围与软件完整能力
- 按优先级排序：高影响 > 容易实现 > 可组合性
- 向用户展示差距报告，确认要补哪些

**Step 4: 实现新命令**
- 遵循 HARNESS.md 中的模式
- Click 命令组、`--json` 支持、Session 状态集成、错误处理

**Step 5: 扩展测试**
- 为新功能添加单元测试和 E2E 测试
- 运行全部测试确保无回归

**Step 6: 更新文档**
- 更新 README.md、TEST.md、SOP 文档

### 成功标准

- 所有现有测试仍然通过（无回归）
- 新命令遵循相同架构模式
- 新测试 100% 通过
- 覆盖范围有实质性提升
- 文档已更新

---

## 命令 3: test — 运行测试

运行 CLI 工具的测试并更新 TEST.md。

### 用法

用户说类似以下内容时触发：
- "跑一下 gimp CLI 的测试"
- "cli-anything:test /home/user/gimp"

### 参数

- `<software-path-or-repo>` — **必需**。本地路径或 GitHub URL。

### 执行步骤

1. 定位 CLI 工具目录
2. 运行 `pytest -v -s --tb=short`
3. 捕获输出
4. 验证 subprocess 后端（确认 `[_resolve_cli]` 输出）
5. 更新 TEST.md
6. 报告通过/失败摘要

### 失败处理

- 测试失败时不更新 TEST.md
- 显示失败的测试
- 建议修复方案
- 提供重新运行选项

---

## 命令 4: validate — 验证 CLI 工具

验证 CLI 工具是否符合 HARNESS.md 标准。

### 用法

用户说类似以下内容时触发：
- "验证一下 gimp CLI 是否合规"
- "cli-anything:validate /home/user/gimp"

### 参数

- `<software-path-or-repo>` — **必需**。本地路径或 GitHub URL。

### 验证维度

1. **目录结构** — 命名空间包结构是否正确
2. **必需文件** — README.md, CLI 入口, core 模块, 测试文件
3. **CLI 实现标准** — Click 框架, 命令组, `--json`, REPL
4. **核心模块标准** — project/session/export 模块的必需方法
5. **测试标准** — 单元测试, E2E 测试, subprocess 测试
6. **文档标准** — README, SOP, 无重复 HARNESS.md
7. **PyPI 打包标准** — setup.py, 命名空间包, entry point
8. **代码质量** — 无语法错误, PEP 8, 无硬编码路径

### 输出格式

```
CLI Harness Validation Report
Software: gimp
Path: /root/cli-anything/gimp/agent-harness/cli_anything/gimp

Directory Structure (5/5 checks passed)
Required Files (9/9 files present)
CLI Implementation (7/7 standards met)
...

Overall: PASS (52/52 checks)
```

---

## 命令 5: list — 列出所有 CLI 工具

列出所有已安装和已生成的 CLI-Anything 工具。

### 用法

用户说类似以下内容时触发：
- "列出所有 cli-anything 工具"
- "cli-anything:list"

### 参数

- `--path <directory>` — 搜索目录（默认当前目录）
- `--depth <n>` — 最大递归深度（默认无限）
- `--json` — JSON 格式输出

### 执行步骤

1. 使用 `importlib.metadata` 扫描已安装的 `cli-anything-*` 包
2. 使用 `glob` 扫描本地生成的 CLI 目录
3. 合并去重
4. 格式化输出（表格或 JSON）

---

## 辅助文件

本 skill 目录下包含以下辅助文件：

| 文件 | 用途 |
|------|------|
| `HARNESS.md` | 核心方法论文档，**必须在执行任何操作前先读取** |
| `skill_generator.py` | Phase 6.5 中用于提取 CLI 元数据并生成 SKILL.md |
| `repl_skin.py` | REPL 模式的皮肤/主题模板 |
