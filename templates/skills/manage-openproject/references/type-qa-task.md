# QA-Task (ID: 23)

适用场景：QA 测试任务

## 基础字段（非自定义）

| 字段 | 参数名 | 必填 | 说明 |
|------|--------|------|------|
| 项目 | project_id | ✅ | 项目标识符，如 `tech-team` |
| 类型 | type_id | ✅ | 固定 `23` |
| 标题 | subject | ✅ | QA-Task 标题 |
| 描述 | description | 否 | Markdown 格式，建议包含：测试范围、测试要点 |
| 开始日期 | start_date | 否 | 格式 `YYYY-MM-DD` |
| 截止日期 | due_date | 否 | 格式 `YYYY-MM-DD` |
| 受理人 | assignee_id | 否 | 用户 ID，通常是自己 |
| 负责人 | responsible_id | 否 | 用户 ID |
| 优先级 | priority_id | 否 | 默认 Normal (8) |

## 必填自定义字段

### customField9 - PIC (用户)

负责跟进此 QA-Task 的人。

| 参数 | 值 |
|------|------|
| field_id | 9 |
| value | 用户 ID（如 `"33"`） |

### customField1 - Channel (选项数组)

QA-Task 所属业务渠道。

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

### customField17 - Launched Date (日期)

上线日期。

| 参数 | 值 |
|------|------|
| field_id | 17 |
| value | 格式 `YYYY-MM-DD` |

### customField18 - Project Type (选项)

项目类型分类。

| 参数 | 值 |
|------|------|
| field_id | 18 |
| value | 选项 ID |

允许值（常用）：

| 选项 ID | 名称 |
|---------|------|
| 271 | Tech |
| 42 | Business |
| 168 | Other |
| 170 | OKR-T |
| 241 | OKR-B |
| 423 | Company |
| 424 | Department |
| 425 | Cross |

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

### customField66 - Topic (选项)

话题分类。

| 参数 | 值 |
|------|------|
| field_id | 66 |
| value | 选项 ID |

允许值：

| 选项 ID | 名称 |
|---------|------|
| 275 | SEO |
| 276 | PHP Reform |
| 282 | Customer Segmentation |
| 283 | Performance |
| 350 | Multi-language |
| 351 | Information Security |
| 398 | Cross Team |
| 577 | GEO |

### customField85 - Sprint Code (文本)

Sprint 编号。

| 参数 | 值 |
|------|------|
| field_id | 85 |
| value | 文本 |
| is_text | true |

### customField158 - Analyse_Result (选项数组)

QA 分析结果分类。

| 参数 | 值 |
|------|------|
| field_id | 158 |
| value | 选项 ID |
| is_array | true |

允许值：

| 选项 ID | 名称 |
|---------|------|
| 544 | Bug |
| 545 | Data_Error |
| 546 | Autoqa_Code_Issue |
| 547 | Others |

### customField160 - Analyse_Reason (文本)

分析原因说明。

| 参数 | 值 |
|------|------|
| field_id | 160 |
| value | 文本 |
| is_text | true |

### customField161 - other (文本)

其他补充信息。

| 参数 | 值 |
|------|------|
| field_id | 161 |
| value | 文本 |
| is_text | true |

### customField162 - testing_code_issue (文本)

测试代码问题描述。

| 参数 | 值 |
|------|------|
| field_id | 162 |
| value | 文本 |
| is_text | true |

### customField163 - bug (文本)

Bug 关联描述。

| 参数 | 值 |
|------|------|
| field_id | 163 |
| value | 文本 |
| is_text | true |

## 创建示例

```json
{
  "params": {
    "project_id": "tech-team",
    "subject": "支付模块回归测试",
    "type_id": 23,
    "description": "# 测试范围\n\n支付模块全流程回归测试\n\n# 测试要点\n\n1. 下单支付\n2. 退款\n3. 异常场景",
    "start_date": "2026-02-10",
    "due_date": "2026-02-13",
    "assignee_id": 33,
    "responsible_id": 13,
    "custom_fields": [
      {"field_id": 1, "value": "603", "is_array": true},
      {"field_id": 9, "value": "13"},
      {"field_id": 11, "value": "202607", "is_text": true},
      {"field_id": 18, "value": "271"},
      {"field_id": 126, "value": "656", "is_array": true}
    ]
  }
}
```

## 描述格式规范

description 字段使用 Markdown 格式，推荐结构：

```markdown
# 测试范围

需要测试的功能模块和场景

# 测试要点

重点关注的测试点和边界条件
```

如果用户只提供了简短描述，直接使用即可，不强制套模板。

## 注意事项

- PIC (customField9) 通常指向负责测试的 QA 人员
- Analyse_Result (customField158) 用于记录 QA 分析结果分类，可多选
- Analyse_Reason (customField160) 配合 Analyse_Result 使用，记录具体原因
- testing_code_issue (customField162) 和 bug (customField163) 分别记录测试代码问题和 Bug 关联信息
- Trimester 注意使用当前有效的值（当前为 T1 2026=656）
