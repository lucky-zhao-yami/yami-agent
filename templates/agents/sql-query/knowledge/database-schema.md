# 数据库表结构

## RMA 售后表 (yamibuy_rma)

### rma_order - RMA 主表

关键字段：
- `rma_id` - RMA 单号
- `order_id` - 关联原订单
- `reason_code` - 售后原因（关联 rma_reason_code.reason_id）
- `request_type` - 售后来源：1-普通RMA售后 3-整单拒收 4-缺货发货
- `rma_type` - 处理方式：1-仅退款 2-仅补发 3-退货退款 4-退货补发
- `status` - 状态：0待审核 1审核通过 2已邮寄 3已挂起 4已挂起(用户原因) 5已收寄 10已完成 11手动完成 12已关闭 20审核拒绝
- `in_dtm` - 创建时间（Unix时间戳）

常用 reason_code：
- 2 - 包裹丢失（无数据）
- 26 - 未送达/Lost in transit（实际的包裹丢失用这个）
- 52/76 - 商品漏发
- 54 - 赠品漏发

### rma_order_detail - RMA 明细表

关键字段：
- `rma_id` - 关联主表
- `deal_price` - 商品单价
- `request_count` - 申请数量
- `refund_total` - 退款总额

### 查询示例

统计包裹丢失 RMA 单（已完成）：
```sql
SELECT 
  COUNT(DISTINCT o.rma_id) AS rma_count,
  COUNT(DISTINCT o.order_id) AS order_count,
  ROUND(SUM(d.deal_price * d.request_count), 2) AS total_amount
FROM yamibuy_rma.rma_order o
JOIN yamibuy_rma.rma_order_detail d ON o.rma_id = d.rma_id
WHERE o.in_dtm >= UNIX_TIMESTAMP(CONVERT_TZ('2026-01-01 00:00:00', 'America/Los_Angeles', 'UTC'))
  AND o.in_dtm < UNIX_TIMESTAMP(CONVERT_TZ('2026-02-01 00:00:00', 'America/Los_Angeles', 'UTC'))
  AND o.reason_code = 26
  AND o.status = 10;
```

注意：
- `request_type` 是售后来源，不是处理方式
- `rma_type` 才是处理方式（退款/补发）
- 统计所有包裹丢失时不要加 request_type 条件

## 订单主表 (yamibuy_master)

按年分表存储，主表存当年数据：
- `xysc_order_info` - 主表（当前年度数据）
- `xysc_order_info_2024` - 2024年归档
- `xysc_order_info_2023` - 2023年归档
- ...

数据范围（order_id）：
- 2024表：210287653 ~ 214822178（2024全年）
- 主表：214822179 起（2025年至今）

时间段对应主键范围：
- 2024年4-12月：211361224 ~ 214822178
- 2025年4-12月：216392010 ~ 221902262

关键字段：
- `order_id` - 主键
- `add_time` - 下单时间（Unix时间戳）
- `order_amount` - 实付金额
- `integral_money` - 积分抵扣金额
- `gift_card_money` - 礼卡抵扣金额
- `pay_status` - 支付状态

订单总金额 = `integral_money + gift_card_money + order_amount`

## 订单扩展表 (yamibuy_so)

`so_order_ext` - 订单扩展信息，通过 order_id 关联

关键字段：
- `order_id` - 关联主表
- `msg_from` - 送礼人
- `msg_to` - 收礼人  
- `msg_info` - 贺卡留言
- `in_dtm` - 创建时间

## 查询优化

时间范围查询应先获取主键边界，再用主键做条件：

```sql
-- 1. 先查主键边界
SELECT MIN(order_id), MAX(order_id) 
FROM xysc_order_info_2024 
WHERE add_time >= UNIX_TIMESTAMP('2024-04-01') 
  AND add_time < UNIX_TIMESTAMP('2025-01-01');

-- 2. 用主键范围查询
SELECT ... FROM so_order_ext e
JOIN xysc_order_info_2024 o ON e.order_id = o.order_id
WHERE e.order_id BETWEEN {start_id} AND {end_id}
  AND ...
```

## 问卷配置表 (yamibuy_crm)

### crm_questionnaire_page - 问卷页面配置

关键字段：
- `page_id` - 主键
- `q_key` - 业务标识（用于接口查询）
- `q_number` - 问卷唯一编号（如 Q_CS_001）
- `q_desc` - 问卷描述
- `question_ids` - 问题ID数组（逗号分隔字符串）
- `lang` - 语言：0-zh_CN 1-en_US 2-ko 3-ja 4-zht
- `status` - 状态：0待启用 1启用 2作废

### crm_questionnaire_question - 题目配置

关键字段：
- `question_id` - 主键
- `question` - 题目描述
- `question_type` - 类型：0单选 1多选 2文本输入
- `answer_ids` - 答案ID数组（逗号分隔字符串）
- `is_deleted` - 逻辑删除：0未删除 1已删除

### crm_questionnaire_answer - 答案选项配置

关键字段：
- `answer_id` - 主键
- `answer_type` - 类型：0选择 1输入 2选择后输入 3选择互斥 4选择互斥后输入
- `answer` - 答案内容
- `is_deleted` - 逻辑删除

### crm_questionnaire_response - 用户答题记录

关键字段：
- `rec_id` - 主键
- `user_id` - 用户ID
- `location` - 答题位置：0未记录 1支付成功页 2订单详情页...
- `q_number` - 关联问卷编号
- `question_id` - 题目ID
- `answer_id` - 用户选择的答案ID
- `answer_input` - 用户输入的文本
- `order_id` - 订单ID

### 现有问卷 q_key

| q_key | 说明 | 已答题过滤 |
|---|---|---|
| `order_detail_nps` | 订单详情NPS问卷 | 逐题过滤（答过的题不再展示） |
| `order_rma_nps` | RMA售后NPS问卷 | 整卷过滤（同location+order_id答过就不展示） |
| `customer_service_nps` | 客服满意度问卷（UAT） | 不过滤（每次都返回完整问卷） |
