---
inclusion: manual
---

# Iterable 邮件系统 API Skill

## 用途
通过 Iterable API 查询用户邮件订阅状态。取消订阅需找 @Logon 手动操作，禁止机器人直接调用删除接口。

## API 配置

### Base URL
```
https://api.iterable.com
```

### 认证方式
- API Key 通过 URL 参数传递：`api_key=f562f2e17f8a42bcb5a8460f5fa87722`

---

## 可用接口

### 查询用户订阅状态（仅查询，不可删除）

**接口地址：** `GET /api/users/{用户邮箱}`

**PowerShell 调用示例：**
```powershell
$resp = Invoke-RestMethod -Uri "https://api.iterable.com/api/users/{邮箱}?api_key=f562f2e17f8a42bcb5a8460f5fa87722" -Method GET
$resp | ConvertTo-Json -Depth 10
```

## Iterable 订阅邮件说明
- Iterable 主要管理营销类邮件订阅（促销活动、新品推荐等）
- 邮件类型（MessageType）是动态配置的，具体类型需从 Iterable 后台或 Redis 缓存查看
- 用户注册时会自动同步到 Iterable，邮箱变更时也会同步更新
- 删除账户时系统会自动调用 Iterable 删除接口，但可能存在删除失败的情况

## 使用规则
- 仅用于查询用户订阅状态，⚠️ 禁止机器人调用 DELETE 接口
- 需要取消订阅时，告知客服找 @Logon 手动操作
