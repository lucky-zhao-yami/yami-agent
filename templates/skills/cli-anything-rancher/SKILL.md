---
name: "cli-anything-rancher"
description: "通过 Rancher API 下载 K8s pod 日志。当接口测试、Web UI 测试失败、服务报错、页面异常、需要查看后端日志排查问题时使用。触发词：rancher, pod日志, 下载日志, 查看日志, 服务报错, 500错误, 排查问题, 接口报错, 页面报错, web测试失败"
---

# cli-anything-rancher — 日志下载与排查

当接口测试或 Web UI 测试失败、服务返回错误时，用此工具下载后端 pod 日志定位根因。

## 环境

| Profile | URL | 说明 |
|---------|-----|------|
| `dev` | https://dev-rancher.yamibuy.tech | 开发环境（默认） |
| `gqc` | https://gqc-rancher.yamibuy.tech | GQC 测试环境 |
| `uat` | https://uat-rancher.yamibuy.tech | UAT 环境 |

默认 Cluster: `c-xj4gs`，默认 Namespace: `dev-ec`。

## 测试失败排查 SOP

当接口测试返回 500/超时/业务错误，或 Web UI 测试出现页面报错/数据异常/操作失败时，按以下步骤排查：

### Step 0: 确定目标服务

- **接口测试失败**：从请求 URL 判断服务名（如 `/ec-so/api/...` → `ec-so-service`）
- **Web UI 测试失败**：根据页面功能推断后端服务：
  - 订单相关页面 → `ec-so-service` / `central-so-service`
  - 支付相关 → `ec-payment-service`
  - 退货/RMA → `ec-rma-service` / `central-rma-service`
  - 客户/账户 → `ec-customer-service` / `central-customer-service`
  - 不确定时，先下载最可能的服务日志，grep 不到再换

### Step 1: 下载服务日志

日志统一下载到 `./logs/<env>/<service>/` 目录：

```bash
cli-anything-rancher -p <env> logs download <service-name> -d -t 3000 -o ./logs/<env>/<service>/
```

示例：
```bash
# gqc 环境 ec-so-service 报错
cli-anything-rancher -p gqc logs download ec-so-service -d -t 3000 -o ./logs/gqc/ec-so-service/

# dev 环境 ec-payment-service 报错
cli-anything-rancher -p dev logs download ec-payment-service -d -t 3000 -o ./logs/dev/ec-payment-service/

# 切换 namespace
cli-anything-rancher -p gqc -n gqc-central logs download central-so-service -d -t 3000 -o ./logs/gqc/central-so-service/
```

### Step 2: 在日志中搜索错误

```bash
# 搜索异常和错误
grep -i "exception\|error\|failed" ./logs/<env>/<service>/*.log | tail -50

# 搜索特定接口路径
grep "POST /api/v1/order" ./logs/<env>/<service>/*.log | tail -20

# 搜索特定订单号/请求ID
grep "ORD123456" ./logs/<env>/<service>/*.log
```

### Step 3: 根据日志分析根因

读取 grep 命中的上下文，分析错误原因，向用户报告：
- 具体的异常类和消息
- 错误发生的代码位置（堆栈）
- 可能的原因和修复建议

## 命令参考

### 下载日志（最常用）

```bash
cli-anything-rancher -p <env> logs download <service> -d -t <lines> -o <output-dir>/
```

| 参数 | 说明 |
|------|------|
| `-p <env>` | 环境：dev / gqc / uat |
| `-d` | 按 deployment 名下载（所有 pod） |
| `-t <N>` | 最后 N 行（推荐 3000） |
| `-s <N>` | 最近 N 秒的日志 |
| `-o <dir>` | 输出目录 |
| `-n <ns>` | 命名空间（默认 dev-ec） |
| `--timestamps` | 日志带时间戳 |
| `--previous` | 上一个容器实例（排查 OOM/crash） |

### 检查服务状态

```bash
# 检查 pod 是否正常运行
cli-anything-rancher --json -p <env> pods list -d <service>

# 检查 deployment 状态
cli-anything-rancher --json -p <env> deploy list -f <service>
```

## 常见服务名与命名空间映射

| 命名空间 | 服务示例 |
|----------|---------|
| `dev-ec` / `gqc-ec` | ec-so-service, ec-payment-service, ec-customer-service, ec-rma-service |
| `dev-central` / `gqc-central` | central-so-service, central-customer-service, central-rma-service |
