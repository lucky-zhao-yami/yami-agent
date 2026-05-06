#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# Profile 配置文件
# 
# 每个团队维护自己的 profile，定义该团队 Agent 需要的组件。
# 新团队接入时，复制一个现有 profile 段落，修改为自己的配置即可。
#
# 组件说明：
#   SKILLS   — 操作能力（查 SQL、调 API、看日志等），对应 templates/skills/ 下的目录名
#   AGENTS   — Agent 角色定义，对应 templates/agents/ 下的文件名（不含 .json）
#   MCPS     — MCP 工具服务，对应 scripts/mcp-registry.json 中的 key
#   STEERING — 行为规则文件，对应 templates/steering/ 下的文件名
#   HOOKS    — 行为触发器，对应 templates/hooks/ 下的文件名
#   REPOS    — 需要拉取的代码仓库名（用于 workspace.json 和源码查阅）
#   DEFAULT_AGENT — config.json 中默认使用的 agent 名称
#
# deploy.sh 会合并 BASE + 选定 profile 的配置。
# ═══════════════════════════════════════════════════════════════════

# ── 基础配置（所有 profile 共享）────────────────────────────────────
BASE_SKILLS=()
BASE_AGENTS=()
BASE_MCPS=()
BASE_STEERING=(global_guide.md product.md projects.md)
BASE_HOOKS=()
BASE_REPOS=()

# ── dev: 开发团队 ──────────────────────────────────────────────────
DEV_DEFAULT_AGENT="orchestrator-agent"
DEV_REPOS=(
  central-activity-service central-crm-web central-customer-service
  central-distributor-service central-fp-service central-fp-web
  central-payment-service central-rma-service central-rma-web
  central-so-service central-so-web
  ec-activity-service ec-customer-service ec-distributor-service
  ec-inventory-service ec-payment-service ec-rma-service
  ec-so-service ec-tax-service
  mail-service-job public purchase-tool kiro-wecom-bridge
)
DEV_SKILLS=(
  notify-wecom wecom-memory wecom-scheduler manage-openproject
  code-module-analyzer java-spock-unit-test wirte-java-unit-test
  api-test idp-deploy release-doc-generator dev-doc-generator
  code-branch-diff yamibuy-order-flow yami-public-toolkit
  kibana-logs sql-query cli-anything-rancher cli-anything
  code-simplifier codebase-knowledge-graph apollo-config-sync
  pr-create pr-publish web-test webapp-testing test-env-redis
  knowledge-writer business-knowledge
)
DEV_AGENTS=(
  orchestrator-agent
  coder-agent architect-agent api-designer-agent qa-agent
  reviewer-agent sql-query alert-advisor knowledge-agent.md
)
DEV_MCPS=(memory openproject kiro-bridge github kibana sql-query zentao google-sheets)
DEV_STEERING=(tech.md structure.md git-agent.md abtest-guide.md yami-skills.md)
DEV_HOOKS=(
  save-memory-on-exit.kiro.hook
  auto-ut-on-code-change.kiro.hook checkout-master-pull.kiro.hook
  code-commit.kiro.hook generate-ut-for-file.kiro.hook
  multi-repo-release-doc.kiro.hook release-assistant-hook.kiro.hook
  submit-test-assistant.kiro.hook unit-test-generator.kiro.hook
  update-readme-docs.kiro.hook
)

# ── cs: 客服团队 ───────────────────────────────────────────────────
CS_DEFAULT_AGENT="cs-troubleshooter"
CS_REPOS=(
  central-activity-service central-crm-web central-customer-service
  central-distributor-service central-fp-service central-fp-web
  central-payment-service central-rma-service central-rma-web
  central-so-service central-so-web
  ec-activity-service ec-customer-service ec-distributor-service
  ec-inventory-service ec-payment-service ec-rma-service
  ec-so-service ec-tax-service
  mail-service-job public purchase-tool
)
CS_SKILLS=(
  sql-query zentao manage-openproject central-login api-fetch
  enum-values iterable-api query-kibana-logs memory-recall
  query-apollo kibana-log
)
CS_AGENTS=(cs-troubleshooter)
CS_MCPS=()
CS_STEERING=(
  cs-global-config.md sub-agent-guide.md skills-path-find-guide.md
  cs-account-login.md cs-bind-phone.md cs-coupon.md cs-email-notification.md
  cs-follow-buy.md cs-giftcard.md cs-invite-friend.md cs-item.md
  cs-logistics.md cs-member-rights.md cs-order.md cs-payment-refund.md
  cs-profile-edit.md cs-query-rules.md cs-rma.md cs-tax.md
)
CS_HOOKS=(
  save-memory-on-exit.kiro.hook check-steering-first.kiro.hook
  cs-kibana-check.kiro.hook cs-rules-auto-update.kiro.hook
  sql-fallback-reminder.kiro.hook
)

# ── ops: 运维团队 ──────────────────────────────────────────────────
OPS_DEFAULT_AGENT="alert-advisor"
OPS_REPOS=()
OPS_SKILLS=(grafana-query cli-anything-rancher kibana-logs cli-anything)
OPS_AGENTS=(alert-advisor)
OPS_MCPS=(ops-agent kibana)
OPS_STEERING=()
OPS_HOOKS=()

# ═══════════════════════════════════════════════════════════════════
# 新团队接入模板（复制下方内容，替换 XXX 为团队名）
# ═══════════════════════════════════════════════════════════════════
#
# # ── xxx: XX团队 ──────────────────────────────────────────────────
# XXX_DEFAULT_AGENT="your-agent-name"
# XXX_REPOS=()                    # 需要拉取的代码仓库
# XXX_SKILLS=(sql-query)          # 从 templates/skills/ 选择需要的
# XXX_AGENTS=(your-agent-name)    # 从 templates/agents/ 选择
# XXX_MCPS=()                     # 从 mcp-registry.json 选择
# XXX_STEERING=(your-rules.md)    # 从 templates/steering/ 选择
# XXX_HOOKS=()                    # 从 templates/hooks/ 选择
