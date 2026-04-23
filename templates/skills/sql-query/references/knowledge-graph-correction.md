# 知识纠错指南

发现知识图谱中存在错误信息时，采用"先删后建"策略。

## 纠错场景速查

| 错误类型 | 处理方式 |
|----------|----------|
| 实体描述错误 | 删除实体 → 重建实体 → 重建关系 |
| 关系类型错误 | 删除关系 → 创建正确关系 |
| 实体命名错误 | 删除旧实体 → 创建新实体 → 重建所有关系 |
| 枚举值含义错误 | 删除 EnumValue → 创建正确的 EnumValue → 重建 has_enum 关系 |
| 多余的实体/关系 | 直接删除 |

## 修正实体信息

当实体的描述、类型等信息有误时：

```json
// 1. 查询错误实体
{"name": "search_graph", "arguments": {"query": "错误实体关键词"}}

// 2. 获取关联关系（用于后续重建）
{"name": "get_related", "arguments": {"entity_name": "错误实体名", "depth": 1}}

// 3. 删除错误实体（会自动删除关联关系）
{"name": "delete_entities", "arguments": {"entity_names": ["错误实体名"]}}

// 4. 创建正确实体
{"name": "create_entities", "arguments": {"entities": [{"name": "正确实体名", "entity_type": "EnumValue", "description": "正确描述"}]}}

// 5. 重建关系
{"name": "create_relations", "arguments": {"relations": [{"from_entity": "父实体", "to_entity": "正确实体名", "relation_type": "has_enum"}]}}
```

## 修正关系信息

当关系类型错误或关系本身不应存在时：

```json
// 1. 获取当前关联
{"name": "get_related", "arguments": {"entity_name": "实体名", "depth": 1}}

// 2. 删除错误关系
{"name": "delete_relations", "arguments": {"relations": [{"from_entity": "A", "to_entity": "B", "relation_type": "错误类型"}]}}

// 3. 创建正确关系（如需要）
{"name": "create_relations", "arguments": {"relations": [{"from_entity": "A", "to_entity": "B", "relation_type": "正确类型"}]}}
```

## 批量纠错示例

修正多个枚举值的描述：

```json
// 删除错误的枚举值
{
  "name": "delete_entities",
  "arguments": {
    "entity_names": [
      "yamibuy_payment.payment_charge.pay_status=60",
      "yamibuy_payment.payment_charge.pay_status=70"
    ]
  }
}

// 创建正确的枚举值
{
  "name": "create_entities",
  "arguments": {
    "entities": [
      {"name": "yamibuy_payment.payment_charge.pay_status=60", "entity_type": "EnumValue", "description": "支付成功"},
      {"name": "yamibuy_payment.payment_charge.pay_status=70", "entity_type": "EnumValue", "description": "已退款"}
    ]
  }
}

// 重建关系
{
  "name": "create_relations",
  "arguments": {
    "relations": [
      {"from_entity": "yamibuy_payment.payment_charge.pay_status", "to_entity": "yamibuy_payment.payment_charge.pay_status=60", "relation_type": "has_enum"},
      {"from_entity": "yamibuy_payment.payment_charge.pay_status", "to_entity": "yamibuy_payment.payment_charge.pay_status=70", "relation_type": "has_enum"}
    ]
  }
}
```
