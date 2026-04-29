# 订单业务知识

## 礼品购订单

判断条件：`so_order_ext.msg_info != ''`

相关字段（so_order_ext 表）：
- `msg_from` - 送礼人
- `msg_to` - 收礼人
- `msg_info` - 贺卡留言（此字段不为空即为礼品购订单）

## 订单类型 (order_type)

| 值 | 类型 | 说明 |
|----|------|------|
| 0 | NORMAL_ORDER | 普通订单 |
| 1 | FICTITIOUS_ORDER | 虚拟订单 |
| 2 | COUPON_ORDER | 代金券订单 |
| 3 | CONSOLID_ORDER | 集运订单 |
| 5 | FBY_ORDER | FBY订单 |
| 7 | EGIFT_CARD_ORDER | 虚拟礼品卡订单 |
| 9 | REISSUE_ORDER | 补发订单 |

## 订单状态 (order_status)

| 值 | 说明 |
|----|------|
| 0 | 未确认 |
| 1 | 已确认 |
| 2 | 取消 |
| 4 | 退货/退款 |
| 5 | 已发货 |

## 支付状态 (pay_status)

| 值 | 说明 |
|----|------|
| 0 | 未付款 |
| 1 | 付款验证中 |
| 2 | 已付款 |
| 3 | 已退款 |
| 4 | 部分退款 |

## 配送状态 (shipping_status)

| 值 | 说明 |
|----|------|
| 0 | 未发货 |
| 1 | 已发货 |
| 2 | 已预占 |
| 3 | 拣货中 |
| 5 | 发货中 |
| 8 | 已退货 |

## 异常状态 (abnormal)

| 值 | 说明 |
|----|------|
| 0 | 正常 |
| -1 | 拼团未成团 |
| -2 | 订单被阻止 |
| 4 | 风控通过 |
| 102 | 订单锁定 |
| 110 | 风控检测中 |
| 120 | 等待人工审核 |
| 130 | 风控拒绝 |

## 常用状态组合

| 组合 | 说明 |
|------|------|
| 1-0-0 | 待支付 |
| 1-0-2 | 已支付待发货 |
| 1-3-2 | 拣货中 |
| 5-1-2 | 已发货 |
| 4-8-3 | 已退款 |


## 礼品购季节性规律

高峰期：
- 8-9月（中秋节）
- 12月（圣诞节）

这些月份日均单量和金额明显高于其他月份。

## 问卷功能 (ec-customer-service)

### 代码位置

服务：`ec-customer-service`
- REST: `ec-customer-rest/.../CrmQuestionnaireRest.java`
- Service: `ec-customer-service/.../CrmQuestionnaireService.java`
- DAO: `ec-customer-service/.../CrmQuestionnaireDao.java`
- Mapper: `ec-customer-service/src/main/resources/mapper/CrmQuestionnaireDao.xml`
- 枚举: `ec-customer-api/.../enu/QuestionnaireEnum.java`

### 接口

| 接口 | 方法 | 说明 |
|---|---|---|
| `GET /questionnaire?q_key=xxx` | 获取问卷 | 需登录，header 传 token/y_platform/y_language |
| `POST /questionnaire/submit` | 提交答案 | 需登录，header 传 token |

### 已答题过滤逻辑

由代码中 `QuestionnaireEnum.QKey` 枚举控制：
- `order_detail_nps` → 逐题过滤（移除已答的 question_id）
- `order_rma_nps` → 整卷过滤（同 location + order_id 有记录就不展示）
- 其他 q_key（如 `customer_service_nps`）→ 不走 if-else 分支，不过滤，每次返回完整问卷

### sub_header 逻辑

写死在代码中，由 question_type 决定：
- 单选(0) → `L.get(LangCode.L_100133)`
- 多选(1) → `L.get(LangCode.L_100134)`
- 文本(2) → 空字符串

不支持按问卷维度自定义 sub_header，需改代码才能实现。

### 提交接口注意事项

- `extra` 字段必须传 JSON 对象（至少 `{}`），否则 NPE 导致静默失败
- `location` 可选，默认 0
- `extra.order_id` 可选，默认 0

### 平台支持

配置项 `questionnaire.support.platform`，默认仅 pc，h5 不支持。

### UAT 环境接口地址

- 域名：`uat-ecapi.yamibuy.tech`（注意不是 `uat-centralapi`）
- 前缀：`/ec-customer`
- 获取问卷：`GET https://uat-ecapi.yamibuy.tech/ec-customer/questionnaire?q_key=xxx`
- 提交答案：`POST https://uat-ecapi.yamibuy.tech/ec-customer/questionnaire/submit`
- Header 必传：`token`, `y_platform`, `y_language`

### sub_header 实际值（英文环境）

- 单选(question_type=0) → `*You can select only one option`（L_100133）
- 多选(question_type=1) → `*You can select multiple options`（L_100134）
- 文本(question_type=2) → 空字符串
