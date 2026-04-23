# 知识图谱工具详解

## search_graph

按关键词搜索实体。

```json
{
  "name": "search_graph",
  "arguments": {
    "query": "支付 微信",
    "entity_types": ["Table", "BusinessRule", "Column"]
  }
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| query | string | ✅ | 搜索关键词，多个用空格分隔（AND 逻辑） |
| entity_types | array | ❌ | 实体类型过滤列表 |

## get_related

获取实体的关联信息。

```json
{
  "name": "get_related",
  "arguments": {
    "entity_name": "yamibuy_payment.payment_charge",
    "depth": 2
  }
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| entity_name | string | ✅ | 实体名称（使用完整格式） |
| depth | integer | ❌ | 遍历深度 1-3，默认 1 |

**depth 说明：**
- depth=1: 直接关联的实体
- depth=2: 包含二级关联（如 表→字段→枚举值）
- depth=3: 三级关联

## create_entities

批量创建实体。

```json
{
  "name": "create_entities",
  "arguments": {
    "entities": [
      {
        "name": "yamibuy_payment.payment_charge.pay_status=60",
        "entity_type": "EnumValue",
        "description": "支付成功状态"
      },
      {
        "name": "rule_微信支付provider值",
        "entity_type": "BusinessRule",
        "description": "微信支付的 provider 字段值为 'wechat'"
      }
    ]
  }
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| entities | array | ✅ | 实体列表 |
| entities[].name | string | ✅ | 实体名称（按命名规范） |
| entities[].entity_type | string | ✅ | 实体类型 |
| entities[].description | string | ❌ | 描述 |
| entities[].metadata | object | ❌ | 元数据 |

## create_relations

批量创建关系。

```json
{
  "name": "create_relations",
  "arguments": {
    "relations": [
      {
        "from_entity": "yamibuy_payment.payment_charge",
        "to_entity": "yamibuy_payment.payment_charge.pay_status",
        "relation_type": "has_column"
      }
    ]
  }
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| relations | array | ✅ | 关系列表 |
| relations[].from_entity | string | ✅ | 源实体 |
| relations[].to_entity | string | ✅ | 目标实体 |
| relations[].relation_type | string | ✅ | 关系类型 |
| relations[].metadata | object | ❌ | 元数据 |

## delete_entities

删除实体（会自动删除关联关系）。

```json
{
  "name": "delete_entities",
  "arguments": {
    "entity_names": ["yamibuy_payment.payment_charge.pay_status=60"]
  }
}
```

## delete_relations

仅删除关系，不影响实体。

```json
{
  "name": "delete_relations",
  "arguments": {
    "relations": [
      {
        "from_entity": "yamibuy_payment.payment_charge",
        "to_entity": "rule_微信支付provider值",
        "relation_type": "described_by"
      }
    ]
  }
}
```
