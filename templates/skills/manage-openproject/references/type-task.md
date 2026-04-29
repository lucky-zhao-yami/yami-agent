# Task (ID: 1)

适用场景：日常任务、小需求

## 基础字段（非自定义）

| 字段 | 参数名 | 必填 | 说明 |
|------|--------|------|------|
| 项目 | project_id | ✅ | 项目标识符，如 `tech-team` |
| 类型 | type_id | ✅ | 固定 `1` |
| 标题 | subject | ✅ | Task 标题 |
| 描述 | description | 否 | Markdown 格式 |
| 开始日期 | start_date | 否 | 格式 `YYYY-MM-DD` |
| 截止日期 | due_date | 否 | 格式 `YYYY-MM-DD` |
| 受理人 | assignee_id | 否 | 用户 ID，通常是自己 |
| 负责人 | responsible_id | 否 | 用户 ID |
| 优先级 | priority_id | 否 | 默认 Normal (8) |

## 必填自定义字段

### customField9 - PIC (用户)

负责跟进此 Task 的人。

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

Task 所属业务渠道。

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

### customField19 - Test Case Analyze (选项)

测试用例影响分析。

| 参数 | 值 |
|------|------|
| field_id | 19 |
| value | 选项 ID |

允许值：

| 选项 ID | 名称 |
|---------|------|
| 44 | 有影响 |
| 45 | 无影响 |

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

### customField58 - Analytics team priorities (选项)

数据团队优先级。

| 参数 | 值 |
|------|------|
| field_id | 58 |
| value | 选项 ID |

允许值：

| 选项 ID | 名称 |
|---------|------|
| 259 | Important and Urgent |
| 260 | Not Important but Urgent |
| 261 | Important but Not Urgent |
| 262 | Not Important and Not Urgent |

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

### customField63 - Off Track Reason (选项)

偏离轨道原因。

| 参数 | 值 |
|------|------|
| field_id | 63 |
| value | 选项 ID |

允许值：

| 选项 ID | 名称 |
|---------|------|
| 272 | 资源问题 |
| 304 | 任务依赖问题 |
| 305 | 风险和问题管理不善 |
| 306 | 范围膨胀 |
| 307 | 沟通问题 |
| 308 | 变更管理问题 |
| 309 | 技术挑战 |
| 310 | 缺乏项目管理经验 |
| 311 | 外部干扰 |
| 312 | 非预期的事件 |

### customField64 - Off Track Day (文本)

偏离轨道天数。

| 参数 | 值 |
|------|------|
| field_id | 64 |
| value | 文本 |
| is_text | true |

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
| 577 | GEO |
| 276 | PHP Reform |
| 282 | Customer Segmentation |
| 283 | Performance |
| 350 | Multi-language |
| 351 | Information Security |
| 398 | Cross Team |

### customField67 - BSA_Type (选项)

BSA 类型分类。

| 参数 | 值 |
|------|------|
| field_id | 67 |
| value | 选项 ID |

允许值：

| 选项 ID | 名称 |
|---------|------|
| 277 | Inventory |
| 278 | PO |
| 279 | TMS |
| 280 | WMS |
| 317 | Marketplace |

### customField83 - 产品优先级 (整数)

产品优先级数值，数字越小优先级越高。

| 参数 | 值 |
|------|------|
| field_id | 83 |
| value | 整数 |

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
    "subject": "优化缓存逻辑",
    "type_id": 1,
    "description": "优化 Redis 缓存策略，减少数据库查询",
    "start_date": "2026-02-09",
    "due_date": "2026-02-15",
    "assignee_id": 33,
    "responsible_id": 13,
    "custom_fields": [
      {"field_id": 1, "value": "603", "is_array": true},
      {"field_id": 9, "value": "33"},
      {"field_id": 11, "value": "202607", "is_text": true},
      {"field_id": 16, "value": "33"},
      {"field_id": 54, "value": "245"},
      {"field_id": 126, "value": "656", "is_array": true}
    ]
  }
}
```

## 描述格式规范

description 字段使用 Markdown 格式，推荐结构：

```markdown
# 背景

说明任务的背景和上下文

# 任务内容

具体要做什么，包括技术方案或实现步骤
```

如果用户只提供了简短描述，直接使用即可，不强制套模板。

## 注意事项

- PIC (customField9) 通常指向负责执行的人
- Requestor (customField16) 是需求提出人，不一定是创建者
- Theme (customField54) 是 Task 类型特有的必填字段
- Trimester (customField126) 注意使用当前有效的值（当前为 T1 2026=656）
- Symbol (customField11) 格式为 `YYYYWW`，每次创建时需动态计算当前周数
