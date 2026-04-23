---
name: "knowledge-writer"
description: "业务知识图谱写入工具。仅供 Knowledge Agent 使用，用于从对话中精炼知识并写入图谱。支持添加节点、添加关系、去重检查、删除节点。"
---

# 业务知识图谱写入

向 Neo4j 知识图谱中添加/更新/删除业务知识。

## ⚠️ 仅供 Knowledge Agent 使用

其他 Agent 只能通过 `business-knowledge` skill 查询，不能写入。

## 命令

### 添加/更新节点

```bash
curl -s http://localhost:8902/add_node -X POST \
  -H 'Content-Type: application/json' \
  -d '{"type": "BusinessRule", "name": "规则名称", "description": "规则描述", "properties": {"impact": "影响范围", "note": "备注"}}'
```

节点类型：
- `BusinessRule` — 业务规则
- `Concept` — 业务概念
- `Flow` — 业务流程
- `Warehouse` — 仓库
- `Shipping` — 配送方式
- `BusinessDomain` — 业务域

### 添加关系

```bash
curl -s http://localhost:8902/add_relation -X POST \
  -H 'Content-Type: application/json' \
  -d '{"from": "节点A名称", "relation": "DETERMINES", "to": "节点B名称", "description": "关系描述"}'
```

常用关系类型：
- `DETERMINES` — A 决定/影响 B
- `USES` — A 使用 B
- `CONTAINS` — A 包含 B
- `BELONGS_TO` — A 属于 B
- `DEPENDS_ON` — A 依赖 B

### 去重检查（添加前必须调用）

```bash
curl -s http://localhost:8902/search_similar -X POST \
  -H 'Content-Type: application/json' \
  -d '{"name": "节点名称", "description": "节点描述"}'
```

返回相似度 > 0.85 的已有节点。如果有高度相似的节点，应该更新而非新建。

### 删除节点

```bash
curl -s http://localhost:8902/delete_node -X POST \
  -H 'Content-Type: application/json' \
  -d '{"name": "节点名称"}'
```

### 查看统计

```bash
curl -s http://localhost:8902/stats -X POST -d '{}'
```

## 写入规范

1. **添加前先去重**：调用 search_similar 检查是否已有相似节点
2. **已有则更新**：add_node 对同名节点自动更新（不会重复创建）
3. **描述要精炼**：用一两句话概括，不要贴代码
4. **标注来源**：在 properties.note 中标注知识来源（如"来自OP-34242开发过程"）
5. **建立关系**：新节点要和已有节点建立关系，不要孤立
