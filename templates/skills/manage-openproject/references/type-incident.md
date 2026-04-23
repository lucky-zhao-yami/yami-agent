# Incident (ID: 49)

适用场景：线上事故

## 基础字段（非自定义）

| 字段 | 参数名 | 必填 | 说明 |
|------|--------|------|------|
| 项目 | project_id | ✅ | 项目标识符，如 `tech-team` |
| 类型 | type_id | ✅ | 固定 `49` |
| 标题 | subject | ✅ | Incident 标题 |
| 描述 | description | 否 | Markdown 格式，建议包含：事故描述、影响范围、根因 |
| 开始日期 | start_date | 否 | 格式 `YYYY-MM-DD` |
| 截止日期 | due_date | 否 | 格式 `YYYY-MM-DD` |
| 受理人 | assignee_id | 否 | 用户 ID，通常是自己 |
| 负责人 | responsible_id | 否 | 用户 ID |
| 优先级 | priority_id | 否 | 默认 Normal (8) |

## 必填自定义字段

无必填自定义字段（schema 返回空对象 `{}`）。

## 可选自定义字段

无可选自定义字段。

## 创建示例

```json
{
  "params": {
    "project_id": "tech-team",
    "subject": "生产环境数据库连接池耗尽",
    "type_id": 49,
    "description": "# 事故描述\n\n2026-02-09 14:30 生产环境数据库连接池耗尽，导致服务不可用\n\n# 影响范围\n\n全站 API 请求超时约 15 分钟\n\n# 根因\n\n慢查询导致连接未及时释放",
    "start_date": "2026-02-09",
    "due_date": "2026-02-09",
    "assignee_id": 33,
    "responsible_id": 13
  }
}
```

## 描述格式规范

description 字段使用 Markdown 格式，推荐结构：

```markdown
# 事故描述

事故的具体表现和发现过程

# 影响范围

受影响的用户、功能、数据范围

# 根因

事故的根本原因分析
```

如果用户只提供了简短描述，直接使用即可，不强制套模板。

## 注意事项

- Incident 类型无自定义字段要求，schema 返回空对象 `{}`
- description 建议包含：事故描述、影响范围、根因三个部分
- 建议 start_date 和 due_date 设为事故发生当天
- 优先级建议根据事故严重程度设置，重大事故使用 Immediate 或 High
