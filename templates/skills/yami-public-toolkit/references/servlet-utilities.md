# Servlet 工具类使用指南

## 概述

ServletUtil 是 Yami-Public 工具包中用于处理 HTTP 请求和响应的工具类。它提供了便捷的方法来获取请求信息、处理请求参数、管理 HTTP Header，特别是针对亚米网业务场景定制的 Header 处理功能。

## 核心功能

### 1. 请求信息获取
- 获取当前 HTTP 请求对象
- 提取常用的请求头信息
- 获取请求参数和表单数据

### 2. 业务 Header 管理
- 获取亚米网标准 Header（token、version、language 等）
- 处理平台信息和设备信息
- 管理 AB 测试相关 Header

### 3. 请求参数处理
- 格式化请求参数
- 处理表单数据
- 获取查询字符串

## 详细使用指南

### 基本使用方法

#### 1. 获取请求对象

```java
@RestController
public class BaseController {
    
    @GetMapping("/api/example")
    public ResponseEntity<String> exampleApi() {
        // 获取当前请求对象
        HttpServletRequest request = ServletUtil.getRequest();
        
        if (request != null) {
            String method = request.getMethod();
            String uri = request.getRequestURI();
            String queryString = request.getQueryString();
            
            log.info("请求信息: method={}, uri={}, query={}", method, uri, queryString);
        }
        
        return ResponseEntity.ok("Success");
    }
}
```

#### 2. 获取标准业务 Header

```java
@RestController
public class UserController {
    
    @GetMapping("/api/user/profile")
    public ResponseEntity<UserProfile> getUserProfile() {
        // 获取用户 token
        String token = ServletUtil.getToken();
        if (StringUtils.isEmpty(token)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        
        // 获取客户端版本
        String version = ServletUtil.getVersion();
        
        // 获取语言设置
        String language = ServletUtil.getLanguage();
        
        // 获取平台信息
        PlatformEnum platform = ServletUtil.getPlatform();
        
        log.info("请求头信息: token={}, version={}, language={}, platform={}", 
                token, version, language, platform);
        
        // 根据语言和平台返回对应的用户信息
        UserProfile profile = userService.getUserProfile(token, language, platform);
        
        return ResponseEntity.ok(profile);
    }
}
```

#### 3. 获取所有内置 Header

```java
@Service
public class RequestAnalysisService {
    
    /**
     * 分析请求头信息
     */
    public RequestAnalysis analyzeRequest() {
        // 获取所有内置 Header
        EnumMap<YmHeaderEnum, String> headers = ServletUtil.getHeaders();
        
        RequestAnalysis analysis = new RequestAnalysis();
        
        // 遍历所有 Header
        headers.forEach((headerEnum, value) -> {
            switch (headerEnum) {
                case TOKEN:
                    analysis.setToken(value);
                    break;
                case VERSION:
                    analysis.setVersion(value);
                    break;
                case LANGUAGE:
                    analysis.setLanguage(value);
                    break;
                case PLATFORM:
                    analysis.setPlatform(PlatformEnum.valueOf(value));
                    break;
                case DEVICE_ID:
                    analysis.setDeviceId(value);
                    break;
                case USER_AGENT:
                    analysis.setUserAgent(value);
                    break;
                // 其他 Header 处理...
            }
        });
        
        return analysis;
    }
}
```

### 高级使用场景

#### 1. AB 测试 Header 管理

```java
@Service
public class ABTestService {
    
    /**
     * 处理 AB 测试逻辑
     */
    public ProductListResponse getProductList(ProductListRequest request) {
        // 获取 AB 测试结果，如果没有则使用默认值
        ABEnum abResult = ServletUtil.getRequestAbHeader("product_list_layout", ABEnum.CONTROL);
        
        ProductListResponse response;
        
        // 根据 AB 测试结果执行不同逻辑
        if (abResult == ABEnum.EXPERIMENTAL) {
            // 实验组：使用新的商品列表布局
            response = productService.getProductListWithNewLayout(request);
            log.info("使用实验组商品列表布局");
        } else {
            // 控制组：使用原有布局
            response = productService.getProductListWithOriginalLayout(request);
            log.info("使用控制组商品列表布局");
        }
        
        // 设置响应 Header，告知前端使用的 AB 测试结果
        ServletUtil.setResponseAbHeader("product_list_layout", abResult);
        
        return response;
    }
    
    /**
     * 多个 AB 测试同时进行
     */
    public RecommendationResponse getRecommendations(String userId) {
        // 获取多个 AB 测试结果
        ABEnum algorithmTest = ServletUtil.getRequestAbHeader("recommendation_algorithm", ABEnum.CONTROL);
        ABEnum uiTest = ServletUtil.getRequestAbHeader("recommendation_ui", ABEnum.CONTROL);
        
        // 根据算法 AB 测试选择推荐算法
        List<ProductInfo> products;
        if (algorithmTest == ABEnum.EXPERIMENTAL) {
            products = recommendationService.getRecommendationsV2(userId);
        } else {
            products = recommendationService.getRecommendationsV1(userId);
        }
        
        // 根据 UI AB 测试选择展示方式
        RecommendationResponse response;
        if (uiTest == ABEnum.EXPERIMENTAL) {
            response = RecommendationResponse.createWithNewUI(products);
        } else {
            response = RecommendationResponse.createWithOriginalUI(products);
        }
        
        // 设置响应 Header
        ServletUtil.setResponseAbHeader("recommendation_algorithm", algorithmTest);
        ServletUtil.setResponseAbHeader("recommendation_ui", uiTest);
        
        return response;
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
        
        // 获取格式化的表单数据
        String formData = ServletUtil.getFormatFromDataValue(request);
        log.info("表单数据: {}", formData);
        
        // 获取查询参数字符串
        String paramString = ServletUtil.getParamString(request);
        log.info("查询参数: {}", paramString);
        
        // 处理表单提交
        FormSubmitResult result = formService.processForm(formData, paramString);
        
        return ResponseEntity.ok("提交成功");
    }
    
    @GetMapping("/api/search")
    public ResponseEntity<SearchResult> search() {
        HttpServletRequest request = ServletUtil.getRequest();
        
        // 获取所有查询参数
        String queryParams = ServletUtil.getParamString(request);
        
        // 解析搜索参数
        SearchParams searchParams = parseSearchParams(queryParams);
        
        // 执行搜索
        SearchResult result = searchService.search(searchParams);
        
        return ResponseEntity.ok(result);
    }
    
    private SearchParams parseSearchParams(String queryParams) {
        // 解析查询参数的具体实现
        SearchParams params = new SearchParams();
        
        if (StringUtils.isNotEmpty(queryParams)) {
            String[] pairs = queryParams.split("&");
            for (String pair : pairs) {
                String[] keyValue = pair.split("=");
                if (keyValue.length == 2) {
                    String key = URLDecoder.decode(keyValue[0], StandardCharsets.UTF_8);
                    String value = URLDecoder.decode(keyValue[1], StandardCharsets.UTF_8);
                    
                    switch (key) {
                        case "keyword":
                            params.setKeyword(value);
                            break;
                        case "category":
                            params.setCategoryId(value);
                            break;
                        case "page":
                            params.setPage(Integer.parseInt(value));
                            break;
                        case "size":
                            params.setSize(Integer.parseInt(value));
                            break;
                    }
                }
            }
        }
        
        return params;
    }
}
```

#### 3. 自定义 Header 处理

```java
@Service
public class CustomHeaderService {
    
    /**
     * 获取自定义 Header
     */
    public void processCustomHeaders() {
        // 获取自定义 Header
        String customValue1 = ServletUtil.getHeader("X-Custom-Header-1");
        String customValue2 = ServletUtil.getHeader("X-Custom-Header-2");
        
        log.info("自定义 Header: X-Custom-Header-1={}, X-Custom-Header-2={}", 
                customValue1, customValue2);
        
        // 根据自定义 Header 执行特定逻辑
        if ("special".equals(customValue1)) {
            handleSpecialRequest();
        }
        
        if (StringUtils.isNotEmpty(customValue2)) {
            processWithCustomValue(customValue2);
        }
    }
    
    /**
     * 批量获取多个自定义 Header
     */
    public Map<String, String> getCustomHeaders(List<String> headerNames) {
        Map<String, String> customHeaders = new HashMap<>();
        
        for (String headerName : headerNames) {
            String value = ServletUtil.getHeader(headerName);
            if (StringUtils.isNotEmpty(value)) {
                customHeaders.put(headerName, value);
            }
        }
        
        return customHeaders;
    }
    
    private void handleSpecialRequest() {
        log.info("处理特殊请求");
    }
    
    private void processWithCustomValue(String customValue) {
        log.info("使用自定义值处理: {}", customValue);
    }
}
```

### 实际业务场景应用

#### 1. 用户认证和授权

```java
@Component
public class AuthenticationInterceptor implements HandlerInterceptor {
    
    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, 
                           Object handler) throws Exception {
        // 获取用户 token
        String token = ServletUtil.getToken();
        
        if (StringUtils.isEmpty(token)) {
            response.setStatus(HttpStatus.UNAUTHORIZED.value());
            return false;
        }
        
        // 验证 token 有效性
        if (!tokenService.isValidToken(token)) {
            response.setStatus(HttpStatus.UNAUTHORIZED.value());
            return false;
        }
        
        // 获取用户信息并设置到上下文
        UserInfo userInfo = tokenService.getUserInfoByToken(token);
        UserContext.setCurrentUser(userInfo);
        
        // 记录请求信息
        String platform = ServletUtil.getPlatform().name();
        String version = ServletUtil.getVersion();
        String language = ServletUtil.getLanguage();
        
        log.info("用户请求: userId={}, platform={}, version={}, language={}", 
                userInfo.getUserId(), platform, version, language);
        
        return true;
    }
    
    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, 
                              Object handler, Exception ex) throws Exception {
        // 清理用户上下文
        UserContext.clear();
    }
}
```

#### 2. 请求日志记录

```java
@Component
public class RequestLoggingInterceptor implements HandlerInterceptor {
    
    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, 
                           Object handler) throws Exception {
        // 获取请求基本信息
        String method = request.getMethod();
        String uri = request.getRequestURI();
        String queryString = ServletUtil.getParamString(request);
        
        // 获取业务 Header
        String token = ServletUtil.getToken();
        String version = ServletUtil.getVersion();
        PlatformEnum platform = ServletUtil.getPlatform();
        String language = ServletUtil.getLanguage();
        
        // 获取客户端信息
        String userAgent = request.getHeader("User-Agent");
        String clientIp = getClientIp(request);
        
        // 构建请求日志
        RequestLog requestLog = RequestLog.builder()
            .method(method)
            .uri(uri)
            .queryString(queryString)
            .token(token)
            .version(version)
            .platform(platform.name())
            .language(language)
            .userAgent(userAgent)
            .clientIp(clientIp)
            .timestamp(System.currentTimeMillis())
            .build();
        
        // 记录请求日志
        log.info("请求开始: {}", JacksonUtil.toJSONString(requestLog));
        
        // 将请求日志存储到请求属性中，供后续使用
        request.setAttribute("requestLog", requestLog);
        
        return true;
    }
    
    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, 
                              Object handler, Exception ex) throws Exception {
        RequestLog requestLog = (RequestLog) request.getAttribute("requestLog");
        if (requestLog != null) {
            long duration = System.currentTimeMillis() - requestLog.getTimestamp();
            int status = response.getStatus();
            
            log.info("请求完成: uri={}, status={}, duration={}ms", 
                    requestLog.getUri(), status, duration);
        }
    }
    
    private String getClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (StringUtils.isNotEmpty(xForwardedFor)) {
            return xForwardedFor.split(",")[0].trim();
        }
        
        String xRealIp = request.getHeader("X-Real-IP");
        if (StringUtils.isNotEmpty(xRealIp)) {
            return xRealIp;
        }
        
        return request.getRemoteAddr();
    }
}
```

#### 3. 多语言支持

```java
@Service
public class InternationalizationService {
    
    @Autowired
    private MessageSource messageSource;
    
    /**
     * 根据请求语言获取本地化消息
     */
    public String getLocalizedMessage(String messageKey, Object... args) {
        // 获取请求中的语言设置
        String language = ServletUtil.getLanguage();
        
        // 解析语言和地区
        Locale locale = parseLocale(language);
        
        // 获取本地化消息
        return messageSource.getMessage(messageKey, args, locale);
    }
    
    /**
     * 获取本地化的错误消息
     */
    public String getLocalizedErrorMessage(String errorCode) {
        String language = ServletUtil.getLanguage();
        Locale locale = parseLocale(language);
        
        String messageKey = "error." + errorCode;
        return messageSource.getMessage(messageKey, null, "Unknown error", locale);
    }
    
    /**
     * 根据语言返回不同格式的数据
     */
    public ProductInfo getLocalizedProduct(String productId) {
        String language = ServletUtil.getLanguage();
        ProductInfo product = productService.getProduct(productId);
        
        // 根据语言设置返回对应的商品信息
        if ("zh".equals(language)) {
            product.setName(product.getNameZh());
            product.setDescription(product.getDescriptionZh());
        } else {
            product.setName(product.getNameEn());
            product.setDescription(product.getDescriptionEn());
        }
        
        return product;
    }
    
    private Locale parseLocale(String language) {
        if (StringUtils.isEmpty(language)) {
            return Locale.ENGLISH; // 默认英语
        }
        
        if (language.contains("-")) {
            String[] parts = language.split("-");
            return new Locale(parts[0], parts[1]);
        } else {
            return new Locale(language);
        }
    }
}
```

#### 4. 平台差异化处理

```java
@Service
public class PlatformSpecificService {
    
    /**
     * 根据平台返回不同的配置
     */
    public AppConfig getAppConfig() {
        PlatformEnum platform = ServletUtil.getPlatform();
        String version = ServletUtil.getVersion();
        
        AppConfig config = new AppConfig();
        
        switch (platform) {
            case IOS:
                config = getIOSConfig(version);
                break;
            case ANDROID:
                config = getAndroidConfig(version);
                break;
            case WEB:
                config = getWebConfig(version);
                break;
            case MINI_PROGRAM:
                config = getMiniProgramConfig(version);
                break;
            default:
                config = getDefaultConfig();
        }
        
        return config;
    }
    
    /**
     * 根据平台执行不同的业务逻辑
     */
    public PaymentResponse processPayment(PaymentRequest request) {
        PlatformEnum platform = ServletUtil.getPlatform();
        
        PaymentResponse response;
        
        switch (platform) {
            case IOS:
                // iOS 平台使用 Apple Pay
                response = applePayService.processPayment(request);
                break;
            case ANDROID:
                // Android 平台使用 Google Pay
                response = googlePayService.processPayment(request);
                break;
            case WEB:
                // Web 平台使用信用卡支付
                response = creditCardService.processPayment(request);
                break;
            default:
                // 默认使用通用支付方式
                response = defaultPaymentService.processPayment(request);
        }
        
        return response;
    }
    
    private AppConfig getIOSConfig(String version) {
        AppConfig config = new AppConfig();
        config.setEnableApplePay(true);
        config.setEnableFaceId(true);
        // iOS 特定配置
        return config;
    }
    
    private AppConfig getAndroidConfig(String version) {
        AppConfig config = new AppConfig();
        config.setEnableGooglePay(true);
        config.setEnableFingerprint(true);
        // Android 特定配置
        return config;
    }
    
    private AppConfig getWebConfig(String version) {
        AppConfig config = new AppConfig();
        config.setEnableCreditCard(true);
        config.setEnablePayPal(true);
        // Web 特定配置
        return config;
    }
    
    private AppConfig getMiniProgramConfig(String version) {
        AppConfig config = new AppConfig();
        config.setEnableWechatPay(true);
        // 小程序特定配置
        return config;
    }
    
    private AppConfig getDefaultConfig() {
        return new AppConfig();
    }
}
```

### 工具类扩展

#### 1. 请求上下文管理

```java
@Component
public class RequestContextManager {
    
    private static final ThreadLocal<RequestContext> contextHolder = new ThreadLocal<>();
    
    /**
     * 初始化请求上下文
     */
    public static void initContext() {
        RequestContext context = new RequestContext();
        
        // 从 ServletUtil 获取请求信息
        context.setToken(ServletUtil.getToken());
        context.setVersion(ServletUtil.getVersion());
        context.setLanguage(ServletUtil.getLanguage());
        context.setPlatform(ServletUtil.getPlatform());
        
        // 获取所有 Header
        EnumMap<YmHeaderEnum, String> headers = ServletUtil.getHeaders();
        context.setHeaders(headers);
        
        // 获取请求参数
        HttpServletRequest request = ServletUtil.getRequest();
        if (request != null) {
            context.setMethod(request.getMethod());
            context.setUri(request.getRequestURI());
            context.setQueryString(ServletUtil.getParamString(request));
        }
        
        contextHolder.set(context);
    }
    
    /**
     * 获取当前请求上下文
     */
    public static RequestContext getCurrentContext() {
        return contextHolder.get();
    }
    
    /**
     * 清理请求上下文
     */
    public static void clearContext() {
        contextHolder.remove();
    }
}

@Data
public class RequestContext {
    private String token;
    private String version;
    private String language;
    private PlatformEnum platform;
    private EnumMap<YmHeaderEnum, String> headers;
    private String method;
    private String uri;
    private String queryString;
    private Long timestamp;
    
    public RequestContext() {
        this.timestamp = System.currentTimeMillis();
    }
}
```

#### 2. Header 验证工具

```java
@Component
public class HeaderValidator {
    
    /**
     * 验证必需的 Header 是否存在
     */
    public boolean validateRequiredHeaders(String... requiredHeaders) {
        for (String headerName : requiredHeaders) {
            String value = ServletUtil.getHeader(headerName);
            if (StringUtils.isEmpty(value)) {
                log.warn("缺少必需的 Header: {}", headerName);
                return false;
            }
        }
        return true;
    }
    
    /**
     * 验证业务 Header 的有效性
     */
    public ValidationResult validateBusinessHeaders() {
        ValidationResult result = new ValidationResult();
        
        // 验证 token
        String token = ServletUtil.getToken();
        if (StringUtils.isEmpty(token)) {
            result.addError("token", "Token 不能为空");
        } else if (!isValidTokenFormat(token)) {
            result.addError("token", "Token 格式无效");
        }
        
        // 验证版本
        String version = ServletUtil.getVersion();
        if (StringUtils.isEmpty(version)) {
            result.addError("version", "版本号不能为空");
        } else if (!isValidVersionFormat(version)) {
            result.addError("version", "版本号格式无效");
        }
        
        // 验证平台
        try {
            PlatformEnum platform = ServletUtil.getPlatform();
            if (platform == null) {
                result.addError("platform", "平台信息无效");
            }
        } catch (Exception e) {
            result.addError("platform", "平台信息解析失败");
        }
        
        return result;
    }
    
    private boolean isValidTokenFormat(String token) {
        // Token 格式验证逻辑
        return token.length() > 10 && !token.contains(" ");
    }
    
    private boolean isValidVersionFormat(String version) {
        // 版本号格式验证逻辑（如：1.0.0）
        return version.matches("\\d+\\.\\d+\\.\\d+");
    }
}
```

## 性能优化建议

### 1. 请求信息缓存

```java
@Component
public class CachedServletUtil {
    
    private static final ThreadLocal<Map<String, Object>> requestCache = new ThreadLocal<>();
    
    /**
     * 带缓存的 Header 获取
     */
    public static String getCachedHeader(String headerName) {
        Map<String, Object> cache = requestCache.get();
        if (cache == null) {
            cache = new HashMap<>();
            requestCache.set(cache);
        }
        
        String cacheKey = "header:" + headerName;
        if (cache.containsKey(cacheKey)) {
            return (String) cache.get(cacheKey);
        }
        
        String value = ServletUtil.getHeader(headerName);
        cache.put(cacheKey, value);
        
        return value;
    }
    
    /**
     * 清理请求缓存
     */
    public static void clearRequestCache() {
        requestCache.remove();
    }
}
```

### 2. 批量 Header 处理

```java
@Service
public class BatchHeaderService {
    
    /**
     * 批量获取多个 Header
     */
    public Map<String, String> getBatchHeaders(List<String> headerNames) {
        Map<String, String> headers = new HashMap<>();
        
        // 一次性获取所有 Header，避免多次调用
        EnumMap<YmHeaderEnum, String> allHeaders = ServletUtil.getHeaders();
        
        for (String headerName : headerNames) {
            // 先从标准 Header 中查找
            String value = findInStandardHeaders(headerName, allHeaders);
            
            // 如果没找到，再从自定义 Header 中查找
            if (value == null) {
                value = ServletUtil.getHeader(headerName);
            }
            
            if (value != null) {
                headers.put(headerName, value);
            }
        }
        
        return headers;
    }
    
    private String findInStandardHeaders(String headerName, EnumMap<YmHeaderEnum, String> allHeaders) {
        for (Map.Entry<YmHeaderEnum, String> entry : allHeaders.entrySet()) {
            if (entry.getKey().name().equalsIgnoreCase(headerName)) {
                return entry.getValue();
            }
        }
        return null;
    }
}
```

## 最佳实践

### 1. 异常处理

```java
@Service
public class SafeServletService {
    
    /**
     * 安全的 Header 获取
     */
    public String safeGetHeader(String headerName, String defaultValue) {
        try {
            String value = ServletUtil.getHeader(headerName);
            return StringUtils.isNotEmpty(value) ? value : defaultValue;
        } catch (Exception e) {
            log.warn("获取 Header 失败: headerName={}", headerName, e);
            return defaultValue;
        }
    }
    
    /**
     * 安全的业务 Header 获取
     */
    public BusinessHeaders safeGetBusinessHeaders() {
        BusinessHeaders headers = new BusinessHeaders();
        
        try {
            headers.setToken(ServletUtil.getToken());
        } catch (Exception e) {
            log.warn("获取 token 失败", e);
            headers.setToken("");
        }
        
        try {
            headers.setVersion(ServletUtil.getVersion());
        } catch (Exception e) {
            log.warn("获取 version 失败", e);
            headers.setVersion("1.0.0");
        }
        
        try {
            headers.setPlatform(ServletUtil.getPlatform());
        } catch (Exception e) {
            log.warn("获取 platform 失败", e);
            headers.setPlatform(PlatformEnum.WEB);
        }
        
        return headers;
    }
}
```

### 2. 监控和日志

```java
@Service
public class MonitoredServletService {
    
    @Autowired
    private MeterRegistry meterRegistry;
    
    /**
     * 带监控的请求处理
     */
    public void processRequestWithMonitoring() {
        Timer.Sample sample = Timer.start(meterRegistry);
        
        try {
            // 获取请求信息
            String token = ServletUtil.getToken();
            PlatformEnum platform = ServletUtil.getPlatform();
            String version = ServletUtil.getVersion();
            
            // 记录请求指标
            meterRegistry.counter("request.count", 
                "platform", platform.name(),
                "version", version).increment();
            
            // 处理业务逻辑
            processBusinessLogic(token, platform, version);
            
        } catch (Exception e) {
            meterRegistry.counter("request.error").increment();
            throw e;
        } finally {
            sample.stop(Timer.builder("request.duration").register(meterRegistry));
        }
    }
    
    private void processBusinessLogic(String token, PlatformEnum platform, String version) {
        // 业务逻辑实现
    }
}
```

## 注意事项

### 1. 线程安全
- ServletUtil 依赖于 Spring 的 RequestContextHolder
- 只能在 Web 请求线程中使用
- 异步线程中无法获取请求信息

### 2. 空值处理
- Header 可能为空，需要适当的空值检查
- 平台信息解析可能失败，需要提供默认值
- 请求对象在非 Web 环境下为 null

### 3. 性能考虑
- 避免重复获取相同的 Header
- 批量处理时考虑缓存机制
- 大量 Header 操作时注意性能影响

### 4. 安全性
- 敏感信息不要记录到日志中
- Token 等认证信息要妥善处理
- 用户输入的 Header 值要进行验证

## 常见问题

### Q: 在异步线程中无法获取请求信息怎么办？
A: 可以在主线程中获取请求信息并传递给异步线程，或者使用 RequestContextManager 在异步执行前传递上下文。

### Q: 如何处理自定义 Header？
A: 使用 ServletUtil.getHeader(headerName) 方法可以获取任意自定义 Header。

### Q: AB 测试 Header 的命名规范是什么？
A: 建议使用小写字母和下划线，如：product_list_layout、recommendation_algorithm。

### Q: 如何在拦截器中使用 ServletUtil？
A: 拦截器中可以直接使用 ServletUtil，因为此时请求上下文已经建立。但要注意在 afterCompletion 中及时清理资源。