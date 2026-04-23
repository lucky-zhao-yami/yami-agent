# ABTest 使用规范

## 重要原则

**永远使用 ABTestBuilder 工具进行 AB Test，不要直接调用 ABTestClient**

## 使用方式

### 1. 基于 Apollo 配置的 AB Test（推荐）

```java
// 从 Apollo 读取 AB 配置
String configJson = environment.getProperty("ab.cart.intent.recommend");

// 使用 ABTestBuilder 创建并获取结果
ABTestMember testMember = ABTestBuilder.create(configJson).build();
ABEnum abResult = testMember.getABResult();

// 根据结果执行不同逻辑
switch(abResult) {
    case V0:
        // 对照组逻辑
        break;
    case V1:
        // 实验组1逻辑
        break;
    case V2:
        // 实验组2逻辑
        break;
    default:
        // 默认逻辑
        break;
}
```

### 2. Apollo 配置格式

```json
{
  "name": "购物车意图推荐",
  "abCode": "cart_intent_recommend",
  "switch": true,
  "headerName": "ab_cart_intent_recommend",
  "default": "V0",
  "win": null,
  "winStrategy": null,
  "holdout": [],
  "startTime": 1737619200000,
  "language": ["en_US", "zh_CN", "zh_TW", "ja", "ko"],
  "disable": [],
  "allowAnonymous": false,
  "effectUserType": null,
  "platform": {
    "android": {
      "switch": true,
      "startVersion": 0
    },
    "ios": {
      "switch": true,
      "startVersion": 0
    },
    "pc": true,
    "h5": true
  },
  "whitelist": {
    "V1": ["user_id_1", "user_id_2"],
    "V2": ["user_id_3", "user_id_4"]
  }
}
```

### 3. 配置说明

| 字段 | 说明 | 示例 |
|------|------|------|
| name | AB测试名称 | "购物车意图推荐" |
| abCode | AB测试代码（需在AB平台创建） | "cart_intent_recommend" |
| switch | 是否开启AB测试 | true/false |
| headerName | 响应头名称 | "ab_cart_intent_recommend" |
| default | 默认分组（异常情况） | "V0" |
| win | 胜出分组（实验结束后） | "V1" |
| winStrategy | 胜出策略 | "ALL_USER" / "NEW_USER" |
| holdout | Holdout组 | ["holdout_group_1"] |
| startTime | 开始时间（毫秒时间戳） | 1737619200000 |
| language | 生效语言 | ["en_US", "zh_CN"] |
| disable | 禁用的分组 | ["V3"] |
| allowAnonymous | 是否允许匿名用户 | true/false |
| effectUserType | 生效用户类型 | 1=仅新用户 |
| platform | 平台配置 | 见上方示例 |
| whitelist | 白名单（测试用户） | {"V1": ["user_id"]} |

### 4. ABEnum 枚举值

```java
public enum ABEnum {
    Vx,  // 表示和当前实验无关
    Vh,  // Holdout组
    V0,  // 对照组
    V1,  // 实验组1
    V2,  // 实验组2
    V3,  // 实验组3
    V4,  // 实验组4
    // ... 更多分组
}
```

### 5. 代码实现示例（OP-32798）

```java
@Service
public class CartIntentRecommendService {
    
    @Autowired
    private Environment environment;
    
    public IntentRecommendResponse getIntentRecommend(
            String token, String platform, String language, 
            IntentRecommendRequest request) {
        
        // 1. 获取AB配置
        String configJson = environment.getProperty("ab.cart.intent.recommend");
        if (StrUtil.isBlank(configJson)) {
            log.warn("AB配置为空，返回空结果");
            return IntentRecommendResponse.empty();
        }
        
        // 2. 创建AB测试并获取结果
        ABTestMember testMember = ABTestBuilder.create(configJson).build();
        ABEnum abResult = testMember.getABResult();
        
        log.info("AB测试结果: {}, itemNumber: {}", abResult, request.getClickedItemNumber());
        
        // 3. 根据AB结果执行不同逻辑
        switch(abResult) {
            case V0:
                // 对照组：不返回推荐
                return IntentRecommendResponse.empty();
                
            case V1:
                // 实验组1：基础搜索召回
                return getRecommendV1(request, language, platform);
                
            case V2:
                // 实验组2：筛选型搜索召回
                return getRecommendV2(request, language, platform);
                
            default:
                // 默认：不返回推荐
                log.warn("未知的AB分组: {}", abResult);
                return IntentRecommendResponse.empty();
        }
    }
}
```

## 注意事项

1. **配置优先**：AB配置应该放在 Apollo 配置中心，便于动态调整
2. **日志记录**：必须记录 AB 分组结果，便于数据分析
3. **异常处理**：配置为空或解析失败时，应返回默认行为（通常是对照组）
4. **白名单测试**：上线前使用白名单进行测试验证
5. **胜出策略**：实验结束后，通过 `win` 和 `winStrategy` 配置胜出分组

## 相关文件

- ABTestBuilder: `/mnt/d/code/yami/public/ec/purchase/src/main/java/com/yamibuy/purchase/util/abtest/ABTestBuilder.java`
- ABEnum: `/mnt/d/code/yami/public/ec/purchase/src/main/java/com/yamibuy/purchase/domain/enums/ABEnum.java`
- 使用示例: `/mnt/d/code/yami/ec-customer-service/ec-customer-service/src/main/java/com/yamibuy/ec/customer/service/CommonService.java`
