# Project (ID: 8)

适用场景：项目级工作包（默认类型）

> **注意：** Project 类型的 schema 和 User Story (ID: 6) 完全一致，所有字段相同。

## 基础字段（非自定义）

| 字段 | 参数名 | 必填 | 说明 |
|------|--------|------|------|
| 项目 | project_id | ✅ | 项目标识符，如 `tech-team` |
| 类型 | type_id | ✅ | 固定 `8` |
| 标题 | subject | ✅ | Project 标题 |
| 描述 | description | 否 | Markdown 格式，建议包含：背景、目标、期望产出 |
| 开始日期 | start_date | 否 | 格式 `YYYY-MM-DD` |
| 截止日期 | due_date | 否 | 格式 `YYYY-MM-DD` |
| 受理人 | assignee_id | 否 | 用户 ID，通常是自己 |
| 负责人 | responsible_id | 否 | 用户 ID |
| 优先级 | priority_id | 否 | 默认 Normal (8) |

## 必填自定义字段

### customField9 - PIC (用户)

负责跟进此 Project 的人。

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

所属业务渠道。

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

主题分类。

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

### customField89 - Requirement type (选项)

需求类型。

| 参数 | 值 |
|------|------|
| field_id | 89 |
| value | 选项 ID |

允许值：

| 选项 ID | 名称 |
|---------|------|
| 333 | UI |
| 334 | UI/UX |
| 335 | New Feature |
| 336 | Epic |
| 337 | Data |
| 338 | Bug Fix |
| 339 | Tech |
| 340 | Support |

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

允许值：

| 选项 ID | 名称 |
|---------|------|
| 423 | Company |
| 424 | Department |
| 241 | OKR-B |
| 170 | OKR-T |
| 425 | Cross |
| 42 | Business |
| 271 | Tech |
| 168 | Other |

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

产品经理。

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

影响说明，Markdown 格式。

| 参数 | 值 |
|------|------|
| field_id | 53 |
| value | Markdown 文本 |

### customField55 - Reach (选项)

影响范围评分。

| 参数 | 值 |
|------|------|
| field_id | 55 |
| value | 选项 ID |

允许值：

| 选项 ID | 名称 |
|---------|------|
| 247 | 10.0 |
| 248 | 6.0 |
| 249 | 3.0 |
| 250 | 1.5 |
| 251 | 0.5 |

### customField56 - Confidence (选项)

信心等级。

| 参数 | 值 |
|------|------|
| field_id | 56 |
| value | 选项 ID |

允许值：

| 选项 ID | 名称 |
|---------|------|
| 252 | High |
| 253 | Medium |
| 254 | Low |

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

### customField61 - Product iteration (选项)

产品迭代版本，选项值会随时间更新，创建时通过 `get-schema` 获取最新列表。

| 参数 | 值 |
|------|------|
| field_id | 61 |
| value | 选项 ID |

允许值（最近几个，完整列表通过 `get-schema` 获取）：

| 选项 ID | 名称 |
|---------|------|
| 675 | Iteration 26-11 |
| 676 | Iteration 26-10 |
| 677 | Iteration 26-09 |
| 678 | Iteration 26-08 |

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

### customField83 - 产品优先级 (整数)

产品优先级数值。

| 参数 | 值 |
|------|------|
| field_id | 83 |
| value | 整数 |

### customField87 - Is reporting (布尔)

是否需要报告。

| 参数 | 值 |
|------|------|
| field_id | 87 |
| value | `"true"` 或 `"false"` |
| is_bool | true |

### customField90 - product logged date (日期)

产品登记日期。

| 参数 | 值 |
|------|------|
| field_id | 90 |
| value | 格式 `YYYY-MM-DD` |

### customField91 - product planning date (日期)

产品规划日期。

| 参数 | 值 |
|------|------|
| field_id | 91 |
| value | 格式 `YYYY-MM-DD` |

### customField92 - Tech confirmed time (日期)

技术确认时间。

| 参数 | 值 |
|------|------|
| field_id | 92 |
| value | 格式 `YYYY-MM-DD` |
| is_text | true |

### customField117 - App Version (选项)

App 验收版本，选项值会随时间更新，创建时通过 `get-schema` 获取最新列表。

| 参数 | 值 |
|------|------|
| field_id | 117 |
| value | 选项 ID |

允许值（最近几个，完整列表通过 `get-schema` 获取）：

| 选项 ID | 名称 |
|---------|------|
| 673 | 26/4/29提验收 |
| 672 | 26/4/22提验收 |

### customField127 - AB Testing (布尔)

是否进行 AB 测试。

| 参数 | 值 |
|------|------|
| field_id | 127 |
| value | `"true"` 或 `"false"` |
| is_bool | true |

### customField129 - Objectives (选项数组)

OKR 目标。

| 参数 | 值 |
|------|------|
| field_id | 129 |
| value | 选项 ID |
| is_array | true |

允许值：

| 选项 ID | 名称 |
|---------|------|
| 415 | O1 |
| 416 | O2 |
| 417 | O3 |
| 418 | O4 |

### customField130 - Key Results (选项数组)

OKR 关键结果。

| 参数 | 值 |
|------|------|
| field_id | 130 |
| value | 选项 ID |
| is_array | true |

允许值：

| 选项 ID | 名称 |
|---------|------|
| 419 | KR1 |
| 420 | KR2 |
| 421 | KR3 |
| 422 | KR4 |

### customField149 - Cross Source (选项)

跨团队来源。

| 参数 | 值 |
|------|------|
| field_id | 149 |
| value | 选项 ID |

允许值：

| 选项 ID | 名称 |
|---------|------|
| 491 | Others |
| 492 | Retail |
| 493 | Pre-Purchase |
| 494 | Purchase |
| 495 | Big Data |
| 496 | Operations |
| 497 | Marketplace |
| 498 | Platform Service |
| 499 | QA Automation |
| 500 | Architecture |
| 501 | Devops |
| 512 | Growth |
| 526 | Supply Chain |
| 527 | Category |
| 617 | SSS-1P |
| 618 | SSS-3P |

### customField165 - Topic Tag (选项数组)

话题标签。

| 参数 | 值 |
|------|------|
| field_id | 165 |
| value | 选项 ID |
| is_array | true |

允许值：

| 选项 ID | 名称 |
|---------|------|
| 572 | fix |
| 573 | internal-tool |
| 574 | new-channel: GEO |
| 575 | new-channel: Reddit |
| 576 | content |
| 578 | research |

### customField168 - 测试类型 (选项)

测试执行方式。

| 参数 | 值 |
|------|------|
| field_id | 168 |
| value | 选项 ID |

允许值：

| 选项 ID | 名称 |
|---------|------|
| 628 | 人工 |
| 629 | 自动化 |
| 630 | 人工&自动化 |

### customField169 - 自动化比例 (整数)

自动化测试覆盖比例。

| 参数 | 值 |
|------|------|
| field_id | 169 |
| value | 整数（百分比） |

## 创建示例

```json
{
  "params": {
    "project_id": "tech-team",
    "subject": "2月份AI使用指南分享",
    "type_id": 8,
    "description": "# 背景\n\n团队需要 AI 工具使用培训\n\n# 目标\n\n完成分享并输出文档\n\n# 期望产出\n\n1. AI 工具使用手册\n2. 团队培训完成",
    "start_date": "2026-02-01",
    "due_date": "2026-02-28",
    "assignee_id": 33,
    "responsible_id": 13,
    "custom_fields": [
      {"field_id": 1, "value": "603", "is_array": true},
      {"field_id": 9, "value": "33"},
      {"field_id": 11, "value": "202607", "is_text": true},
      {"field_id": 16, "value": "33"},
      {"field_id": 18, "value": "271"},
      {"field_id": 54, "value": "245"},
      {"field_id": 62, "value": "270"},
      {"field_id": 89, "value": "339"},
      {"field_id": 92, "value": "2026-02-01", "is_text": true},
      {"field_id": 126, "value": "656", "is_array": true}
    ]
  }
}
```

## 描述格式规范

description 字段使用 Markdown 格式，推荐结构：

```markdown
# 背景

项目的背景和上下文

# 目标

项目要达成的目标

# 期望产出

具体的交付物和产出
```

如果用户只提供了简短描述，直接使用即可，不强制套模板。

## 注意事项

- Project 类型的 schema 和 User Story (ID: 6) 完全一致，所有自定义字段相同
- Project 有 6 个必填自定义字段：PIC、Requestor、Channel、Theme、Requirement type、Trimester
- type_id 固定为 `8`，这是与 User Story 唯一的区别
- Product iteration (customField61) 和 App Version (customField117) 选项值会定期更新，建议创建时通过 `get-schema` 获取最新列表
- description 建议包含：背景、目标、期望产出
- Trimester 注意使用当前有效的值（当前为 T1 2026=656）