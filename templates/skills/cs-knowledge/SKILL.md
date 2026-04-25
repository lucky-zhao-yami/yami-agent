---
inclusion: auto
description: "Yamibuy 客服知识库。当用户咨询客服相关问题（账户、订单、支付、退款、退货、优惠券、礼品卡、物流、邀请好友、跟买、手机绑定、会员权益、税务、邮件通知等）时使用。触发词：客服, 用户问题, 订单, 退款, 退货, RMA, 优惠券, 礼品卡, 支付失败, 物流, 账户, 登录, 绑定手机, 邀请好友, 跟买, 会员, 税务"
---

# Yamibuy 客服知识库 (cs-knowledge)

## 使用方式

收到客服相关问题时，按以下流程处理：

### 1. 意图识别
根据用户问题关键词，定位到对应的知识文档：

| 主题 | 知识文档 | 触发词 |
|------|---------|--------|
| 全局规则 | `global-config.md` | （每次必读，定义回答格式和语言规则） |
| 账户登录 | `account-login.md` | 登录、密码、注册、账号、注销、谷歌登录 |
| 手机绑定 | `bind-phone.md` | 手机号、绑定、验证码、解绑 |
| 优惠券 | `coupon.md` | 优惠券、折扣码、coupon、满减 |
| 邮件通知 | `email-notification.md` | 邮件、收不到邮件、订阅、退订 |
| 跟买砍单 | `follow-buy.md` + `follow-buy-guide.md` | 跟买、砍单、分享 |
| 礼品卡 | `giftcard.md` | 礼品卡、gift card、礼卡、充值 |
| 邀请好友 | `invite-friend.md` + `invite-friend-guide.md` | 邀请、邀请码、邀请好友 |
| 语言设置 | `language.md` | 语言、切换语言 |
| 物流配送 | `logistics.md` | 物流、快递、配送、发货 |
| 会员权益 | `member-rights.md` | 会员、VIP、权益 |
| 订单问题 | `order.md` | 订单、下单、取消订单、购物车 |
| 支付退款 | `payment-refund.md` | 支付、退款、扣款、信用卡、PayPal |
| 个人资料 | `profile-edit.md` | 修改资料、地址、昵称 |
| 查询规则 | `query-rules.md` | （SQL 查询规范，内部使用） |
| RMA 售后 | `rma.md` | RMA、退货、退款审核、售后 |
| 税务 | `tax.md` | 税、tax、免税 |

### 2. 读取知识文档
```
readFile knowledge/<文档名>.md
```

**必须先读 `global-config.md`**，它定义了回答的语言规则和格式要求。

### 3. 按文档中的排查规则处理
每个知识文档都包含：
- **识别规则**：确认问题分类
- **常用数据库表**：需要查询的表和字段
- **排查场景**：具体问题的排查步骤和 SQL
- **回复模板**：标准回复格式

### 4. 操作手册
需要调用 API 或查日志时，参考：
- `ops-api-fetch.md` — HTTP 接口调用方法
- `ops-central-login.md` — Central 后台登录
- `ops-kibana-log.md` — Kibana 日志查询

### 5. 历史案例
- `purchase-support-records.csv` — 历史工单记录，可搜索类似案例
