# 通用工具类使用指南

## 概述

Yami-Public 工具包提供了一系列通用工具类，涵盖了日常开发中常用的功能，包括数学计算、JSON处理、HTTP请求处理、字符串操作等。这些工具类经过生产环境验证，具有良好的性能和稳定性。

## 核心工具类

### 1. CommonUtil - 通用工具类
- 响应结果判断
- 字符串空值检查
- 通用业务逻辑封装

### 2. JacksonUtil - JSON处理工具
- JSON序列化和反序列化
- JSON格式化和美化
- JSON动态操作（增删改查）

### 3. CalcUtil - 数学计算工具
- 高精度四则运算
- 链式计算操作
- 多种数据类型支持

### 4. ServletUtil - HTTP请求工具
- 请求参数获取
- Header操作
- AB测试Header管理

## 详细使用指南

### CommonUtil 使用方法

#### 1. 响应结果判断

```java
@Service
public class UserService {
    
    public UserInfo getUserInfo(String userId) {
        BaseResponse<UserInfo> response = userClient.getUserInfo(userId);
        
        // 判断亚米内部接口响应是否成功
        if (CommonUtil.responseOK(response)) {
            return response.getBody();
        } else {
            log.error("获取用户信息失败: messageId={}", response.getMessageId());
            return null;
        }
    }
}
```

#### 2. 字符串空值检查

```java
public class ValidationService {
    
    public boolean validateUserInput(String name, String email, String phone) {
        // 检查任意一个参数是否为null或"null"字符串
        if (CommonUtil.isAnyNullString(name, email, phone)) {
            log.warn("用户输入包含空值");
            return false;
        }
        return true;
    }
    
    public void processOrder(String orderId, String userId, String productId) {
        // 验证必需参数
        if (CommonUtil.isAnyNullString(orderId, userId, productId)) {
            throw new IllegalArgumentException("订单处理参数不能为空");
        }
        
        // 继续处理订单逻辑
        orderProcessor.process(orderId, userId, productId);
    }
}
```

### JacksonUtil 使用方法

#### 1. JSON序列化和反序列化

```java
@Service
public class DataService {
    
    // 对象转JSON
    public String saveUserData(UserInfo userInfo) {
        String json = JacksonUtil.toJSONString(userInfo);
        redisTemplate.opsForValue().set("user:" + userInfo.getId(), json);
        return json;
    }
    
    // JSON转对象
    public UserInfo getUserData(String userId) {
        String json = redisTemplate.opsForValue().get("user:" + userId);
        return JacksonUtil.parseObject(json, UserInfo.class);
    }
    
    // JSON转List
    public List<OrderInfo> getOrderList(String json) {
        return JacksonUtil.parseList(json, OrderInfo.class);
    }
    
    // JSON转Map
    public Map<String, Object> parseConfig(String configJson) {
        return JacksonUtil.parseMap(configJson);
    }
}
```

#### 2. JSON动态操作

```java
@Service
public class ConfigService {
    
    // 向JSON中添加属性
    public String addConfigItem(String originalConfig, String key, Object value) {
        return JacksonUtil.add(originalConfig, key, value);
    }
    
    // 更新JSON中的属性
    public String updateConfig(String config, String key, Object newValue) {
        return JacksonUtil.update(config, key, newValue);
    }
    
    // 删除JSON中的属性
    public String removeConfigItem(String config, String key) {
        return JacksonUtil.remove(config, key);
    }
    
    // 格式化JSON（美化输出）
    public String formatConfig(String config) {
        return JacksonUtil.prettyJson(config);
    }
    
    // 验证字符串是否为有效JSON
    public boolean isValidConfig(String config) {
        return JacksonUtil.isJson(config);
    }
}
```

#### 3. 复杂类型处理

```java
@Service
public class ComplexDataService {
    
    // 使用TypeReference处理复杂泛型
    public Map<String, List<ProductInfo>> parseProductMap(String json) {
        TypeReference<Map<String, List<ProductInfo>>> typeRef = 
            new TypeReference<Map<String, List<ProductInfo>>>() {};
        return JacksonUtil.parseObject(json, typeRef);
    }
    
    // 处理嵌套JSON结构
    public void processNestedData(String complexJson) {
        JsonNode rootNode = JacksonUtil.readTree(complexJson);
        if (rootNode != null) {
            JsonNode dataNode = rootNode.get("data");
            JsonNode itemsNode = dataNode.get("items");
            // 进一步处理嵌套数据
        }
    }
}
```

### CalcUtil 使用方法

#### 1. 基本四则运算

```java
@Service
public class PriceCalculationService {
    
    // 计算订单总价
    public BigDecimal calculateOrderTotal(List<OrderItem> items) {
        CalcUtil calculator = CalcUtil.init(0);
        
        for (OrderItem item : items) {
            BigDecimal itemTotal = CalcUtil.init(item.getPrice())
                .mul(item.getQuantity())
                .decimalValue(2);
            calculator.add(itemTotal);
        }
        
        return calculator.decimalValue(2);
    }
    
    // 计算折扣价格
    public BigDecimal calculateDiscountPrice(BigDecimal originalPrice, BigDecimal discountRate) {
        return CalcUtil.init(originalPrice)
            .mul(1)
            .sub(discountRate)
            .decimalValue(2);
    }
    
    // 计算税费
    public BigDecimal calculateTax(BigDecimal amount, BigDecimal taxRate) {
        return CalcUtil.init(amount)
            .mul(taxRate)
            .decimalValue(2);
    }
}
```

#### 2. 链式计算

```java
@Service
public class FinancialCalculationService {
    
    // 复杂的价格计算
    public BigDecimal calculateFinalPrice(BigDecimal basePrice, BigDecimal discount, 
                                        BigDecimal taxRate, BigDecimal shippingFee) {
        return CalcUtil.init(basePrice)
            .sub(discount)           // 减去折扣
            .mul(CalcUtil.init(1).add(taxRate).decimalValue()) // 加税
            .add(shippingFee)        // 加运费
            .decimalValue(2);        // 保留2位小数
    }
    
    // 批量数据计算
    public BigDecimal calculateBatchTotal(List<BigDecimal> amounts) {
        return CalcUtil.adds(amounts.toArray(new BigDecimal[0]))
            .decimalValue(2);
    }
    
    // 平均值计算
    public BigDecimal calculateAverage(List<BigDecimal> values) {
        BigDecimal sum = CalcUtil.adds(values.toArray(new BigDecimal[0]))
            .decimalValue();
        return CalcUtil.init(sum)
            .div(values.size())
            .decimalValue(2);
    }
}
```

#### 3. 不同数据类型返回

```java
@Service
public class StatisticsService {
    
    public void generateReport(List<OrderInfo> orders) {
        BigDecimal totalAmount = calculateTotalAmount(orders);
        
        // 返回不同类型的结果
        double totalDouble = CalcUtil.init(totalAmount).doubleValue(2);
        int totalInt = CalcUtil.init(totalAmount).intValue(0);
        String totalString = CalcUtil.init(totalAmount).stringValue(true, 2); // 带千分符
        
        log.info("订单总额: {} (double: {}, int: {}, formatted: {})", 
                totalAmount, totalDouble, totalInt, totalString);
    }
}
```

### ServletUtil 使用方法

#### 1. 请求信息获取

```java
@RestController
public class ApiController {
    
    @PostMapping("/api/user/profile")
    public ResponseEntity<UserProfile> getUserProfile() {
        // 获取请求头信息
        String token = ServletUtil.getToken();
        String version = ServletUtil.getVersion();
        String language = ServletUtil.getLanguage();
        PlatformEnum platform = ServletUtil.getPlatform();
        
        // 获取所有内置headers
        EnumMap<YmHeaderEnum, String> headers = ServletUtil.getHeaders();
        
        // 获取自定义header
        String customHeader = ServletUtil.getHeader("X-Custom-Header");
        
        // 处理业务逻辑
        UserProfile profile = userService.getUserProfile(token, language, platform);
        
        return ResponseEntity.ok(profile);
    }
}
```

#### 2. 请求参数处理

```java
@RestController
public class FormController {
    
    @PostMapping("/api/form/submit")
    public ResponseEntity<String> submitForm() {
        HttpServletRequest request = ServletUtil.getRequest();
        
        // 获取form data格式的数据
        String formData = ServletUtil.getFormatFromDataValue(request);
        log.info("表单数据: {}", formData);
        
        // 获取GET参数字符串
        String paramString = ServletUtil.getParamString(request);
        log.info("参数字符串: {}", paramString);
        
        // 处理表单提交
        formService.processForm(formData);
        
        return ResponseEntity.ok("提交成功");
    }
}
```

#### 3. AB测试Header管理

```java
@Service
public class ABTestHeaderService {
    
    public void handleABTest(String experimentName) {
        // 获取请求中的AB测试结果
        ABEnum abResult = ServletUtil.getRequestAbHeader(experimentName, ABEnum.CONTROL);
        
        // 根据AB测试结果处理业务逻辑
        if (abResult == ABEnum.EXPERIMENTAL) {
            handleExperimentalLogic();
        } else {
            handleControlLogic();
        }
        
        // 设置响应Header，返回AB测试结果
        ServletUtil.setResponseAbHeader(experimentName, abResult);
    }
    
    private void handleExperimentalLogic() {
        // 实验组逻辑
        log.info("执行实验组逻辑");
    }
    
    private void handleControlLogic() {
        // 控制组逻辑
        log.info("执行控制组逻辑");
    }
}
```

## 实际应用场景

### 1. 订单处理综合示例

```java
@Service
public class OrderProcessingService {
    
    public OrderResult processOrder(OrderRequest request) {
        // 1. 参数验证
        if (CommonUtil.isAnyNullString(request.getUserId(), request.getProductId())) {
            throw new IllegalArgumentException("订单参数不能为空");
        }
        
        // 2. 获取请求信息
        String token = ServletUtil.getToken();
        PlatformEnum platform = ServletUtil.getPlatform();
        
        // 3. 调用外部服务
        BaseResponse<ProductInfo> productResponse = productClient.getProduct(request.getProductId());
        if (!CommonUtil.responseOK(productResponse)) {
            throw new BusinessException("商品信息获取失败");
        }
        
        // 4. 价格计算
        ProductInfo product = productResponse.getBody();
        BigDecimal finalPrice = CalcUtil.init(product.getPrice())
            .mul(request.getQuantity())
            .sub(request.getDiscount())
            .mul(CalcUtil.init(1).add(0.08).decimalValue()) // 8%税率
            .decimalValue(2);
        
        // 5. 构建订单结果
        OrderResult result = new OrderResult();
        result.setOrderId(generateOrderId());
        result.setFinalPrice(finalPrice);
        result.setPlatform(platform.name());
        
        // 6. 序列化结果用于缓存
        String resultJson = JacksonUtil.toJSONString(result);
        cacheService.cacheOrderResult(result.getOrderId(), resultJson);
        
        return result;
    }
}
```

### 2. 配置管理示例

```java
@Service
public class ConfigManagementService {
    
    public void updateSystemConfig(String configKey, Object configValue) {
        // 获取当前配置
        String currentConfig = configRepository.getConfig("system");
        
        // 验证JSON格式
        if (!JacksonUtil.isJson(currentConfig)) {
            log.error("当前配置不是有效的JSON格式");
            return;
        }
        
        // 更新配置
        String updatedConfig = JacksonUtil.update(currentConfig, configKey, configValue);
        
        // 格式化配置（便于阅读）
        String formattedConfig = JacksonUtil.prettyJson(updatedConfig);
        
        // 保存配置
        configRepository.saveConfig("system", formattedConfig);
        
        log.info("系统配置已更新: key={}, value={}", configKey, configValue);
    }
    
    public Map<String, Object> getFormattedConfig() {
        String configJson = configRepository.getConfig("system");
        return JacksonUtil.parseMap(configJson);
    }
}
```

## 最佳实践

### 1. 异常处理

```java
public class SafeUtilService {
    
    public String safeJsonOperation(Object data) {
        try {
            return JacksonUtil.toJSONString(data);
        } catch (Exception e) {
            log.error("JSON序列化失败", e);
            return "{}"; // 返回默认值
        }
    }
    
    public BigDecimal safeCalculation(BigDecimal a, BigDecimal b) {
        try {
            return CalcUtil.init(a).div(b).decimalValue(2);
        } catch (ArithmeticException e) {
            log.error("除零错误", e);
            return BigDecimal.ZERO;
        }
    }
}
```

### 2. 性能优化

```java
@Service
public class OptimizedService {
    
    // 缓存ObjectMapper实例
    private static final ObjectMapper MAPPER = JacksonUtil.getObjectMapper();
    
    // 批量处理避免重复计算
    public List<BigDecimal> batchCalculate(List<BigDecimal> prices, BigDecimal rate) {
        return prices.stream()
            .map(price -> CalcUtil.init(price).mul(rate).decimalValue(2))
            .collect(Collectors.toList());
    }
    
    // 条件判断减少不必要的操作
    public String conditionalJsonProcess(String json, boolean needFormat) {
        if (!JacksonUtil.isJson(json)) {
            return json;
        }
        
        return needFormat ? JacksonUtil.prettyJson(json) : json;
    }
}
```

### 3. 日志记录

```java
@Service
public class LoggingService {
    
    public void processWithLogging(String data) {
        log.debug("开始处理数据: {}", data);
        
        // 参数验证
        if (CommonUtil.isAnyNullString(data)) {
            log.warn("输入数据为空");
            return;
        }
        
        // JSON处理
        if (JacksonUtil.isJson(data)) {
            log.debug("数据为有效JSON格式");
            Map<String, Object> dataMap = JacksonUtil.parseMap(data);
            log.debug("解析后的数据: {}", dataMap);
        }
        
        log.debug("数据处理完成");
    }
}
```

## 注意事项

### 1. 数据类型转换
- CalcUtil 支持多种数字类型，但建议统一使用 BigDecimal
- JSON 序列化时注意日期格式和时区问题
- 字符串比较时注意 null 和 "null" 的区别

### 2. 性能考虑
- 大量 JSON 操作时考虑复用 ObjectMapper 实例
- 复杂计算时注意精度设置，避免过度计算
- HTTP 请求处理时避免重复获取相同的 Header

### 3. 异常处理
- JSON 操作可能抛出异常，需要适当的异常处理
- 数学计算时注意除零等异常情况
- HTTP 请求可能为空，需要空值检查

### 4. 线程安全
- 工具类方法大多是线程安全的
- ServletUtil 依赖于 RequestContextHolder，注意线程上下文
- 静态方法调用时注意并发访问

## 常见问题

### Q: JacksonUtil 和 FastJSON 有什么区别？
A: JacksonUtil 基于 Jackson 库，提供了更好的类型安全和性能，而且配置更灵活。FastJSON 在某些场景下性能更好，但安全性相对较低。

### Q: CalcUtil 为什么不直接使用 BigDecimal？
A: CalcUtil 提供了链式调用和多种返回类型，使用更方便，同时内置了精度控制和异常处理。

### Q: ServletUtil 在非 Web 环境下能使用吗？
A: ServletUtil 依赖于 Spring 的 RequestContextHolder，只能在 Web 环境下使用。非 Web 环境下会返回 null。

### Q: 如何自定义 JSON 序列化配置？
A: 可以通过 JacksonUtil.getObjectMapper() 获取 ObjectMapper 实例，然后进行自定义配置。