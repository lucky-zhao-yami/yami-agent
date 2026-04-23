# BaseData 公共类

测试中常用的公共方法，用于 Mock Token 和 HttpServletRequest。

```groovy
package com.yamibuy.ec.customer.service

import com.yami.core.config.TokenVersionConfig
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.web.context.request.RequestContextHolder
import org.springframework.web.context.request.ServletRequestAttributes
import javax.servlet.http.HttpServletRequestWrapper

class BaseData {

    static def getToken() {
        TokenVersionConfig tokenVersionConfig = new TokenVersionConfig()
        tokenVersionConfig.setV(1)
        tokenVersionConfig.setKey("yamibuy202212345")
        return "eyJhdXRoIjoiMGE5YWFkZmUzODc1MWQ0MGVhZDQyZDZhNGI5ZjRkYWEiLCJkYXRhIjoiMTAwMDE4NTkiLCJub25jZSI6IjgzMTMiLCJ0IjoyLCJ0cyI6MTY5MzkwMjUyNywidiI6MX0="
    }

    static def getAnonymousToken() {
        TokenVersionConfig tokenVersionConfig = new TokenVersionConfig()
        tokenVersionConfig.setV(1)
        tokenVersionConfig.setKey("yamibuy202212345")
        return "eyJhdXRoIjoiNWMxOGQ2ZjNiM2M5YTUxNTBkZDA5OWQxYzdiYzBkYzciLCJkYXRhIjoiMGZlYjI0OGMtMDM0Yi00Mjg5LThlNDUtNjQwZDY3MTQzNWJkIiwibm9uY2UiOiIzMTk3IiwidCI6MiwidHMiOjE3MTMzMzI1ODYsInYiOjF9"
    }

    static def mockRequest(String... headers) {
        MockHttpServletRequest mockHttpServletRequest = new MockHttpServletRequest()
        mockHttpServletRequest.addHeader("y_language", "zh_CN")
        mockHttpServletRequest.addHeader("y_platform", "android")
        mockHttpServletRequest.addHeader("y_version", "301")
        mockHttpServletRequest.addHeader("device_id", "1")
        mockHttpServletRequest.addHeader("ym_id", "1")
        mockHttpServletRequest.addHeader("token", getToken())
        for (int i = 0; i < headers.length; i += 2) {
            mockHttpServletRequest.addHeader(headers[i], headers[i + 1])
        }
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(new HttpServletRequestWrapper(mockHttpServletRequest)))
        return mockHttpServletRequest
    }
}
```

# StaticMockHelper 工具类

多线程安全的静态方法 Mock 工具，解决并行测试时静态 Mock 冲突问题。

```groovy
package com.yamibuy.ec.customer.service

import org.mockito.MockedStatic
import org.mockito.Mockito
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.locks.ReentrantLock

class StaticMockHelper {

    private static final Logger log = LoggerFactory.getLogger(StaticMockHelper.class)
    private static final ConcurrentHashMap<Class<?>, ReentrantLock> CLASS_LOCKS = new ConcurrentHashMap<>()
    private static final ConcurrentHashMap<Class<?>, MockedStatic<?>> ACTIVE_MOCKS = new ConcurrentHashMap<>()

    /**
     * 获取指定类的锁并创建静态 Mock
     */
    static <T> MockedStatic<T> mockStatic(Class<T> clazz) {
        ReentrantLock lock = CLASS_LOCKS.computeIfAbsent(clazz, { new ReentrantLock() })
        
        log.debug("[StaticMockHelper] 线程 {} 尝试获取 {} 的锁", Thread.currentThread().getName(), clazz.getSimpleName())
        lock.lock()
        log.debug("[StaticMockHelper] 线程 {} 成功获取 {} 的锁", Thread.currentThread().getName(), clazz.getSimpleName())
        
        MockedStatic<T> mockedStatic = Mockito.mockStatic(clazz)
        ACTIVE_MOCKS.put(clazz, mockedStatic)
        
        return mockedStatic
    }

    /**
     * 关闭静态 Mock 并释放锁
     */
    static <T> void closeMock(Class<T> clazz, MockedStatic<T> mockedStatic) {
        if (mockedStatic == null) return
        
        mockedStatic.close()
        ACTIVE_MOCKS.remove(clazz)
        
        ReentrantLock lock = CLASS_LOCKS.get(clazz)
        if (lock != null && lock.isHeldByCurrentThread()) {
            lock.unlock()
            log.debug("[StaticMockHelper] 线程 {} 释放 {} 的锁", Thread.currentThread().getName(), clazz.getSimpleName())
        }
    }
}
```

# Mock LangConfigService 示例

```groovy
class MyServiceTest extends Specification {

    private MockedStatic<LangConfigService> langConfigMockedStatic

    def setup() {
        langConfigMockedStatic = StaticMockHelper.mockStatic(LangConfigService.class)
    }

    def cleanup() {
        StaticMockHelper.closeMock(LangConfigService.class, langConfigMockedStatic)
    }

    def "test with specific config"() {
        given:
        // 单参数
        langConfigMockedStatic.when(() -> LangConfigService.get("key")).thenReturn("value")
        
        // 双参数 (key, language)
        langConfigMockedStatic.when(() -> LangConfigService.get("key", "zh_CN")).thenReturn("中文")

        when:
        def result = myService.method()

        then:
        result == expected
    }

    def "test with any matcher"() {
        given:
        langConfigMockedStatic.when(() -> LangConfigService.get(Mockito.anyString())).thenReturn("default")

        // ...
    }
}
```
