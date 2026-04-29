---
name: query-kibana-logs
description: >
  当需要搜索微服务日志、查看 Elasticsearch/Kibana 日志、排查线上问题、追踪订单日志、查找错误异常、做日志聚合统计时使用。
  触发词：日志, log, kibana, 查日志, 错误日志, 服务日志, 订单日志, elasticsearch, 线上问题, 聚合, 统计
---

# Kibana 日志查询

查询 Yamibuy 微服务的 Elasticsearch 日志，支持简化模式和原生 ES 查询。

## 两种模式

1. **简化模式** — 通过参数快速查询日志
2. **原生模式** — 通过 `--body-file` 传入 ES 请求体文件，完全开放 ES 能力（聚合、复杂查询等）

## 脚本位置

脚本路径：`scripts/search.py`（相对于本 Skill 目录）

## 核心流程

1. 通过 Skill 目录定位脚本 `scripts/search.py`
2. 确定索引：通过 `-s 服务名` 或 `--index` 指定
3. 选择模式：简化参数 或 `--body-file` 原生请求体
4. 执行查询并分析结果
5. 如需定位代码，通过服务名查找对应 Git 仓库 → 参考 `references/service-mapping.md`

## 关键词匹配注意事项

`-k` 参数使用 ES `match_phrase`（短语精确匹配），关键词必须与日志中的实际文本完全一致。

**异常类名必须使用全限定名**：
- ✅ `-k "java.lang.NullPointerException"` — 能匹配到
- ❌ `-k "NullPointerException"` — 可能搜不到（日志中通常记录的是全限定类名）

**常见异常全限定名示例**：
- `java.lang.NullPointerException`
- `java.lang.IllegalArgumentException`
- `java.lang.IllegalStateException`
- `java.io.IOException`
- `java.sql.SQLException`
- `java.util.concurrent.TimeoutException`
- `org.springframework.web.client.HttpServerErrorException`

> 如果用户没有提供具体的查询关键字，而是笼统地说"查异常"或"查错误"，应优先使用 `--level error` 而非 `-k`。如果确实需要按异常类搜索，务必使用全限定类名。

## 快速参考

### 简化模式

```bash
python scripts/search.py -s so -t 1h                    # 按服务查
python scripts/search.py -s so -k "shipping"            # 服务 + 关键词
python scripts/search.py -o 2026020337619               # 按订单号
python scripts/search.py -s payment --level error       # 按日志级别
```

### 原生模式 (--body-file)

原生模式使用 `--body-file` 从文件读取 ES 请求体，避免命令行 JSON 转义问题。

**文件路径**: `<工作区>/.query-kibana-logs/kibana-query.json`

```bash
python scripts/search.py -s so --body-file /path/to/workspace
```

**使用流程**:
1. 将 ES 请求体 JSON 写入 `<工作区>/.query-kibana-logs/kibana-query.json`
2. 执行 `python scripts/search.py -s so --body-file <工作区路径>`
3. 修改文件内容，重复执行即可

**请求体示例**:

聚合 - 按小时统计:
```json
{
  "size": 0,
  "aggs": {
    "by_hour": {
      "date_histogram": {
        "field": "@timestamp",
        "interval": "hour"
      }
    }
  }
}
```

聚合 - 按服务统计:
```json
{
  "size": 0,
  "aggs": {
    "by_service": {
      "terms": {
        "field": "_index",
        "size": 20
      }
    }
  }
}
```

自定义查询:
```json
{
  "query": {
    "bool": {
      "must": [{"match": {"message": "error"}}],
      "filter": [{"range": {"@timestamp": {"gte": "now-1h"}}}]
    }
  },
  "size": 100,
  "sort": [{"@timestamp": "desc"}]
}
```

### 工具命令

```bash
python scripts/search.py --list-services    # 列出服务
python scripts/search.py -s so --show-index # 显示索引
```

## 参数说明

### 通用参数

| 参数 | 说明 |
|------|------|
| `-s` | 服务名 (模糊匹配，可多次指定) |
| `--index` | 直接指定索引模式 (覆盖 -s) |
| `--format` | 输出格式 (text/json/raw) |

### 简化模式参数

| 参数 | 说明 |
|------|------|
| `-k` | 关键词 (可多次指定) |
| `-o` | 订单号 |
| `--level` | 日志级别 (error/info/debug) |
| `-t` | 相对时间范围 (15m/1h/24h/7d) |
| `--start` | 开始时间 (格式: 2026-02-11 或 2026-02-11 10:00) |
| `--end` | 结束时间 |
| `-l` | 返回条数 (默认 50) |

### 原生模式参数

| 参数 | 说明 |
|------|------|
| `--body-file` | 传入工作区路径，从 `<工作区>/.query-kibana-logs/kibana-query.json` 读取 ES 请求体 |
| `--endpoint` | ES 端点 (默认 _search，可选 _count/_msearch) |

### 工具命令

| 参数 | 说明 |
|------|------|
| `--list-services` | 列出所有可用服务 |
| `--show-index` | 显示索引模式 (不执行查询) |

## 关键词匹配注意事项

简化模式的 `-k` 参数使用 ES `match_phrase`（短语精确匹配），关键词必须在日志中完整连续出现才能命中。

**当用户没有提供具体的查询关键字时（如只说"查一下空指针异常"），必须使用全限定类名作为关键词：**

| ❌ 错误写法 | ✅ 正确写法 |
|-------------|-------------|
| `NullPointerException` | `java.lang.NullPointerException` |
| `IllegalArgumentException` | `java.lang.IllegalArgumentException` |
| `IOException` | `java.io.IOException` |
| `TimeoutException` | `java.util.concurrent.TimeoutException` |
| `SQLException` | `java.sql.SQLException` |
| `ClassNotFoundException` | `java.lang.ClassNotFoundException` |
| `OutOfMemoryError` | `java.lang.OutOfMemoryError` |
| `StackOverflowError` | `java.lang.StackOverflowError` |

因为日志中异常堆栈通常打印的是全限定类名（如 `java.lang.NullPointerException: null`），短类名无法被 `match_phrase` 匹配到。

**原则：如果用户提供了明确的关键字就直接用；如果用户只描述了异常类型，则自动补全为全限定类名。**

## 参考文档

- 服务名与 Git 仓库的映射关系 → `references/service-mapping.md`
