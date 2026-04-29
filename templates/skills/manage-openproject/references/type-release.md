# Release (ID: 24)

适用场景：版本发布（里程碑类型）。Release 是里程碑类型，只有一个日期字段 `date`（不是 start_date/due_date）。

## 基础字段（非自定义）

| 字段 | 参数名 | 必填 | 说明 |
|------|--------|------|------|
| 项目 | project_id | ✅ | 项目标识符，如 `tech-team` |
| 类型 | type_id | ✅ | 固定 `24` |
| 标题 | subject | ✅ | Release 标题 |
| 描述 | description | 否 | Markdown 格式，建议包含：版本内容、发布计划 |
| 日期 | date | 否 | 格式 `YYYY-MM-DD`，里程碑专用日期字段（非 due_date） |
| 受理人 | assignee_id | 否 | 用户 ID，通常是自己 |
| 负责人 | responsible_id | 否 | 用户 ID |
| 优先级 | priority_id | 否 | 默认 Normal (8) |

## 必填自定义字段

### customField126 - Trimester (选项数组)

所属季度周期。

| 参数 | 值 |
|------|------|
| field_id | 126 |
| value | 选项 ID |
| is_array | true |

允许值（常用）：

| 选项 ID | 名称 |
|---------|------|
| 656 | T1 2026 |
| 521 | T1 2025 |
| 522 | T2 2025 |
| 523 | T3 2025 |

## 可选自定义字段

### customField11 - Symbol (文本)

周数标识，格式 `YYYYWW`，每次创建时动态计算。

| 参数 | 值 |
|------|------|
| field_id | 11 |
| value | 如 `"202607"` |
| is_text | true |

### customField83 - 产品优先级 (整数)

产品优先级数值。

| 参数 | 值 |
|------|------|
| field_id | 83 |
| value | 整数值 |

### customField85 - Sprint Code (文本)

Sprint 编号。

| 参数 | 值 |
|------|------|
| field_id | 85 |
| value | 文本 |
| is_text | true |

## 创建示例

```json
{
  "params": {
    "project_id": "tech-team",
    "subject": "v2.5.0 发布",
    "type_id": 24,
    "date": "2026-02-28",
    "assignee_id": 33,
    "custom_fields": [
      {"field_id": 11, "value": "202609", "is_text": true},
      {"field_id": 126, "value": "656", "is_array": true}
    ]
  }
}
```

## 描述格式规范

description 字段使用 Markdown 格式。里程碑/发布类型通常描述简短，说明关键节点即可，无固定模板要求。

## 注意事项

- Release 是里程碑类型，使用 `date` 字段（不是 start_date/due_date）
- Trimester (customField126) 是唯一的必填自定义字段
- 产品优先级 (customField83) 为整数类型，用于排序
- Trimester 注意使用当前有效的值（当前为 T1 2026=656）
- Release 通常用于标记版本发布的目标日期
