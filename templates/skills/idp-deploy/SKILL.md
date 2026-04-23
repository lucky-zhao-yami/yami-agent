# IDP Deploy

通过 IDP（Internal Developer Platform）部署微服务到各环境。当需要部署服务、查看部署状态、查看部署历史时使用。

触发词：部署, deploy, 发布, 上线, 部署环境, dev环境, qc环境, 测试环境, 部署状态

## 可用环境

| 环境 | 说明 |
|------|------|
| dev | 开发环境 |
| qc | 测试环境 |
| gqc | 全局测试环境 |
| uat | 预发布环境 |
| prd | 生产环境（⚠️ 需确认） |

## 命令

### 1. 部署服务

```bash
opencli yamibuy-idp deploy --env <环境> --service <服务名> [--branch <分支>]
```

- `branch` 默认 `master`
- 返回 `related_id` 用于查询状态
- 部署通常需要 5-8 分钟

示例：
```bash
# 部署 master 到 dev
opencli yamibuy-idp deploy --env dev --service ec-so-service

# 部署 feature 分支到 qc
opencli yamibuy-idp deploy --env qc --service ec-so-service --branch feature/OP-34000
```

### 2. 查询部署状态

```bash
opencli yamibuy-idp status --related_id <id>
```

状态值：`Pending` → `Running` → `Completed` / `Failed`

### 3. 列出可部署服务

```bash
opencli yamibuy-idp services --env <环境> [--filter <关键词>]
```

### 4. 部署历史

```bash
opencli yamibuy-idp history [--limit <条数>]
```

## SOP 集成：Phase 3.5 自动部署

在 Phase 3.5 中，替代人工部署的流程：

```bash
# 1. 部署
RESULT=$(opencli yamibuy-idp deploy --env qc --service ec-so-service --branch feature/OP-34000 -f json)
RELATED_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['related_id'])")

# 2. 轮询状态（每30秒查一次，最多等10分钟）
for i in $(seq 1 20); do
  STATUS=$(opencli yamibuy-idp status --related_id $RELATED_ID -f json | \
    python3 -c "import sys,json; print(json.load(sys.stdin)[0]['status'])")
  if [ "$STATUS" = "Completed" ]; then echo "部署成功"; break; fi
  if [ "$STATUS" = "Failed" ]; then echo "部署失败"; break; fi
  sleep 30
done

# 3. 部署成功后，调 QA Agent 跑集成测试
```

## 注意事项

- 每次命令执行约 8-10 秒（需要通过浏览器获取认证 token）
- Token 依赖 Windows Chrome 的 Google 登录状态，如果 Chrome 未登录 IDP 会失败
- prd 环境部署前必须经过用户确认，Agent 不得自动部署到生产
