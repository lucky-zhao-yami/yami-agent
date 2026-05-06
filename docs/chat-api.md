# Chat API 使用文档

## 接口说明

`POST /chat` — 外部工具调用 Agent 能力，支持多轮对话。

## 请求

```
POST http://<host>:<port>/chat
Content-Type: application/json
Authorization: Bearer <api_key>  (如配置了 API_KEY 环境变量)
```

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| message | string | 是 | 用户消息 |
| sessionId | string | 否 | 会话 ID。不传则创建新会话，传则复用已有会话 |

## 响应

```json
{
  "ok": true,
  "sessionId": "1714984599_abc123",
  "reply": "Agent 的回复内容"
}
```

| 字段 | 说明 |
|------|------|
| ok | 是否成功 |
| sessionId | 会话 ID，后续请求带上此值可继续对话 |
| reply | Agent 的完整回复文本 |
| error | 失败时的错误信息 |

## 使用流程

```
1. 首次调用（不带 sessionId）
   → 创建新会话 + 新 Agent 进程
   → 返回 sessionId

2. 后续调用（带上 sessionId）
   → 复用已有会话，Agent 保持上下文记忆
   → 可持续多轮对话

3. 会话过期
   → 空闲 30 分钟后自动回收
   → 下次带过期的 sessionId 会自动创建新会话（上下文丢失）
```

## 示例

### curl

```bash
# 首次调用
curl -X POST http://localhost:8900/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "查一下用户 12345 的订单状态"}'

# 返回: {"ok":true,"sessionId":"1714984599_abc123","reply":"..."}

# 多轮对话
curl -X POST http://localhost:8900/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "这个订单的退款记录呢", "sessionId": "1714984599_abc123"}'
```

### Python

```python
import requests

BASE_URL = "http://localhost:8900"
session_id = None

def chat(message):
    global session_id
    payload = {"message": message}
    if session_id:
        payload["sessionId"] = session_id
    
    resp = requests.post(f"{BASE_URL}/chat", json=payload)
    data = resp.json()
    
    if data["ok"]:
        session_id = data["sessionId"]
        return data["reply"]
    else:
        raise Exception(data["error"])

# 使用
print(chat("查一下用户 12345 的订单状态"))
print(chat("这个订单的退款记录呢"))  # 自动带上 sessionId
```

### JavaScript/Node.js

```javascript
const BASE_URL = 'http://localhost:8900';
let sessionId = null;

async function chat(message) {
  const body = { message };
  if (sessionId) body.sessionId = sessionId;

  const resp = await fetch(`${BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await resp.json();

  if (data.ok) {
    sessionId = data.sessionId;
    return data.reply;
  }
  throw new Error(data.error);
}
```

## 错误码

| HTTP 状态码 | 说明 |
|------------|------|
| 200 | 成功 |
| 400 | 缺少 message 字段 |
| 401 | API Key 验证失败（配置了 API_KEY 时） |
| 500 | Agent 处理失败（进程崩溃/超时等） |

## 注意事项

- 接口是**同步阻塞**的，Agent 处理完才返回。复杂问题可能需要 30-60 秒
- 超时时间由 `PROMPT_TIMEOUT` 环境变量控制（默认 300 秒）
- 每个 sessionId 对应一个独立的 Agent 进程，注意并发数不要超过 `MAX_PROCS`
- 会话空闲 `IDLE_TIMEOUT` 秒后自动回收（默认 1800 秒）
