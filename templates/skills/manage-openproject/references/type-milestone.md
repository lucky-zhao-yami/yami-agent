# Milestone (ID: 2)

适用场景：里程碑节点。Milestone 是里程碑类型，只有一个日期字段 `date`（不是 start_date/due_date）。

## 基础字段（非自定义）

| 字段 | 参数名 | 必填 | 说明 |
|------|--------|------|------|
| 项目 | project_id | ✅ | 项目标识符，如 `tech-team` |
| 类型 | type_id | ✅ | 固定 `2` |
| 标题 | subject | ✅ | Milestone 标题 |
| 描述 | description | 否 | Markdown 格式 |
| 日期 | date | 否 | 格式 `YYYY-MM-DD`，里程碑专用日期字段（非 due_date） |
| 受理人 | assignee_id | 否 | 用户 ID，通常是自己 |
| 负责人 | responsible_id | 否 | 用户 ID |
| 优先级 | priority_id | 否 | 默认 Normal (8) |

## 必填自定义字段

### customField9 - PIC (用户)

负责跟进此里程碑的人。

| 参数 | 值 |
|------|------|
| field_id | 9 |
| value | 用户 ID（如 `"33"`） |

## 可选自定义字段

### customField11 - Symbol (文本)

周数标识，格式 `YYYYWW`，每次创建时动态计算。

| 参数 | 值 |
|------|------|
| field_id | 11 |
| value | 如 `"202607"` |
| is_text | true |

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
    "subject": "Q1 版本发布",
    "type_id": 2,
    "date": "2026-03-31",
    "assignee_id": 33,
    "responsible_id": 13,
    "custom_fields": [
      {"field_id": 9, "value": "33"},
      {"field_id": 11, "value": "202613", "is_text": true},
      {"field_id": 62, "value": "270"}
    ]
  }
}
```

## 描述格式规范

description 字段使用 Markdown 格式。里程碑/发布类型通常描述简短，说明关键节点即可，无固定模板要求。

## 注意事项

- Milestone 是里程碑类型，使用 `date` 字段（不是 start_date/due_date）
- PIC (customField9) 通常指向负责跟进此里程碑的人
- Dept. (customField62) 用于标识里程碑所属部门
- 里程碑通常用于标记关键时间节点，如版本发布、阶段完成等
