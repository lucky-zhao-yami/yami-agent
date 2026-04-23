#!/usr/bin/env bash
# Profile definitions for deploy.sh
# Each profile defines: skills, agents, mcps, steering, hooks

# ── base (included in all profiles) ──────────────────────────
BASE_SKILLS=(notify-wecom wecom-memory wecom-scheduler manage-openproject)
BASE_AGENTS=(orchestrator-agent)
BASE_MCPS=(memory openproject kiro-bridge)
BASE_STEERING=(global_guide.md product.md projects.md)
BASE_HOOKS=(save-memory-on-exit.kiro.hook)

# ── dev ──────────────────────────────────────────────────────
DEV_SKILLS=(
  code-module-analyzer java-spock-unit-test wirte-java-unit-test
  api-test idp-deploy release-doc-generator dev-doc-generator
  code-branch-diff yamibuy-order-flow yami-public-toolkit
  kibana-logs sql-query cli-anything-rancher cli-anything
  code-simplifier codebase-knowledge-graph apollo-config-sync
  pr-create pr-publish web-test webapp-testing test-env-redis
  knowledge-writer business-knowledge
)
DEV_AGENTS=(
  coder-agent architect-agent api-designer-agent qa-agent
  reviewer-agent sql-query alert-advisor knowledge-agent.md
)
DEV_MCPS=(github kibana sql-query zentao google-sheets)
DEV_STEERING=(tech.md structure.md git-agent.md abtest-guide.md yami-skills.md)
DEV_HOOKS=(
  auto-ut-on-code-change.kiro.hook checkout-master-pull.kiro.hook
  code-commit.kiro.hook generate-ut-for-file.kiro.hook
  multi-repo-release-doc.kiro.hook release-assistant-hook.kiro.hook
  submit-test-assistant.kiro.hook unit-test-generator.kiro.hook
  update-readme-docs.kiro.hook
)

# ── cs ───────────────────────────────────────────────────────
CS_SKILLS=(sql-query kibana-logs business-knowledge)
CS_AGENTS=(sql-query)
CS_MCPS=(sql-query kibana zentao)
CS_STEERING=()
CS_HOOKS=()

# ── ops ──────────────────────────────────────────────────────
OPS_SKILLS=(grafana-query cli-anything-rancher kibana-logs cli-anything)
OPS_AGENTS=(alert-advisor)
OPS_MCPS=(ops-agent kibana)
OPS_STEERING=()
OPS_HOOKS=()
