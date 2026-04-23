# Bug (ID: 7)

适用场景：缺陷修复

## 基础字段（非自定义）

| 字段 | 参数名 | 必填 | 说明 |
|------|--------|------|------|
| 项目 | project_id | ✅ | 项目标识符，如 `tech-team` |
| 类型 | type_id | ✅ | 固定 `7` |
| 标题 | subject | ✅ | Bug 标题 |
| 描述 | description | 否 | Markdown 格式，建议包含：背景、原因、修复方案 |
| 开始日期 | start_date | 否 | 格式 `YYYY-MM-DD` |
| 截止日期 | due_date | 否 | 格式 `YYYY-MM-DD` |
| 受理人 | assignee_id | 否 | 用户 ID，通常是自己 |
| 负责人 | responsible_id | 否 | 用户 ID |
| 优先级 | priority_id | 否 | 默认 Normal (8) |

## 必填自定义字段

### customField9 - PIC (用户)

负责跟进此 Bug 的人。

| 参数 | 值 |
|------|------|
| field_id | 9 |
| value | 用户 ID（如 `"13"` = waylon tian） |

### customField1 - Channel (选项数组)

Bug 所属业务渠道。

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

### customField15 - Bug Environment (选项)

Bug 发现的环境，Bug 类型特有字段。

| 参数 | 值 |
|------|------|
| field_id | 15 |
| value | 选项 ID |

允许值：

| 选项 ID | 名称 | 说明 |
|---------|------|------|
| 36 | PRD | 生产环境 |
| 37 | PRE | 预发环境 |
| 38 | GQC | 测试环境 |
| 39 | DEV | 开发环境 |

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

### customField84 - Bug Root Cause Analysis (富文本)

Bug 根因分析，Markdown 格式。

| 参数 | 值 |
|------|------|
| field_id | 84 |
| value | Markdown 文本 |
| is_rich_text | true |

### customField57 - Platform (选项数组)

Bug 影响的平台。

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

### customField117 - App Version (选项)

App 验收版本，选项值会随时间更新，创建时通过 `get-schema` 获取最新列表。

| 参数 | 值 |
|------|------|
| field_id | 117 |
| value | 选项 ID |

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

### customField85 - Sprint Code (文本)

Sprint 编号。

| 参数 | 值 |
|------|------|
| field_id | 85 |
| value | 文本 |
| is_text | true |

### customField17 - Launched Date (日期)

上线日期。

| 参数 | 值 |
|------|------|
| field_id | 17 |
| value | 格式 `YYYY-MM-DD` |

## 创建示例

```json
{
  "params": {
    "project_id": "tech-team",
    "subject": "修复 ec-openapi-service ImageUtil.uploadImage NPE 问题",
    "type_id": 7,
    "description": "# 背景\n\nec-openapi-service 线上出现 NullPointerException\n\n# 原因\n\nImageIO.read() 返回 null 时未做空检查\n\n# 修复方案\n\n增加 null 检查",
    "start_date": "2026-02-10",
    "due_date": "2026-02-13",
    "assignee_id": 33,
    "responsible_id": 13,
    "custom_fields": [
      {"field_id": 1, "value": "603", "is_array": true},
      {"field_id": 9, "value": "13"},
      {"field_id": 11, "value": "202607", "is_text": true},
      {"field_id": 15, "value": "36"},
      {"field_id": 18, "value": "271"},
      {"field_id": 62, "value": "270"},
      {"field_id": 84, "value": "ImageIO.read() 返回 null 时（图片格式不支持或数据损坏），代码未做空检查直接调用 getWidth()，导致 NPE。", "is_rich_text": true},
      {"field_id": 126, "value": "656", "is_array": true}
    ]
  }
}
```

## 描述格式规范

description 字段使用 Markdown 格式，推荐结构：

```markdown
# 背景

Bug 的发现场景和表现

# 原因

根因分析

# 修复方案

具体修复方案和影响范围
```

如果用户只提供了简短描述，直接使用即可，不强制套模板。

## 注意事项

- Bug 的 PIC (customField9) 通常指向负责修复的人，不一定是创建者
- Bug Environment (customField15) 是 Bug 类型特有的必填字段
- **customField84 (Bug Root Cause Analysis)：当用户提供了原因/根因信息时，必须自动填充此字段，不要只放在 description 里**
- App Version (customField117) 选项值会定期更新，建议创建时通过 `get-schema` 获取最新列表
- description 建议包含：背景、原因、修复方案三个部分
- Trimester 注意使用当前有效的值（当前为 T1 2026=656）
