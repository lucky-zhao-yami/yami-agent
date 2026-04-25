# yami-agent

企微 AI Agent 服务，通过 [ACP（Agent Client Protocol）](https://github.com/anthropics/agent-client-protocol) 对接 Kiro CLI，将企业微信消息转发给 Agent 并流式回复。

## 架构

```
企微 WebSocket ←→ yami-agent ←→ SessionManager ←→ kiro-cli (ACP)
                      ↑              ↑                  ↑
                   命令系统       记忆管理          .kiro/ 配置
                (/new /reset     (摘要/注入       (agents/skills/
                 /agent /mode)    /压缩/归档)      steering/mcp)
```

## 功能

- **流式回复** — 边生成边发送，1500 字自动分段
- **会话隔离** — 每个单聊/群聊独立 session
- **记忆管理** — 按天摘要、自动压缩、30 天归档
- **进程池** — LRU 淘汰 + 空闲回收 + 预热池
- **看门狗** — 独立进程监控，崩溃自动重启
- **systemd** — 开机自启，崩溃自动恢复

## 部署新部门的 Agent

### 前置条件

1. 一台 Linux 服务器（Ubuntu 22.04+），至少 2C4G
2. 安装 Node.js 18+
3. 安装 [kiro-cli](https://kiro.dev) 并登录：`kiro-cli login`
4. 企微管理后台创建一个 AI 机器人，获取 `bot_id` 和 `secret`

### 第一步：定义 Profile

编辑 `scripts/profiles.sh`，为你的部门添加一个 profile。以客服部门（cs）为例：

```bash
# ── your-team ────────────────────────────────────────────────

# 默认 Agent（收到消息后由哪个 agent 处理）
YOURTEAM_DEFAULT_AGENT="your-agent-name"

# Skills — agent 可以使用的能力
YOURTEAM_SKILLS=(sql-query kibana-logs your-custom-skill)

# Agents — agent 定义文件（放在 templates/agents/ 下）
YOURTEAM_AGENTS=(your-agent-name)

# MCPs — MCP 服务器（放在 templates/mcp-servers/ 下，需在 mcp-registry.json 注册）
YOURTEAM_MCPS=(google-sheets)

# Steering — 规则文档（放在 templates/steering/ 下）
YOURTEAM_STEERING=(your-global-config.md your-business-rules.md)

# Hooks — 钩子（放在 templates/hooks/ 下）
YOURTEAM_HOOKS=()

# 代码仓库（如果 agent 需要读代码）
YOURTEAM_REPOS=()
```

### 第二步：创建 Agent 定义

在 `templates/agents/` 下创建 `your-agent-name.json`：

```json
{
  "name": "your-agent-name",
  "description": "你的 agent 描述",
  "prompt": "你是 XX 助手。\n\n## 职责\n...\n\n## 排查流程\n...",
  "tools": [
    "fs_read",
    "execute_bash",
    "code",
    "grep",
    "glob"
  ]
}
```

关键字段：
- `name`: agent 名称，和 profile 里的 `DEFAULT_AGENT` 对应
- `prompt`: agent 的系统提示词，定义角色、流程、规则
- `tools`: agent 可以使用的工具列表

### 第三步：创建 Skill

在 `templates/skills/your-skill-name/SKILL.md` 创建 skill 文件：

```markdown
---
inclusion: auto
---

# Your Skill Name

## 用途
描述这个 skill 做什么

## 使用方式
具体的命令或调用方式（bash 示例）
```

`inclusion` 选项：
- `auto`: 自动加载到 agent 上下文（适合核心 skill）
- `manual`: agent 需要手动读取（适合按需使用的规则文档）

### 第四步：创建 Steering（规则文档）

在 `templates/steering/` 下创建 `.md` 文件：

```markdown
---
inclusion: auto
---

# 全局配置规则

## 你的规则
...
```

`inclusion` 说明：
- `auto`: 每次会话自动加载（适合全局规则，如语言要求、安全红线）
- `manual`: agent 需要主动读取（适合业务规则文档，配合意图识别按需加载，减少上下文占用）

### 第五步：部署

```bash
# 克隆仓库
git clone git@github.com:yamibuy/yami-agent.git
cd yami-agent

# 一键部署（交互式，会依次询问凭证信息）
bash scripts/deploy.sh --profile your-team
```

部署脚本会依次：
1. 询问企微 bot_id、secret
2. 询问业务凭证（如数据库地址、API 账号等，取决于 profile 配置）
3. 拉取代码仓库（如果有）
4. 复制 skills、agents、steering、mcp 到工作空间
5. 生成 .env、config.json、systemd service
6. 编译并通过 systemd 启动

### 第六步：验证

```bash
# 查看状态
systemctl status yami-agent

# 查看日志
journalctl -u yami-agent -f

# 健康检查
curl http://localhost:8900/health
```

在企微上给机器人发消息，确认能正常回复。

## 增量管理

部署后如需添加/更新 skill、agent、steering：

```bash
cd /opt/yami-agent

# 查看已安装和可用的 skill
bash scripts/manage.sh list-skills

# 添加 skill
bash scripts/manage.sh add-skill your-skill-name

# 移除 skill
bash scripts/manage.sh remove-skill old-skill

# 添加 agent
bash scripts/manage.sh add-agent your-agent

# 从 templates 同步所有已安装内容到最新版本
bash scripts/manage.sh sync

# 重启服务
bash scripts/manage.sh restart

# 查看状态
bash scripts/manage.sh status
```

## 现有 Profile

| Profile | 用途 | 默认 Agent | 说明 |
|---------|------|-----------|------|
| `dev` | 开发团队 | orchestrator-agent | 代码开发、SOP 流程、代码审查 |
| `cs` | 客服团队 | cs-troubleshooter | 客服问题排查、数据库查询、日志分析 |
| `ops` | 运维团队 | alert-advisor | 告警分析、日志查询 |

## 目录结构

```
scripts/
├── deploy.sh           # 一键部署脚本
├── manage.sh           # 增量管理脚本（add/remove skill/agent/mcp）
├── profiles.sh         # 团队 profile 定义
├── mcp-registry.json   # MCP 声明式配置
└── mcp-collectors.sh   # MCP 凭证收集

templates/              # 所有配置模板
├── agents/             # Agent 定义（JSON）
├── skills/             # Skill 定义（SKILL.md + scripts/）
├── steering/           # 规则文档（Markdown）
├── hooks/              # 钩子
└── mcp-servers/        # MCP 服务器配置

src/                    # 源码
├── agent/              # Agent 进程管理
├── bridge/             # 消息路由、命令系统
├── http/               # HTTP API
├── memory/             # 记忆管理
├── platform/           # 企微 WebSocket
├── session/            # 会话管理
└── watchdog/           # 看门狗
```

## 常用命令

```bash
# 开发
npm install && npm run build

# 启动（开发模式）
npm run dev

# 清理会话（重启后生效）
rm -rf /opt/yami-agent-workspace/sessions/*
systemctl restart yami-agent

# 查看实时日志
journalctl -u yami-agent -f
```

## 设计原则

1. **Profile 驱动** — 不同部门用不同 profile，共享基础设施，隔离业务配置
2. **Skill 即能力** — 每个能力封装为独立 skill，可组合、可复用
3. **Steering 即规则** — 业务规则以 Markdown 文档形式管理，非开发人员也能维护
4. **凭证不入库** — 所有敏感信息通过 deploy.sh 交互收集，存入 .env，不提交到 Git
