#!/usr/bin/env bash
# Profile definitions for deploy.sh
# Each profile defines: skills, agents, mcps, steering, hooks

# ── 代码仓库（按 profile 分）─────────────────────────────────
# 基础仓库（所有 profile 都不拉，deploy.sh 本身就在 yami-agent 里）
BASE_REPOS=()

# 业务代码仓库
BIZ_REPOS=(
  central-activity-service central-crm-web central-customer-service
  central-distributor-service central-fp-service central-fp-web
  central-payment-service central-rma-service central-rma-web
  central-so-service central-so-web
  ec-activity-service ec-customer-service ec-distributor-service
  ec-inventory-service ec-payment-service ec-rma-service
  ec-so-service ec-tax-service
  mail-service-job public purchase-tool
)

DEV_REPOS=("${BIZ_REPOS[@]}" kiro-wecom-bridge)
CS_REPOS=("${BIZ_REPOS[@]}")
OPS_REPOS=()

# 默认 agent（用于 config.json 的 chats.default）
DEV_DEFAULT_AGENT="orchestrator-agent"
CS_DEFAULT_AGENT="cs-troubleshooter"
OPS_DEFAULT_AGENT="alert-advisor"

BASE_SKILLS=()
BASE_AGENTS=()
BASE_MCPS=()
BASE_STEERING=(global_guide.md product.md projects.md)
BASE_HOOKS=()

# ── dev ──────────────────────────────────────────────────────
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

# ── cs ───────────────────────────────────────────────────────
CS_SKILLS=(cs-knowledge sql-query kibana-logs)
CS_AGENTS=(cs-troubleshooter sql-query)
CS_MCPS=(sql-query kibana zentao google-sheets google-docs)
CS_STEERING=(cs-global-config.md cs-yami-skills.md sub-agent-guide.md skills-path-find-guide.md)
CS_HOOKS=(check-steering-first.kiro.hook)

# ── ops ──────────────────────────────────────────────────────
OPS_SKILLS=(grafana-query cli-anything-rancher kibana-logs cli-anything)
OPS_AGENTS=(alert-advisor)
OPS_MCPS=(ops-agent kibana)
OPS_STEERING=()
OPS_HOOKS=()
