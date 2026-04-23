---
name: wirte-java-unit-test
description: "当需要为 Java 代码编写 Spock 单元测试、Mock 测试、Groovy 测试时使用。触发词：spock, mock, unit test, 单元测试, java test, groovy test"
---

# Java Spock 单元测试指南

## 执行模式

本 Skill 采用 **Main-Agent + Sub-Agent 架构**，防止上下文溢出：

- **Main-Agent**：负责流程规划、任务分发、进度追踪
- **Sub-Agent**：负责具体的测试编写和验证工作

**核心原则**：
1. 所有具体测试任务由 Sub-Agent 执行
2. 测试计划持久化到 `[描述].test.md` 文件
3. 默认直接执行，无需用户确认
4. 循环执行直至所有测试通过

---

## Main-Agent 工作流程

### Phase 1: 初始化与规划

**Step 1.1: 获取分支差异**

使用 `code-branch-diff` 执行分支对比分析。

**Step 1.2: 筛选测试目标**

- 仅 `.java` 文件
- 排除测试文件（`*Test.java`, `*Spec.groovy`）
- 关注 Service 层和核心业务逻辑

**Step 1.3: 创建测试计划文件**

在项目根目录创建 `[分支名或描述].test.md`，格式如下：

```markdown
# 单元测试计划

## 基本信息
- 创建时间: [时间戳]
- 分支: [分支名]
- 项目根目录: [路径]

## 测试任务列表

| 序号 | 源文件 | 测试文件 | 状态 | 备注 |
|------|--------|----------|------|------|
| 1 | UserService.java | UserServiceTest.groovy | ⏳ 待处理 | |
| 2 | OrderService.java | OrderServiceTest.groovy | ⏳ 待处理 | |

## 执行日志

### Task 1: UserService
- 开始时间: 
- 结束时间: 
- 状态: 
- 错误信息: 

## 汇总
- 总任务数: 
- 已完成: 
- 失败: 
```

### Phase 2: 任务分发（串行执行）

**⚠️ 必须串行执行，禁止并行！** Maven 编译存在锁机制，并行执行会导致编译失败。

对每个待处理任务，**逐个**调用 Sub-Agent，等待上一个任务完成后再执行下一个。**必须传递完整的编写规范**：

```
invokeSubAgent(
  name: "general-task-execution",
  prompt: "
## 任务：编写 Spock 单元测试

### 任务信息
- 源文件: [源文件完整路径]
- 测试文件: [测试文件完整路径]
- 项目根目录: [项目根目录]
- 模块名: [Maven 模块名]

### 执行步骤

#### Step 1: 读取源文件，分析需要测试的方法

识别测试范围：
- 新增方法：完整覆盖所有分支和边界条件
- 修改方法：覆盖变更的逻辑分支
- 删除方法：移除对应的测试用例

关注点：
- 方法签名（public/protected/包内私有）
- if/else 分支逻辑
- API 调用和依赖注入
- 异常处理逻辑
- **重要**：如果依赖属性是 private 修饰的，需要在源文件中删除 private 修饰符

#### Step 2: 确定测试文件路径

路径转换规则：
- `src/main/java` → `src/test/groovy`
- `.java` → `Test.groovy`
- 类名添加 `Test` 后缀

#### Step 3: 检查公共工具类是否存在

检查测试目录下是否存在以下文件，如不存在则创建：

**StaticMockHelper.groovy**（线程安全的静态方法 Mock）：
```groovy
package [与测试类相同的包名]

import org.mockito.MockedStatic
import org.mockito.Mockito
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.locks.ReentrantLock

class StaticMockHelper {
    private static final ConcurrentHashMap<Class<?>, ReentrantLock> CLASS_LOCKS = new ConcurrentHashMap<>()
    private static final ConcurrentHashMap<Class<?>, MockedStatic<?>> ACTIVE_MOCKS = new ConcurrentHashMap<>()

    static <T> MockedStatic<T> mockStatic(Class<T> clazz) {
        ReentrantLock lock = CLASS_LOCKS.computeIfAbsent(clazz, { new ReentrantLock() })
        lock.lock()
        MockedStatic<T> mockedStatic = Mockito.mockStatic(clazz)
        ACTIVE_MOCKS.put(clazz, mockedStatic)
        return mockedStatic
    }

    static <T> void closeMock(Class<T> clazz, MockedStatic<T> mockedStatic) {
        if (mockedStatic == null) return
        mockedStatic.close()
        ACTIVE_MOCKS.remove(clazz)
        ReentrantLock lock = CLASS_LOCKS.get(clazz)
        if (lock != null && lock.isHeldByCurrentThread()) {
            lock.unlock()
        }
    }
}
```

**BaseData.groovy**（测试用 Token 和 Mock Request）：
```groovy
package [与测试类相同的包名]

import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.web.context.request.RequestContextHolder
import org.springframework.web.context.request.ServletRequestAttributes
import javax.servlet.http.HttpServletRequestWrapper

class BaseData {
    static def getToken() {
        return \"eyJhdXRoIjoiMGE5YWFkZmUzODc1MWQ0MGVhZDQyZDZhNGI5ZjRkYWEiLCJkYXRhIjoiMTAwMDE4NTkiLCJub25jZSI6IjgzMTMiLCJ0IjoyLCJ0cyI6MTY5MzkwMjUyNywidiI6MX0=\"
    }

    static def getAnonymousToken() {
        return \"eyJhdXRoIjoiNWMxOGQ2ZjNiM2M5YTUxNTBkZDA5OWQxYzdiYzBkYzciLCJkYXRhIjoiMGZlYjI0OGMtMDM0Yi00Mjg5LThlNDUtNjQwZDY3MTQzNWJkIiwibm9uY2UiOiIzMTk3IiwidCI6MiwidHMiOjE3MTMzMzI1ODYsInYiOjF9\"
    }

    static def mockRequest(String... headers) {
        MockHttpServletRequest req = new MockHttpServletRequest()
        req.addHeader(\"y_language\", \"zh_CN\")
        req.addHeader(\"y_platform\", \"android\")
        req.addHeader(\"y_version\", \"301\")
        req.addHeader(\"device_id\", \"1\")
        req.addHeader(\"ym_id\", \"1\")
        req.addHeader(\"token\", getToken())
        for (int i = 0; i < headers.length; i += 2) {
            req.addHeader(headers[i], headers[i + 1])
        }
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(new HttpServletRequestWrapper(req)))
        return req
    }
}
```

#### Step 4: 编写测试类

**测试类结构模板**：
```groovy
package [包名]

import org.mockito.MockedStatic
import org.mockito.Spy
import spock.lang.Specification

class [类名]Test extends Specification {

    // 使用 @Spy 注解，通过 Groovy Map 语法注入 Mock 依赖
    @Spy
    [被测试类] service = new [被测试类](
            // Mock 所有依赖（DAO、Service、Client 等）
            userDao: Mock(UserDao),
            redisService: Mock(RedisService),
            // 注入配置值
            configValue: 10
    )

    // 静态方法 Mock 声明（如有需要）
    private MockedStatic<SomeUtil> someUtilMock

    def setup() {
        // 初始化静态 Mock
        someUtilMock = StaticMockHelper.mockStatic(SomeUtil.class)
    }

    def cleanup() {
        // 关闭静态 Mock（必须）
        StaticMockHelper.closeMock(SomeUtil.class, someUtilMock)
    }

    // 测试方法示例
    def \"方法名_场景描述_期望结果\"() {
        given: \"准备测试数据\"
        def input = \"test\"
        // Mock 返回值
        service.userDao.findById(_) >> new User(id: 1, name: \"test\")

        when: \"执行被测方法\"
        def result = service.methodUnderTest(input)

        then: \"验证结果\"
        result != null
        result.name == \"test\"
    }

    // 数据驱动测试（多组输入输出）
    def \"方法名_数据驱动测试\"() {
        expect:
        service.calculate(input) == expected

        where:
        input | expected
        1     | 2
        2     | 4
        0     | 0
    }

    // 异常测试
    def \"方法名_异常场景_抛出指定异常\"() {
        given:
        service.userDao.findById(_) >> null

        when:
        service.methodUnderTest(\"invalid\")

        then:
        thrown(YamibuyException)
    }
}
```

**测试覆盖要求**：
1. 正常流程 - 方法正常执行返回预期结果
2. 边界条件 - null 值、空字符串、空集合
3. 异常情况 - API 调用失败、数据库异常
4. 业务逻辑分支 - if/else 各分支都要覆盖

**Mock 语法速查**：
```groovy
// 返回固定值
service.dao.findById(_) >> new User(id: 1)

// 返回 null
service.dao.findById(_) >> null

// 抛出异常
service.dao.findById(_) >> { throw new RuntimeException(\"error\") }

// 根据参数返回不同值
service.dao.findById(_) >> { args -> args[0] == 1 ? new User(id: 1) : null }

// 验证调用次数
1 * service.dao.save(_)
0 * service.dao.delete(_)

// 静态方法 Mock
someUtilMock.when(() -> SomeUtil.staticMethod(_)).thenReturn(\"mocked\")
```

**断言语法速查**：
```groovy
result == expected           // 相等
result != null               // 非空
result.size() == 3           // 集合大小
thrown(YamibuyException)     // 期望异常
noExceptionThrown()          // 无异常
```

#### Step 5: 验证测试

```powershell
# 1. 切换到项目根目录
cd [项目根目录]

# 2. 编译依赖模块
mvn clean install -DskipTests -pl [模块名] -am

# 3. 执行测试
mvn test -Dtest=[测试类名] -pl [模块名]
```

#### Step 6: 返回结果

返回 JSON 格式结果：
```json
{
  \"status\": \"success|failed\",
  \"testClass\": \"UserServiceTest\",
  \"testMethods\": [\"testMethod1\", \"testMethod2\"],
  \"errorMessage\": \"如有错误则填写详细信息\"
}
```

### 重要规则
1. Mock 的属性不能是 private 修饰，如果是需要先修改源文件删除 private
2. 静态方法 Mock 必须在 cleanup 中关闭
3. 保留原有测试用例，只新增或修改
4. 测试方法命名：方法名_场景_期望结果
"
)
```

### Phase 3: 结果处理（串行循环）

1. 等待当前 Sub-Agent 返回结果
2. 更新测试计划文件中的任务状态
3. 如当前任务失败，立即重新分发给 Sub-Agent 修复（最多重试 3 次）
4. 当前任务通过后，再处理下一个任务
5. 循环直至所有任务通过

### Phase 4: 完成汇总

更新测试计划文件的汇总部分，输出最终结果。

---

## 注意事项

1. **先对比后编写** - 先执行分支对比，了解完整的代码变更范围
2. **仅针对 Java 文件** - 只为 `.java` 文件编写测试
3. **只测试变更的方法和逻辑分支**
4. **保留原有测试用例**，不要删除
5. **Mock 声明在类级别**，cleanup 中关闭
6. **必须使用 StaticMockHelper 和 BaseData**
7. **private 修饰符需要删除**（Mock 要求）
8. **默认直接执行**，无需用户确认
9. **测试计划持久化**，防止上下文丢失

---

## 快速开始

激活此 Skill 后，Main-Agent 将自动：

1. 执行分支对比分析
2. 创建测试计划文件 `[分支名].test.md`
3. 逐个分发任务给 Sub-Agent（包含完整编写规范）
4. 追踪进度直至所有测试通过

如需手动指定测试目标，直接提供 Java 文件路径即可。
