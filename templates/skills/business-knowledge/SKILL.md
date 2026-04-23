---
name: "business-knowledge"
description: "业务知识图谱查询。当需要了解业务规则、业务流程、业务概念之间的关系时使用。触发词：业务规则, 怎么算, 什么限制, 影响哪些, 流程是什么, 仓库, 运费, 税费, 积分, 礼卡, 加拿大, 秒杀, FBY, 拆单, 配送方式"
---

# 业务知识图谱查询

基于 Neo4j 图数据库的业务知识检索，支持向量语义搜索 + 全文关键词搜索 + 图关系展开。

## 使用方式

HTTP 接口（模型常驻内存，响应 <10ms）：

```bash
curl -s http://localhost:8902/query -X POST \
  -H 'Content-Type: application/json' \
  -d '{"query": "查询内容", "top_k": 5}'
```

返回：命中节点（按相关度排序）+ 关联关系（图展开）

如果服务未启动，先启动：
```bash
cd /mnt/d/workspace/all/ai-workspace/knowledge-graph
nohup /mnt/d/code/yami/kiro-wecom-bridge/.venv/bin/python3 kg_server.py > /tmp/kg_server.log 2>&1 &
```

## 知识图谱内容

| 类型 | 数量 | 示例 |
|------|------|------|
| 业务规则 | 22条 | 仓库选择、库存检查、运费计算、价格规则、加拿大限制 |
| 核心概念 | 14个 | 订单、购物车、仓库、商家、配送方式、用户定位 |
| 关键流程 | 5个 | 用户定位、加购、结算、下单、履约 |
| 仓库实例 | 6个 | LA(001)、NJ(002)、USN(004)、CA(101)等 |
| 配送方式 | 5个 | Standard、Express、LocalExpress、Fresh、NextDay |

## 使用场景

- 做需求分析时查询相关业务规则
- 改代码前了解影响范围（如"改仓库逻辑会影响什么"）
- 排查问题时了解业务流程（如"下单报错可能是哪个环节"）
- 新人了解系统业务全貌

## 依赖

- Neo4j 5.x（Docker: neo4j-kg, localhost:7687）
- sentence-transformers（all-MiniLM-L6-v2）
- Python neo4j driver
