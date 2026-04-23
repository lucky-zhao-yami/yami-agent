# 文件上传工具使用指南

## 概述

YamibuyUploader 是亚米网统一的文件上传工具，提供了简单易用的文件上传功能，支持多种文件类型，并自动集成 CDN 服务。

## 核心功能

### 1. 统一文件上传接口
- 支持多种文件类型（图片、文档等）
- 自动 CDN 集成
- 统一的上传域名配置
- 标准化的响应格式

### 2. 配置管理
- 可配置上传域名
- 默认使用 `https://rs.yamibuy.tech`
- 支持环境变量覆盖

## 使用方法

### 1. 基本用法

```java
@Autowired
private YamibuyUploader yamibuyUploader;

public String uploadImage(String token, byte[] imageData) {
    String fileName = "user_avatar.jpg";
    String mediaType = "image/jpeg";
    
    String cdnUrl = YamibuyUploader.uploadFile(token, mediaType, fileName, imageData);
    if (cdnUrl != null) {
        log.info("文件上传成功，CDN地址: {}", cdnUrl);
        return cdnUrl;
    } else {
        log.error("文件上传失败");
        return null;
    }
}
```

### 2. 支持的文件类型

```java
// 图片文件
String imageUrl = YamibuyUploader.uploadFile(token, "image/jpeg", "photo.jpg", imageData);
String pngUrl = YamibuyUploader.uploadFile(token, "image/png", "logo.png", pngData);

// 文档文件
String pdfUrl = YamibuyUploader.uploadFile(token, "application/pdf", "document.pdf", pdfData);
String excelUrl = YamibuyUploader.uploadFile(token, "application/vnd.ms-excel", "report.xlsx", excelData);

// 其他文件
String textUrl = YamibuyUploader.uploadFile(token, "text/plain", "config.txt", textData);
```

### 3. 配置上传域名

在 `application.yml` 中配置：

```yaml
yamibuy_upload_domain: https://rs.yamibuy.tech
```

或在 `application.properties` 中：

```properties
yamibuy_upload_domain=https://rs.yamibuy.tech
```

## 方法参数说明

### uploadFile 方法

```java
public static String uploadFile(String token, String mediaTypeValue, String fileName, byte[] fileData)
```

**参数说明：**
- `token`: 用户认证令牌，用于权限验证
- `mediaTypeValue`: 文件的 MIME 类型（如 "image/jpeg", "application/pdf"）
- `fileName`: 文件名称，包含扩展名
- `fileData`: 文件的字节数组数据

**返回值：**
- 成功：返回 CDN 完整 URL 地址
- 失败：返回 null

## 响应格式

上传成功时，服务端返回格式：

```json
{
    "messageId": 10000,
    "body": {
        "queryPath": "https://cdn.yamibuy.tech",
        "cdnPath": "https://cdn.yamibuy.tech", 
        "names": [
            "https://cdn.yamibuy.tech/file/common/uploaded_file.jpg"
        ]
    }
}
```

工具会自动提取 `body.names[0]` 作为最终的文件 URL。

## 实际应用场景

### 1. 用户头像上传

```java
@PostMapping("/upload/avatar")
public ResponseEntity<String> uploadAvatar(
    @RequestHeader("token") String token,
    @RequestParam("file") MultipartFile file) {
    
    try {
        byte[] fileData = file.getBytes();
        String fileName = file.getOriginalFilename();
        String contentType = file.getContentType();
        
        String avatarUrl = YamibuyUploader.uploadFile(token, contentType, fileName, fileData);
        
        if (avatarUrl != null) {
            // 保存头像URL到用户信息
            userService.updateAvatar(getCurrentUserId(), avatarUrl);
            return ResponseEntity.ok(avatarUrl);
        } else {
            return ResponseEntity.status(500).body("上传失败");
        }
    } catch (Exception e) {
        log.error("头像上传异常", e);
        return ResponseEntity.status(500).body("上传异常");
    }
}
```

### 2. 商品图片上传

```java
@Service
public class ProductImageService {
    
    public List<String> uploadProductImages(String token, List<MultipartFile> images) {
        List<String> imageUrls = new ArrayList<>();
        
        for (MultipartFile image : images) {
            try {
                String imageUrl = YamibuyUploader.uploadFile(
                    token, 
                    image.getContentType(), 
                    image.getOriginalFilename(), 
                    image.getBytes()
                );
                
                if (imageUrl != null) {
                    imageUrls.add(imageUrl);
                }
            } catch (Exception e) {
                log.error("商品图片上传失败: {}", image.getOriginalFilename(), e);
            }
        }
        
        return imageUrls;
    }
}
```

### 3. 文档上传

```java
@PostMapping("/upload/document")
public ResponseEntity<String> uploadDocument(
    @RequestHeader("token") String token,
    @RequestParam("document") MultipartFile document) {
    
    // 验证文件类型
    String contentType = document.getContentType();
    if (!isValidDocumentType(contentType)) {
        return ResponseEntity.badRequest().body("不支持的文件类型");
    }
    
    // 验证文件大小（例如限制10MB）
    if (document.getSize() > 10 * 1024 * 1024) {
        return ResponseEntity.badRequest().body("文件大小超过限制");
    }
    
    try {
        String documentUrl = YamibuyUploader.uploadFile(
            token, 
            contentType, 
            document.getOriginalFilename(), 
            document.getBytes()
        );
        
        return documentUrl != null ? 
            ResponseEntity.ok(documentUrl) : 
            ResponseEntity.status(500).body("上传失败");
            
    } catch (Exception e) {
        log.error("文档上传异常", e);
        return ResponseEntity.status(500).body("上传异常");
    }
}

private boolean isValidDocumentType(String contentType) {
    return contentType != null && (
        contentType.equals("application/pdf") ||
        contentType.equals("application/vnd.ms-excel") ||
        contentType.equals("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") ||
        contentType.equals("text/plain")
    );
}
```

## 最佳实践

### 1. 异常处理
```java
public String safeUploadFile(String token, String mediaType, String fileName, byte[] fileData) {
    try {
        String result = YamibuyUploader.uploadFile(token, mediaType, fileName, fileData);
        if (result == null) {
            log.warn("文件上传返回null，可能是服务端错误或网络问题");
        }
        return result;
    } catch (Exception e) {
        log.error("文件上传异常: fileName={}, mediaType={}", fileName, mediaType, e);
        return null;
    }
}
```

### 2. 文件验证
```java
public boolean validateFile(MultipartFile file) {
    // 检查文件是否为空
    if (file.isEmpty()) {
        return false;
    }
    
    // 检查文件大小（例如限制5MB）
    if (file.getSize() > 5 * 1024 * 1024) {
        log.warn("文件大小超过限制: {} bytes", file.getSize());
        return false;
    }
    
    // 检查文件类型
    String contentType = file.getContentType();
    if (contentType == null || !isAllowedContentType(contentType)) {
        log.warn("不支持的文件类型: {}", contentType);
        return false;
    }
    
    return true;
}
```

### 3. 批量上传
```java
public List<String> batchUpload(String token, List<MultipartFile> files) {
    return files.parallelStream()
        .filter(this::validateFile)
        .map(file -> {
            try {
                return YamibuyUploader.uploadFile(
                    token, 
                    file.getContentType(), 
                    file.getOriginalFilename(), 
                    file.getBytes()
                );
            } catch (Exception e) {
                log.error("批量上传文件失败: {}", file.getOriginalFilename(), e);
                return null;
            }
        })
        .filter(Objects::nonNull)
        .collect(Collectors.toList());
}
```

## 注意事项

### 1. 安全考虑
- 始终验证文件类型和大小
- 对文件名进行安全检查，避免路径遍历攻击
- 确保 token 的有效性

### 2. 性能优化
- 大文件上传考虑分片上传
- 批量上传使用并行处理
- 合理设置超时时间

### 3. 错误处理
- 上传失败时提供友好的错误信息
- 记录详细的错误日志便于排查
- 考虑重试机制

### 4. 配置管理
- 不同环境使用不同的上传域名
- 通过配置文件管理上传参数
- 支持动态配置更新

## 常见问题

### Q: 上传返回 null 怎么办？
A: 检查以下几点：
1. token 是否有效
2. 网络连接是否正常
3. 文件数据是否完整
4. 上传域名配置是否正确

### Q: 如何处理大文件上传？
A: 建议：
1. 增加超时时间配置
2. 考虑分片上传
3. 添加进度回调
4. 实现断点续传

### Q: 支持哪些文件格式？
A: 理论上支持所有格式，常用的包括：
- 图片：jpg, png, gif, webp
- 文档：pdf, doc, docx, xls, xlsx
- 其他：txt, zip, mp4 等

### Q: 如何自定义上传参数？
A: 当前版本使用固定参数（type=common, channel=Yamibuy, local=Yamibuy），如需自定义可以扩展工具类。