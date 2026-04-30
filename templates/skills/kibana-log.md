---
inclusion: auto
---

# Kibana 日志查询（已迁移）

> ⚠️ 本文件已废弃，Kibana 日志查询统一使用 `query-kibana-logs` skill 的 `search.py` 脚本。

## 调用方式

脚本路径：`.kiro/skills/query-kibana-logs/scripts/search.py`

```bash
# 按服务 + 关键词搜索
python .kiro/skills/query-kibana-logs/scripts/search.py -s payment -k "user_id" -t 7d

# 按订单号搜索（自动匹配 so/rma 索引）
python .kiro/skills/query-kibana-logs/scripts/search.py -o 订单号

# 按服务 + 日志级别
python .kiro/skills/query-kibana-logs/scripts/search.py -s so --level error -t 1h

# 列出所有可用服务
python .kiro/skills/query-kibana-logs/scripts/search.py --list-services
```

详细用法见 `.kiro/skills/query-kibana-logs/SKILL.md`
