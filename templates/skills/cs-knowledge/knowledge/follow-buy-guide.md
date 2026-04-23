# 跟买功能文档

## 1. 跟买流程

用户A下单支付完成 → 检查商家是否支持跟买 → 检查订单商品金额（扣除礼卡）是否满足要求 → 检查订单可发起跟买时间是否到期 → 检查订单是否取消 → 可发起跟买，展示跟买发起入口 → 用户A发起跟买

流程图：`.kiro/docs/images/follow-buy-10.png`

## 2. 规则配置

Central → CMS管理 → 配置管理，搜索"跟单"或"跟买"

### 关键配置项（key: fo_num_config）
```json
{
    "acquire_points_time": 49,    // 分享订单49h可获取积分
    "allow_create_time": 72,      // 下单完成72h内可发起跟买
    "coupon_end_time": 30,        // 发起跟买创建的优惠券30天结束
    "coupon_expire_time": 12,     // 砍单用户收到的优惠券12h过期
    "firstCutRule": "3,5",        // 第一个砍单用户积分加成随机3~5
    "firstFoRule": "10,20",       // 第一个跟单用户积分加成随机10~20
    "fo_end_time": 48,            // 跟买活动48小时结束
    "goods_limit": 0,
    "percent": 10,                // 优惠券折扣10%
    "price_line": 35              // 订单商品金额>=35可发起跟买
}
```

### 积分规则
- 砍单加积分：随机(5-15)，只有60%落在5以上
- 跟单加积分：price/random(3,5)*10+random(1,5)，price=跟买者订单中符合优惠券覆盖范围的商品结算总额
- 新用户/老用户、自营/第三方分别有独立的积分规则配置（newCutSelfRule/oldCutSelfRule/newFoSelfRule 等）

### 其他配置项
| ID | Key | 描述 |
|----|-----|------|
| 312 | not_allowed_item_number | 跟买排除特定SKU |
| 235 | activity_end_push | 跟买结束后汇总推送 |
| 234 | activity_end_email | 跟买结束后汇总邮件 |
| 233 | activity_24_push | 跟单-第24/49小时给用户推送消息 |
| 232 | activity_24_email | 跟单-第24/49小时给用户发送邮件内容 |
| 182 | fo_goods_amount | 跟买商品金额门槛 |
| 181 | fo_num_config | 跟单活动数值配置 |
| 180 | fo_official_config | 跟单页面文案配置 |
| 461 | fo_official_config_ja | 跟单页面文案配置(日语) |
| 460 | fo_official_config_ko | 跟单页面文案配置(韩语) |

### 托底开关
- Central 配置管理：fo_switch（0关 1开）
- 关闭后：所有前端入口屏蔽（首页推送不弹出、订单完成页、订单列表、订单详情、我的跟买），所有已发起的跟单活动变为默认导流页面

## 3. 数据库表结构

### fo_activity（跟单活动表） - yamibuy_activity
| 字段 | 类型 | 说明 |
|------|------|------|
| fo_id | int | 活动id |
| order_id | int | 订单id |
| ps_id | int | 优惠券计划id |
| ps_code | varchar(20) | 折扣码 |
| status | int | 状态：1进行中 2已结束 3已取消 |
| user_id | int | 发起跟单用户id |
| max_points | int | 最大积分数 |
| is_free | int | 0未达免单门槛 1已达免单门槛 |
| seller_id | int | 商家类型：0自营 1第三方 |
| seller_ids | varchar(255) | 多商家id |
| start_time | int | 活动开始时间 |
| push_time | int | 推送时间点 |
| end_time | int | 活动结束时间 |

### fo_join（参与跟单信息表） - yamibuy_activity
| 字段 | 类型 | 说明 |
|------|------|------|
| fo_id | int | 跟单活动id |
| user_id | int | 参与用户id |
| user_type | int | 用户类型：0新用户 1老用户 |
| type | int | 类型：1砍单 2跟单 |
| order_id | int | 跟单订单id |
| points | int | 积分 |
| status | int | 0待发 1已发 2已退 3原单已免单无需发放积分 |
| back_reason | int | 退回原因：0原单未发货 1跟单未发货 2发起者取消 3跟单者取消 4系统取消 |

### fo_item（跟单商品表） - yamibuy_activity
| 字段 | 类型 | 说明 |
|------|------|------|
| fo_id | int | 跟单活动id |
| item_number | varchar(20) | 商品编号 |

### so_order_follow（订单跟买扩展表） - yamibuy_so
| 字段 | 类型 | 说明 |
|------|------|------|
| order_id | int | 订单id |
| fo_status | int | 0不能发起跟买 1可以发起跟买（支付后可发起，取已支付不能发起） 2跟买进行中 3跟买结束 4跟买取消 5可发起（因故取消） |
| fo_points | int | 订单可获取最大积分 |

### 其他相关表
- `yamibuy_master.xysc_vendor_ext` — is_fo 字段：0不能发起跟单 1可以发起
- `yamibuy_mkt.mkt_coupon_schedule_ext` — source_bu：0 mkt 1 fo
- `yamibuy_master.xysc_order_coupon` — source_bu：0 mkt 1 fo
- `yamibuy_crm.crm_point` — refer_type：0其他 1订单 2晒单 3跟单活动；reason_third 1006001/1006002 为跟买积分

## 4. 跟买发起条件

### 可发起条件
1. 金额过滤：商品金额 - 优惠券抵扣金额 > 配置金额（price_line=35）
2. 订单过滤：礼卡、京东图书、拼团、集运订单无法发起
3. 商品过滤：配置的特定分类不能发起、赠品不能发起、下架商品不能发起
4. 库存过滤：可用库存为0的商品不能被选中
5. 可发起跟买的商品数量最多20个，超过置灰
6. 注意：如果商品金额40，积分抵扣10，可以发起跟买，最大可获取积分公式要去除积分抵扣部分

### 时间限制
- 下单完成72小时内可发起跟买
- 跟买活动持续48小时
- 分享订单49小时可获取积分
- 砍单限制：从当前时间往前推24小时内最多砍2次（滚动窗口，非自然日）
