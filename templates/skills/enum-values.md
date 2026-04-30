---
inclusion: manual
---

# 枚举值速查表

当需要解释数据库字段枚举值时，先查本文件。格式：`值=含义`，多个值用 ` / ` 分隔。

## yamibuy_payment.payment_charge

| 字段 | 枚举值 |
|------|--------|
| `pay_status` | 10=初始化 / 30=超时未支付 / 40=异常 / 50=失败 / 60=成功 |
| `pay_provider` | 0=免费支付(礼卡/积分全额抵扣) / 1=信用卡(已废弃) / 2=PayPal(已废弃) / 3=支付宝(alipay网关) / 4=微信支付(citcon网关) / 5=PayPal Braintree / 6=信用卡 Braintree / 7=Venmo Braintree / 8=支付宝 Citcon / 9=Apple Pay Braintree / 10=信用卡 Stripe / 11=Apple Pay Stripe / 12=Cash App(citconUpi网关) / 13=微信支付 UPI / 14=支付宝 UPI |
| `platform` | 1=PC / 2=H5 / 3=APP |
| `settlement` | 0=未结算 / 1=已结算 / 2=失败 / 3=取消 |
| `charge_type` | 0=普通支付 / 1=授信模式(先授权后capture) |
| `verify_status` | 10=未验证 / 30=已查询 / 40=异常 / 60=成功 |
| `channel` | 1=Yamibuy / 2=ec_so |

## yamibuy_payment.payment_refund

| 字段 | 枚举值 |
|------|--------|
| `status` | 10=初始化 / 40=异常 / 50=失败 / 60=成功 |
| `refund_reason` | 业务原因："rma退款" / "退款失败-{客服姓名}"（手动重试标记） / Stripe 错误："...code: charge_disputed..."（chargeback 导致无法退款） |

## yamibuy_payment.payment_charge_order

| 字段 | 枚举值 |
|------|--------|
| `status` | 10=初始化 / 20=已授权 / 40=失败 / 50=已取消授权(未实际扣款) / 51=取消中 / 60=已capture(已实际扣款) |
| `auth_type` | 0=普通 / 1=授信 |

> 注意：时间字段 auth_dtm / submit_dtm / cancel_dtm 单位为毫秒，查询时需 `FROM_UNIXTIME(字段/1000)` 转换

## yamibuy_payment.payment_charge_order_log

| 字段 | 枚举值 |
|------|--------|
| `type` | 1=capture成功 / 2=取消授权 / 3=取消中 / 4=失败 / 5=取消失败 |

## yamibuy_payment.payment_profile_card

| 字段 | 枚举值 |
|------|--------|
| `status` | 0=已删除 / 10=初始化 / 50=注册失败 / 60=注册成功 |
| `card_source` | 1=Braintree / 2=Stripe |
| `fingerprint` | Stripe 卡指纹，同一张物理卡的 fingerprint 相同，可用于跨账号关联同一张卡 |

## yamibuy_payment.payment_attempts_log

| 字段 | 枚举值 |
|------|--------|
| `status` | 1=请求发出 / 2=请求收到 / 3=等待通知 / 4=处理失败 / 5=处理成功 |
| `error_code` | 含义因 pay_provider 而异，见下方 |

### error_code 常见值（按 pay_provider 分类）

| pay_provider | 支付方式 | error_code 来源 | 常见值 |
|:---:|---|---|---|
| 10/11 | Stripe 信用卡/Apple Pay | Stripe declineCode | `incorrect_cvc`=CVC错误, `card_declined`=银行拒付, `expired_card`=卡过期, `insufficient_funds`=余额不足, `generic_decline`=通用拒绝, `resource_missing`=支付方式不存在或已被删除(如卡已删但支付请求仍引用旧卡), `payment_intent_authentication_failure`=3DS验证失败(用户未完成银行3D Secure验证，或验证超时/被拒), `transaction_not_allowed`=交易类型不允许(发卡行限制该卡的交易类型，如未开通境外线上消费) |
| 5/6/7/9 | PayPal/信用卡/Venmo/Apple Pay Braintree | Braintree processorResponseCode 或异常消息 | `2010`=CVV拒绝, `2046`=银行拒付, `GATEWAY_REJECTED`=网关拒绝 |
| 4 | 微信支付 Citcon | Citcon 回调 status | `fail` |
| 12/13/14 | CashApp/微信UPI/支付宝UPI | CitconUPI 回调 status | `fail` |
| 3/8 | 支付宝 | 网关回调 trade_status | `TRADE_CLOSED` |

> `incorrect_cvc` 时应查 payment_profile_card 核对 exp_year/exp_month 是否与实际卡片一致，不一致则建议删卡重新添加。

## yamibuy_so.so_order_purchase_record

| 字段 | 枚举值 |
|------|--------|
| `status` | 0=已预占 / 1=超时取消 / 2=主动取消 / 3=支付成功 |

## yamibuy_so.so_log

| 字段 | 枚举值 |
|------|--------|
| `type` | 0=订单提交 / 10=订单支付 / 11=支付验证 / 12=删除未支付订单 / 13=全部退款 / 14=部分退款 / 20=欺诈验证准备 / 21=欺诈验证中 / 22=欺诈验证等待审批 / 23=欺诈验证通过 / 24=欺诈验证拒绝 / 30=down单 / 31=拣货 / 32=打包 / 33=发货 / 34=订单拣货 / 35=订单商品发货 / 36=快递单号记录 / 37=订单拣货完成 / 40=更新收货地址 / 41=更新配送方式 / 42=更新发货仓库 / 50=锁定 / 51=解锁 |

## yamibuy_finance.fin_receivable

| 字段 | 枚举值 |
|------|--------|
| `status` | 0=待处理 / 1=已处理 |
| `reference_type` | 1=全单取消 / 2=手动退款 / 3=补偿/RMA退款 |

## yamibuy_finance.fin_receivable_detail

| 字段 | 枚举值 |
|------|--------|
| `amount_type` | 1=现金(美元) / 2=礼卡 / 3=积分(金额形式，非积分数量) |

## yamibuy_master.xysc_order_info

| 字段 | 枚举值 |
|------|--------|
| `order_status+shipping_status+pay_status` 组合 | 100(v1)=已取消 / 100(v2)=待支付 / 101=已提交 / 102,122,132,152=正在出库 / 512,522=已发货 / 483=已取消 / 484=已发货(退款中) / 200=已取消 / 172=待自提 |
| `order_type` | 0=普通订单(亚米自营) / 1=抽奖订单 / 2=虚拟代金券订单 / 3=集运订单 / 5=FBY订单 / 6=亚米预售订单 / 7=虚拟礼卡订单 |
| `source_flag` | 0=APP / 1=MOB(移动端) / 2=DKP(桌面端) / 3=Android / 4=微信小程序 / 9=COPY(补发单,不可RMA) / 11=TikTok渠道(不可RMA) / 12=TikTok渠道(不可RMA) |
| `money_paid` | 积分发放标记（0=未送积分，>0=已送积分），**不是现金支付金额** |
| `order_amount` | 实际需第三方支付金额 = goods_amount - bonus - bonus_pay - integral_money + tax + import_fee + shipping_fee + crv - gift_card_money（注意：表中无 service_fee 字段） |
| `goods_amount` | 商品总金额（未扣除任何优惠） |
| `gift_card_money` | 礼卡支付金额 |
| `integral_money` | 积分抵扣金额 |
| `bonus` | 优惠券抵扣金额 |
| `bonus_pay` | 支付优惠金额（如 Apple Pay 立减等） |
| `surplus` | 余额/预存款支付金额 |
| `warehouse_number` | 001=LA仓(洛杉矶) / 002=NJ仓(新泽西) |
| `tax_type` | -1=未知 / 0=亚米算税 / 1=Avalara算税 |
| `pay_type` | 1=Braintree / 2=Stripe |
| `hold_status` | 0=不hold / 1=hold |
| `lang` | 0=中文(zh_CN) / 1=英文(en_US,默认) / 2=韩文(ko) / 3=日文(ja) / 4=繁体中文(zht) |
| `order_type` 前端RMA条件 | 可发起：order_type NOT IN (1,2,7) 且 vendor_id<=0，实际可发起类型：0(亚米自营)/5(FBY)/6(亚米预售,vendor_id=0) |

## Yamibuy_Master.xysc_blacklist

| 字段 | 枚举值 |
|------|--------|
| `is_delete` | 0=仍在黑名单 / 1=已释放 |
| `type` | 1=user_id / 2=email / 3=mobile / 4=tel / 5=address / 6=bank_account / 7=paypal / 8=from_order_export(从订单导出) |

## yamibuy_crm.crm_customer_log

| 字段 | 枚举值 |
|------|--------|
| `type_id` | 10=个人信息修改 / 11=修改密码 / 20=VIP初始化 / 21=VIP升级 / 22=VIP扫描 / 23=升级金额变更 / 24=重置level_id / 25=会员降级 / 30=领取权益 / 40=验证邮箱 / 50=编辑邮箱 / 51=邮箱变更(content含old/new邮箱) / 60=用户登录 / 70=删除用户 / 71=删除用户失败 |

## yamibuy_crm.crm_invite

| 字段 | 枚举值 |
|------|--------|
| `status` | 0=未发放 / 1=已发放 / 3=已作废(edu旧奖励) |

## yamibuy_crm.crm_customer_vip_rights_info

| 字段 | 枚举值 |
|------|--------|
| `rights_id` | 1=积分抵现 / 3=生日惊喜 / 4=升级奖励 / 5=提前入场 / 6=亚米折扣日 / 9=每月福利免邮券 |
| `type` | 1=积分 / 2=优惠券 / 3=礼卡(当前未使用) |
| `user_type` | 0=邀请人 / 1=被邀请人(注册者) |
| `bind_type` | 0=注册时绑定 / 1=手动绑定 |
| `validate_type` | 0=无需验证 / 1=验证手机 / 2=验证邮箱 / 3=验证手机+邮箱 |
| `event_type` | 1=B注册 / 2=B注册并验证 / 3=B发货 / 4=B发货并验证 |

## yamibuy_crm.crm_invite_risk_control

| 字段 | 枚举值 |
|------|--------|
| `type` | 1=邀请人未验证手机且无下单历史 / 2=设备ID相同 / 3=收货地址姓名相同 / 4=收货地址手机号相同 |

## yamibuy_crm.crm_invite_log

| 字段 | 枚举值 |
|------|--------|
| `event_type` | 1=注册 / 2=验证 / 3=下单 / 4=发货 |

## yamibuy_master.xysc_users

| 字段 | 枚举值 |
|------|--------|
| `sex` | 0=未选择 / 1=Male(男) / 2=Female(女) / 3=Other(其他) / 4=DONT(不想说) |
| `act_source` | 0=普通注册(默认) / 1=邀请注册 / 2=活动注册 |

## yamibuy_master.xysc_users_delete

| 字段 | 枚举值 |
|------|--------|
| `type` | 1=用户主动删除 |
| `flag` | 1=正常(删除前状态正常) |

> `clear_dtm` 为用户删除/清理时间（Unix 时间戳）。email 字段已脱敏为 `**`，需通过 `hms_mail_send_status.name` 交叉验证。

## yamibuy_master.xysc_users_third

> 来源：`CommonEnum.PlateForm`（ec-customer-service）

| 字段 | 枚举值 |
|------|--------|
| `platform_id` | 1=微信(WECHAT) / 2=微博(WEIBO) / 3=Facebook / 4=Google / 5=Twitter / 6=微信小程序(WX_MINI_PROGRAM) / 7=验证码登录(CODE) |
| `is_bind` | 0=未绑定 / 1=已绑定 |

> ⚠️ 注意：`ChannelEnum`（神策埋点用）的编号与 `PlateForm` 不同，ChannelEnum 中 6=Apple、且 FACEBOOK/WEIBO 的 desc 存在交叉 bug。`xysc_users_third` 表用的是 `PlateForm` 枚举。

## yamibuy_mkt.mkt_coupon_code

| 字段 | 枚举值 |
|------|--------|
| `status` | 10=可用 / 20=已使用 / 30=已失效 |

## yamibuy_mkt.mkt_seckill_item

> 来源：`MKTConstant.java`（ec-mkt-service）

| 字段 | 枚举值 |
|------|--------|
| `seckill_status` | 0=未秒杀 / 1=预热 / 2=进行中 / 3=无库存(有未支付订单) / 4=售罄(结束) / 5=活动结束 |

## yamibuy_mkt.mkt_promotion_schedule

> 来源：`MKTConstant.java`（central-mkt-service + ec-mkt-service）

| 字段 | 枚举值 |
|------|--------|
| `status`（优惠券活动 type=12） | 10=草稿 / 20=分析中 / 30=分析完成 / 40=等待生效 / 50=生效中/已发放 / 60=领取完毕 / 70=已结束 |
| `status`（折扣活动 type=10/11/13） | 10=草稿 / 20=等待开始 / 25=预热 / 30=进行中 / 40=已结束 / 50=已生效 |
| `status`（赠品活动 type=20） | 10=草稿 / 20=待生效 / 30=生效中 / 40=已终止(手动终止) / 50=已结束 |
| `type` | 10=折扣 / 11=秒杀/满减 / 12=优惠券/一口价 / 13=闪购 / 20=赠品 / 21=组合促销 / 30=积分活动 |

> ⚠️ 三种活动类型的 status 含义完全不同，同一个 status 值在不同 type 下含义不同（如 status=40 在优惠券中是"等待生效"，在折扣中是"已结束"，在赠品中是"已终止"）。排查时必须先确认 type 再解读 status。

## yamibuy_mkt.mkt_coupon_item

| 字段 | 枚举值 |
|------|--------|
| `type` | 1=全场 / 2=分类 / 3=品牌 / 4=单品 |

## yamibuy_mkt.ps_content (JSON字段)

| 字段 | 枚举值 |
|------|--------|
| `couponContent.coupon_type` | 1=折扣券 / 2=满减券 / 3=现金券 / 4=买赠券 |
| `couponContent.percent` | 折扣比例（coupon_type=1 时使用，如 20 表示 20% off） |
| `couponContent.max_discount` | 最大抵扣金额（折扣券时限制最大折扣额，0或null=无上限） |
| `couponContent.buy_amount` | 满金额门槛（null=无门槛） |
| `couponContent.reduce_amount` | 满减金额（满减券的实际减免金额，如 reduce_amount=3 表示减$3） |
| `couponContent.cash_amount` | 现金券金额（coupon_type=3 时使用） |
| `couponContent.platform` | 0=全平台 / 1=APP / 2=MOB / 3=DKP（平台使用限制） |
| `couponContent.coupon_form` | 1=平台券 / 2=推广券 / 3=免邮券 |
| `couponContent.coupon_shipping_type` | 1=全免 / 2=限额免（免邮券类型） |
| `couponContent.group_type` | 1=亚米物流(含自营/代销/FBY) / 3=商家直邮 / 4=集运 / 6=预售 |
| `couponContent.seller_id` | 0=亚米自营 / >0=指定第三方卖家ID（限定优惠券适用的卖家范围） |
| `codeItemsScope.code_type` | 1=全场（通过 sellIds + eliminateItems 判断，不查 mkt_coupon_item） / 2=分类 / 3=品牌 / 4=单品（唯一查 mkt_coupon_item 表的模式） |
| `codeItemsScope.eliminateRule.itemList` | 排除商品编号列表（code_type=1 时使用，列表中的商品不可用券） |
| `codeItemsScope.total_sku_num` | 适用SKU总数 |

## yamibuy_cart.so_cart

| 字段 | 枚举值 |
|------|--------|
| `origin_price` | 加购时商品价格快照（非实时价格，源码 CartService.getOriginPrice()），用于降价提醒功能 |
| `is_gift` | 0=普通商品 / 1=赠品 |
| `item_type` | 0=普通商品（其他值待确认） |
| `check_status` | -1=默认值（其他值待确认） |

## yamibuy_so.so_order_follow

| 字段 | 枚举值 |
|------|--------|
| `fo_status` | 0=不能发起 / 1=可发起 / 2=进行中 / 3=已结束 / 4=已取消 / 5=可发起因故取消 |

## yamibuy_activity.fo_activity

| 字段 | 枚举值 |
|------|--------|
| `status` | 1=进行中 / 2=已结束 / 3=已取消 |

## yamibuy_activity.fo_join

| 字段 | 枚举值 |
|------|--------|
| `type` | 1=砍单 / 2=跟单 |
| `status` | 0=待发 / 1=已发 / 2=已退 / 3=未发(不发放) / 4=发放中 |
| `back_reason` | 1=发起者取消 / 2=跟单者取消 / 3=系统取消 |

## yamibuy_master.xysc_egift_log

| 字段 | 枚举值 |
|------|--------|
| `reason_flag` | 1=使用扣款 / 2=退回返还 |

## yamibuy_master.xysc_egift_card

| 字段 | 枚举值 |
|------|--------|
| `is_active` | 0=未激活 / 1=已激活 |
| `source_flag` | 0=Central后台创建 / 1=电子礼卡(线上购买) / 2=活动促销生成 / 4=退款生成 |

## yamibuy_so.so_order_ext

| 字段 | 枚举值 |
|------|--------|
| `receive_type` | 1=直充账户 / 2=发送邮箱 |

## yamibuy_so.so_tracking_info

| 字段 | 枚举值 |
|------|--------|
| `delivery_status` | 0=未送达 / 1=已送达 / 2=配送中 |
| `type` | 1=WMS推送 / 2=AfterShip推送 |

## yamibuy_im.im_item_area_price_setting

| 字段 | 枚举值 |
|------|--------|
| `giftcard_status` | 0=非礼卡专享 / 1=礼卡专享商品 / null=未设置(等同非礼卡专享) |

## yamibuy_rma.rma_order

| 字段 | 枚举值 |
|------|--------|
| `status` | 0=待审核 / 1=已批准 / 3=待处理(Pending) / 4=待处理2(Pending2) / 5=已收货 / 10=已完成 / 11=手动完成 / 12=已取消 / 20=已拒绝 / 101=新建 / 102=退款中 / 103=发货中 |
| `rma_type` | 1=仅退款(REFUNDONLY) / 2=重新发货(DELIVERAGAIN) / 3=退货退款(RETURNFORREFUND) / 4=退货换货(RETURNFORDELIVER) |
| `request_type` | 1=普通售后(NORMAL) / 3=整单拒收(ORDERREJECT) / 4=缺货发货(DELIVERAGAIN) |
| `source` | 1=客服发起(CUSTOMER) / 2=用户发起(USER) / 3=系统缺发(SYSTEM) / 4=仓库发起(Stock) |
| `seller_type` | 0=亚米自营(YAMIBUY) / 1=第三方(OTHERS) / 3=集运(CONSOLIDATION) / 5=FBY |

## yamibuy_rma.rma_rule

| 字段 | 枚举值 |
|------|--------|
| `obj_ym_refund` / `sbj_ym_refund` / `obj_tp_refund` / `sbj_tp_refund` | -2=联系客服 / -1=不限制天数 / 0=不支持该售后类型 / >0=售后天数 |

## yamibuy_im.im_item_extend

| 字段 | 枚举值 |
|------|--------|
| `clone_type` | 0=原品(ORI) / 1=清仓(CLEAR) / 2=预售(PRESALE) / 3=合成品Combo(COMBINE,前端不可RMA) / 4=赠品(GIFT,不可RMA) / 5=合成品Bundle(BUNDLE,前端不可RMA) |

## yamibuy_im.im_item

| 字段 | 枚举值 |
|------|--------|
| `business_type` | 1=普通商品(旧) / 5=普通商品 / 6=预售商品 |
| `status` | A=活跃(上架) / R=回收站(已下架，前端不可见不可购买) |

## yamibuy_im.im_item_tag

| 字段 | 枚举值 |
|------|--------|
| `tag_id`（常用值） | 788=年货商品tag（预售商品条件之一） |

## yamibuy_master.xysc_refund_apply

| 字段 | 枚举值 |
|------|--------|
| `audit_status` | 1=待审核 / 2=已审核 / 3=已拒绝 / 4=已取消 |

## yamibuy_crm.crm_risk_user

| 字段 | 枚举值 |
|------|--------|
| `reason` | 1=临时邮箱注册（@end.tw, @uuf.me, @nqmo.com, @yzm.de） |
| `is_deleted` | 0=生效中 / 1=已删除 |

## yamibuy_master.xysc_vendor_ext

| 字段 | 枚举值 |
|------|--------|
| `is_cancel` | 0=该seller的订单用户不可取消 / 1=该seller的订单用户可以取消 |
| `is_fo` | 0=不能发起跟单 / 1=可以发起 |

## yamibuy_master.xysc_vendor_info

| 字段 | 枚举值 |
|------|--------|
| `ca_flag` | 0=加拿大配送未开启 / 1=加拿大配送已开启 |
| `ah_flag` | 0=Alaska/Hawaii配送未开启 / 1=已开启（含义待最终确认） |
| `is_active` | 0=未激活 / 1=正常营业 |
| `region` | CN=中国 / US=美国（商家所在地区） |

## ec-customer 常见 messageId（日志中的错误码）

| messageId | 含义 |
|-----------|------|
| 10031 | 密码错误(Invalid password) |
| 10058 | 修改密码次数达到限制(Password change has reached the limit, please try again later) |
| 90008 | Token无效/过期(Token is Invalid) |

## 维护说明

- 新发现枚举值直接在本文件对应表下追加
- 本文件是枚举值的唯一来源，不再使用知识图谱存储枚举值
