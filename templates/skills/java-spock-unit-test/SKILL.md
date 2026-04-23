---
name: java-spock-unit-test
description: Java 项目的 Spock + Groovy 单元测试生成技能。当用户需要为 Java 代码生成单元测试、编写测试用例、Mock 依赖或验证测试时使用此技能。支持静态方法 Mock、HttpServletRequest Mock、数据驱动测试等场景。
---

# Java Spock 单元测试技能

为 Java 代码生成符合规范的 Spock 单元测试。

## 测试文件规范

- **位置**: `src/main/java` → `src/test/groovy`
- **命名**: `{类名}Test.groovy`
- **框架**: Spock Framework + Groovy

## 核心 Mock 模式

### 1. Mock Token

```groovy
// 实名用户
String token = BaseData.getToken()

// 匿名用户  
String token = BaseData.getAnonymousToken()
```

### 2. Mock HttpServletRequest

当方法使用 `ServletUtil.getHeaders()` 等从 request 获取参数时：

```groovy
def setup() {
    BaseData.mockRequest()  // 默认 headers
    // 或自定义
    BaseData.mockRequest("custom_header", "value")
}
```

### 3. Mock 静态方法（多线程安全）

```groovy
private MockedStatic<SomeUtil> mockedStatic

def setup() {
    mockedStatic = StaticMockHelper.mockStatic(SomeUtil.class)
}

def cleanup() {
    StaticMockHelper.closeMock(SomeUtil.class, mockedStatic)
}

def "test"() {
    given:
    mockedStatic.when(() -> SomeUtil.method(Mockito.any())).thenReturn("value")
    // ...
}
```

### 4. Mock 依赖注入

```groovy
@Spy
MyService myService = new MyService(
    someDao: Mock(SomeDao),
    jedisClientImp: Mock(JedisClientImp),
    configValue: "test"  // @Value 字段
)
```

**重要**: 被 Mock 的字段不能是 `private`，需改为包内私有（无修饰符）。

## 测试类模板

```groovy
package com.yamibuy.ec.customer.service

import org.mockito.MockedStatic
import org.mockito.Mockito
import org.mockito.Spy
import spock.lang.Specification

class MyServiceTest extends Specification {

    @Spy
    MyService myService = new MyService(
        dependency1: Mock(Dependency1),
        dependency2: Mock(Dependency2)
    )

    def setup() {
        BaseData.mockRequest()
    }

    def "方法描述 - 场景描述"() {
        given: "准备数据"
        myService.dependency1.someMethod(_) >> expectedReturn

        when: "执行"
        def result = myService.methodUnderTest(params)

        then: "验证"
        result == expected
    }

    // 数据驱动测试
    def "数据驱动测试"() {
        expect:
        myService.method(input) == output

        where:
        input | output
        "a"   | "A"
        "b"   | "B"
    }
}
```

## Mock 返回值语法

```groovy
// 固定返回
dao.findById(_) >> new Entity(id: 1)

// 根据参数返回
dao.findById(_) >> { args -> args[0] == 1 ? entity1 : entity2 }

// 返回 null
service.method(_) >> null

// 抛异常
service.method(_) >> { throw new RuntimeException("error") }

// 验证调用次数
1 * dao.save(_)
0 * dao.delete(_)
```

## 常用断言

```groovy
result == expected
result != null
result.size() == 3
noExceptionThrown()
thrown(YamibuyException)
```

## 验证命令

```bash
# 在服务根目录执行
cd ec-customer-service

# 编译
mvn clean install -DskipTests -pl ec-customer-service -am

# 运行测试
mvn test -Dtest=MyServiceTest -pl ec-customer-service
```

## 常见问题

| 问题 | 解决方案 |
|-----|---------|
| Mock 注入失败 | 字段改为包内私有（去掉 private） |
| 静态方法 Mock 冲突 | 使用 StaticMockHelper |
| NullPointerException | 检查是否所有依赖都已 Mock |
| 测试找不到 | 检查 src/test/groovy 目录结构 |
