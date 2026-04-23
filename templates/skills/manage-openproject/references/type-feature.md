# Feature (ID: 4)

适用场景：功能需求

## 基础字段（非自定义）

| 字段 | 参数名 | 必填 | 说明 |
|------|--------|------|------|
| 项目 | project_id | ✅ | 项目标识符，如 `tech-team` |
| 类型 | type_id | ✅ | 固定 `4` |
| 标题 | subject | ✅ | Feature 标题 |
| 描述 | description | 否 | Markdown 格式，建议包含：背景、期望、验收标准 |
| 开始日期 | start_date | 否 | 格式 `YYYY-MM-DD` |
| 截止日期 | due_date | 否 | 格式 `YYYY-MM-DD` |
| 受理人 | assignee_id | 否 | 用户 ID，通常是自己 |
| 负责人 | responsible_id | 否 | 用户 ID |
| 优先级 | priority_id | 否 | 默认 Normal (8) |

## 必填自定义字段

### customField9 - PIC (用户)

负责跟进此 Feature 的人。

| 参数 | 值 |
|------|------|
| field_id | 9 |
| value | 用户 ID |

### customField16 - Requestor (用户)

需求提出人。

| 参数 | 值 |
|------|------|
| field_id | 16 |
| value | 用户 ID |

### customField1 - Channel (选项数组)

Feature 所属业务渠道。

| 参数 | 值 |
|------|------|
| field_id | 1 |
| value | 选项 ID |
| is_array | true |

允许值：

| 选项 ID | 名称 |
|---------|------|
| 1 | Others |
| 3 | Big Data |
| 5 | Pre-Purchase |
| 6 | Purchase |
| 7 | Retail |
| 239 | Operations |
| 240 | Marketplace |
| 314 | QA Automation |
| 315 | Architecture |
| 316 | Devops |
| 478 | Platform Service |
| 507 | Growth Marketing |
| 524 | Category |
| 525 | Supply Chain |
| 602 | SSS-1P |
| 603 | SSS-3P |

### customField54 - Theme (选项)

所属主题分类。

| 参数 | 值 |
|------|------|
| field_id | 54 |
| value | 选项 ID |

允许值：

| 选项 ID | 名称 |
|---------|------|
| 242 | Organic growth (自然增长) |
| 243 | Improved profitability (提高盈利) |
| 244 | Marketing efficiency (营销效率) |
| 245 | Improvement (改进) |
| 246 | Analyse / Data report |

## 可选自定义字段

### customField11 - Symbol (文本)

周数标识，格式 `YYYYWW`，每次创建时动态计算。

| 参数 | 值 |
|------|------|
| field_id | 11 |
| value | 如 `"202607"` |
| is_text | true |

### customField17 - Launched Date (日期)

上线日期。

| 参数 | 值 |
|------|------|
| field_id | 17 |
| value | 格式 `YYYY-MM-DD` |

### customField51 - PM (用户)

项目经理。

| 参数 | 值 |
|------|------|
| field_id | 51 |
| value | 用户 ID |

### customField52 - Designer (用户)

设计师。

| 参数 | 值 |
|------|------|
| field_id | 52 |
| value | 用户 ID |

### customField53 - Impact (富文本)

影响描述，Markdown 格式。

| 参数 | 值 |
|------|------|
| field_id | 53 |
| value | Markdown 文本 |

### customField55 - Reach (选项)

影响范围评估（RICE 模型中的 R）。

| 参数 | 值 |
|------|------|
| field_id | 55 |
| value | 选项 ID |

允许值：

| 选项 ID | 名称 |
|---------|------|
| 247 | 10.0 = Impacts the vast majority (~80% or greater) |
| 248 | 6.0 = Impacts a large percentage (~50% to ~80%) |
| 249 | 3.0 = Significant reach (~25% to ~50%) |
| 250 | 1.5 = Small reach (~5% to ~25%) |
| 251 | 0.5 = Minimal reach (Less than ~5%) |

### customField56 - Confidence (选项)

信心度评估（RICE 模型中的 C）。

| 参数 | 值 |
|------|------|
| field_id | 56 |
| value | 选项 ID |

允许值：

| 选项 ID | 名称 |
|---------|------|
| 252 | High = 100% |
| 253 | Medium = 80% |
| 254 | Low = 50% |

### customField57 - Platform (选项数组)

影响的平台。

| 参数 | 值 |
|------|------|
| field_id | 57 |
| value | 选项 ID |
| is_array | true |

允许值：

| 选项 ID | 名称 |
|---------|------|
| 255 | iOS |
| 256 | Android |
| 257 | PC |
| 258 | H5 |

### customField83 - 产品优先级 (整数)

产品优先级数值，数字越小优先级越高。

| 参数 | 值 |
|------|------|
| field_id | 83 |
| value | 整数 |

## 创建示例

```json
{
  "params": {
    "project_id": "tech-team",
    "subject": "新增用户积分功能",
    "type_id": 4,
    "description": "# 背景\n\n用户需要积分激励体系\n\n# 期望\n\n完成积分获取和消费功能\n\n# 验收标准\n\n1. 用户可以通过购物获取积分\n2. 用户可以使用积分抵扣",
    "start_date": "2026-02-01",
    "due_date": "2026-02-28",
    "assignee_id": 33,
    "responsible_id": 13,
    "custom_fields": [
      {"field_id": 1, "value": "603", "is_array": true},
      {"field_id": 9, "value": "33"},
      {"field_id": 11, "value": "202607", "is_text": true},
      {"field_id": 16, "value": "33"},
      {"field_id": 54, "value": "245"},
      {"field_id": 55, "value": "248"},
      {"field_id": 56, "value": "252"},
      {"field_id": 57, "value": "255", "is_array": true}
    ]
  }
}
```

## 描述格式规范

description 字段使用 Markdown 格式，推荐结构：

```markdown
# 背景

功能需求的背景和动机

# 期望

期望实现的效果

# 验收标准

1. 验收条件一
2. 验收条件二
```

如果用户只提供了简短描述，直接使用即可，不强制套模板。

## 注意事项

- PIC (customField9) 通常指向负责执行的人
- Requestor (customField16) 是需求提出人，不一定是创建者
- Feature 不需要 Trimester 字段（与 Task 不同）
- Reach (customField55) 和 Confidence (customField56) 用于 RICE 优先级评估模型
- Impact (customField53) 为富文本字段，建议用 Markdown 格式描述功能影响
- description 建议包含：背景、期望、验收标准三个部分
