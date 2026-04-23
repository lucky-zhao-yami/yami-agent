# Requirement (ID: 9)

适用场景：需求

## 基础字段（非自定义）

| 字段 | 参数名 | 必填 | 说明 |
|------|--------|------|------|
| 项目 | project_id | ✅ | 项目标识符，如 `tech-team` |
| 类型 | type_id | ✅ | 固定 `9` |
| 标题 | subject | ✅ | 需求标题 |
| 描述 | description | 否 | Markdown 格式，建议包含：需求描述、验收标准 |
| 开始日期 | start_date | 否 | 格式 `YYYY-MM-DD` |
| 截止日期 | due_date | 否 | 格式 `YYYY-MM-DD` |
| 受理人 | assignee_id | 否 | 用户 ID，通常是自己 |
| 负责人 | responsible_id | 否 | 用户 ID |
| 优先级 | priority_id | 否 | 默认 Normal (8) |

## 必填自定义字段

### customField9 - PIC (用户)

负责跟进此需求的人。

| 参数 | 值 |
|------|------|
| field_id | 9 |
| value | 用户 ID |

## 可选自定义字段

### customField62 - Dept. (选项)

所属部门。

| 参数 | 值 |
|------|------|
| field_id | 62 |
| value | 选项 ID |

允许值：

| 选项 ID | 名称 |
|---------|------|
| 268 | Product & UXD |
| 269 | Analytics |
| 270 | Tech |
| 281 | Tech-US |

## 创建示例

```json
{
  "params": {
    "project_id": "tech-team",
    "subject": "支付模块接入 Apple Pay",
    "type_id": 9,
    "description": "# 需求描述\n\n支付模块需要接入 Apple Pay，支持 iOS 用户使用\n\n# 验收标准\n\n1. iOS 用户可选择 Apple Pay 支付\n2. 支付流程与现有流程一致",
    "start_date": "2026-02-01",
    "due_date": "2026-03-31",
    "assignee_id": 33,
    "responsible_id": 13,
    "custom_fields": [
      {"field_id": 9, "value": "33"},
      {"field_id": 62, "value": "270"}
    ]
  }
}
```

## 描述格式规范

description 字段使用 Markdown 格式，推荐结构：

```markdown
# 需求描述

详细的需求说明

# 验收标准

1. 验收条件一
2. 验收条件二
```

如果用户只提供了简短描述，直接使用即可，不强制套模板。

## 注意事项

- Requirement 类型字段最少，仅 PIC (customField9) 为必填自定义字段
- Requirement 适用于简单的需求记录，不需要像 User Story 那样填写 Channel、Theme 等字段
- 可选字段仅有 Dept. (customField62)，用于标记所属部门
- description 建议包含：需求描述、验收标准
