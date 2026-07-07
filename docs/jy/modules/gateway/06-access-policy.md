# 统一访问策略功能详解

## 1. 背景与目标

### 这次重构为什么要做

在 PaperFlow 的 API Gateway 里，访问控制不是只靠一个过滤器完成的，而是至少会经过两层判断：
- `JwtAuthGlobalFilter` 负责决定请求是否必须携带 Bearer Token
- `RateLimitGlobalFilter` 负责决定请求应该落到哪一档限流桶

问题在于，重构前这两层判断各自维护了一份路径规则。它们看起来相似，但并不是同一份来源，所以只要后续新增公开接口、补白名单或调整 OAuth 回调，两个过滤器就需要手工同步修改。一旦漏改，就会出现“鉴权放行了，但限流还是按匿名接口算”的漂移问题。

这次重构的目标很明确：
1. 把“请求属于哪一类访问策略”的判断收敛成一个单一入口
2. 让鉴权与限流都消费同一份决策结果
3. 用更清晰的测试矩阵保护这套分类逻辑，降低后续回归风险

### 功能目标

1. **统一分类入口**：所有请求先经过统一访问策略组件分类
2. **同时服务鉴权与限流**：同一份分类结果供多个过滤器复用
3. **兼容现有阈值配置**：不改 `application.yml` 的限流参数来源，只改判断入口
4. **补齐测试可验证性**：策略类可直接做矩阵测试，不再只能从过滤器侧面验证

---

## 2. 重构前后的结构变化

### 重构前：两个过滤器各写一份规则

重构前的逻辑可以简化理解成下面这样：

```text
Request
  -> JwtAuthGlobalFilter
       自己判断 isAuthPublic / isOauthCallback / isPublic
  -> RateLimitGlobalFilter
       自己判断 isAuth / isPublic
  -> Route to Service
```

这种结构的核心问题不是“代码长一点”，而是**规则来源分散**。同一条路径是否公开、是否属于认证接口、是否应该进入公开限流桶，答案散落在多个类里，很容易发生分叉。

### 重构后：统一访问策略作为单一决策源

重构后的结构变成：

```text
Request
  -> EndpointAccessPolicy
       输出 authRequired + bucket
  -> JwtAuthGlobalFilter
       消费 authRequired
  -> RateLimitGlobalFilter
       消费 bucket
  -> Route to Service
```

这样做的关键收益是：
- 新增或调整公开路径时，主要只需要改一处分类逻辑
- 鉴权与限流不会因为复制粘贴规则而产生漂移
- 测试可以直接验证“输入某个路径，输出哪种分类”

---

## 3. 核心设计：EndpointAccessPolicy

### 文件位置

代码位置：[EndpointAccessPolicy.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/java/com/paperflow/gateway/filter/EndpointAccessPolicy.java)

### 核心职责

这个类只做一件事：根据 `path + method` 给出访问策略决策。

当前输出有两部分：
- `authRequired`：这个请求是否必须经过 Bearer Token 鉴权
- `bucket`：这个请求应该落入哪类限流桶

### 当前分类结果

当前实现定义了三种 bucket：

| Bucket | 含义 | 典型路径 |
|------|------|----------|
| `AUTH` | 认证相关公开接口 | `/api/v1/auth/login`、`/api/v1/auth/refresh`、OAuth callback |
| `PUBLIC_GET` | 可匿名访问的公开 GET | `/api/v1/posts/**`、`/api/v1/comments/**`、`/api/v1/public/users/**`、`/api/v1/public/papers/**` |
| `PROTECTED` | 其他受保护请求 | 通知、收藏、点赞、评论创建等 |

### 最小实现代码

```java
@Component
public final class EndpointAccessPolicy {
  public EndpointAccessDecision decide(String path, HttpMethod method) {
    if (path == null || path.isBlank()) {
      return new EndpointAccessDecision(true, EndpointAccessBucket.PROTECTED);
    }
    if (isAuthRoute(path) || isOauthRoute(path)) {
      return new EndpointAccessDecision(false, EndpointAccessBucket.AUTH);
    }
    if (isPublicGetRoute(path, method)) {
      return new EndpointAccessDecision(false, EndpointAccessBucket.PUBLIC_GET);
    }
    return new EndpointAccessDecision(true, EndpointAccessBucket.PROTECTED);
  }
}
```

### 设计边界

这次重构没有把访问策略做成配置化 DSL，也没有引入复杂的匹配器体系，而是先做最小可维护实现。这样做的原因是：
- 当前问题是“规则分散”，不是“规则表达力不够”
- 先统一决策来源，就已经能显著降低漂移风险
- 继续做配置化或声明式映射，可以留到下一轮重构

---

## 4. JwtAuthGlobalFilter 如何消费统一策略

### 文件位置

代码位置：[JwtAuthGlobalFilter.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/java/com/paperflow/gateway/filter/JwtAuthGlobalFilter.java)

### 重构后的关键变化

重构前，`JwtAuthGlobalFilter` 自己维护：
- `isAuthPublic`
- `isOauthCallback`
- `isPublic`

重构后，它不再关心具体路径清单，而是只关心统一策略给出的答案。

### 当前关键逻辑

```java
EndpointAccessDecision decision = accessPolicy.decide(path, method);
String auth = exchange.getRequest().getHeaders().getFirst(HttpHeaders.AUTHORIZATION);
boolean hasBearer = auth != null && !auth.isBlank() && auth.startsWith("Bearer ");

if (!decision.authRequired() && !hasBearer) {
  return chain.filter(exchange);
}
```

这段逻辑的含义是：
- 如果统一策略判定“这个请求不要求鉴权”，且当前请求也没带 Bearer Token，就直接放行
- 如果请求带了 Bearer Token，即使它是公开接口，也仍然会继续走 JWT 解析和身份透传逻辑

这保留了原来“公开 GET + 可选登录态”的能力。例如：
- 游客看帖子、看评论时可以匿名访问
- 登录用户看同样的公开内容时，网关仍然可以识别身份，并把 `X-User-Id` 传给下游，用于足迹、收藏等能力

### 为什么这里不直接按 bucket 判断

因为 `JwtAuthGlobalFilter` 真正关心的是“要不要强制登录”，也就是 `authRequired`。  
限流桶只是给后续限流器用的，鉴权层不需要理解每一类限流策略的细节。

---

## 5. RateLimitGlobalFilter 如何消费统一策略

### 文件位置

代码位置：[RateLimitGlobalFilter.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/java/com/paperflow/gateway/filter/RateLimitGlobalFilter.java)

### 重构后的关键变化

重构前，`RateLimitGlobalFilter` 自己判断：
- 哪些是认证接口
- 哪些是公开 GET

这就导致它和鉴权层的公开路径清单可能不一致。  
重构后，它直接读取统一策略的 bucket，再映射到限流配置。

### 当前关键逻辑

```java
EndpointAccessDecision decision = accessPolicy.decide(path, method);
String userId = (String) exchange.getAttributes().get(ATTR_USER_ID);
int limit;
if (decision.bucket() == EndpointAccessBucket.AUTH) {
  limit = props.getAuthPerMinute();
} else if (decision.bucket() == EndpointAccessBucket.PUBLIC_GET) {
  limit = props.getPublicGetPerMinute();
} else if (userId == null) {
  limit = props.getAnonymousPerMinute();
} else {
  limit = props.getUserPerMinute();
}
```

### 这样分层的好处

这一层的好处是把“接口类型”和“用户身份”这两个维度拆开处理：
- 先用统一策略判断接口类型
- 再在 `PROTECTED` 分支里按 `userId` 区分匿名用户与登录用户

所以现在限流逻辑会更清晰：
1. 认证公开接口走 `authPerMinute`
2. 公开 GET 走 `publicGetPerMinute`
3. 其他请求如果没有 `userId`，走 `anonymousPerMinute`
4. 其他请求如果已经有 `userId`，走 `userPerMinute`

这也修复了之前的一个具体问题：`/api/v1/public/users/**` 这类公开资料请求在鉴权层已经是公开接口，但限流层没有进入 `publicGetPerMinute` 桶。

---

## 6. 配置与运行关系

### 路由与阈值仍然来自配置文件

统一访问策略并没有取代 `application.yml`，它只是把访问分类从过滤器内部抽离出来。

配置文件位置：[application.yml](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/resources/application.yml)

当前限流参数依旧是：

```yaml
paperflow:
  rate-limit:
    anonymousPerMinute: ${PF_RL_ANON_PER_MIN:30}
    authPerMinute: ${PF_RL_AUTH_PER_MIN:120}
    publicGetPerMinute: ${PF_RL_PUBLIC_PER_MIN:180}
    userPerMinute: ${PF_RL_USER_PER_MIN:120}
```

所以本次重构的边界非常清楚：
- **改了什么**：路径分类逻辑的组织方式
- **没改什么**：路由声明方式、限流算法、限流阈值来源、JWT 校验方式

---

## 7. 测试策略与验证

### 7.1 策略矩阵测试

代码位置：[EndpointAccessPolicyTest.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/test/java/com/paperflow/gateway/filter/EndpointAccessPolicyTest.java)

这个测试直接验证“路径 -> 分类结果”的映射，覆盖了：
- 帖子与评论公开 GET
- 公开用户资料与公开头像
- 公开论文资源
- OAuth 回调
- 登录接口
- 受保护接口

相比以前只能从过滤器间接验证，这种测试更接近“访问策略清单”。

### 7.2 鉴权过滤器薄测试

代码位置：[JwtAuthGlobalFilterTest.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/test/java/com/paperflow/gateway/filter/JwtAuthGlobalFilterTest.java)

这里保留的是消费层测试，而不是再重复写一份路径清单测试。当前重点验证：
- 公开用户资料请求无 Bearer 时可以直接通过
- OAuth 回调无 Bearer 时可以直接通过

### 7.3 限流过滤器回归测试

代码位置：[RateLimitGlobalFilterTest.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/test/java/com/paperflow/gateway/filter/RateLimitGlobalFilterTest.java)

这里重点验证的是 bucket 到限流响应头的映射：
- 公开用户资料请求应返回 `X-RateLimit-Limit: 180`
- OAuth 回调请求应返回 `X-RateLimit-Limit: 120`

### 7.4 本次已执行的验证命令

```bash
mvn -pl backend/services/api-gateway "-Dtest=EndpointAccessPolicyTest,JwtAuthGlobalFilterTest,RateLimitGlobalFilterTest" test
mvn -pl backend/services/api-gateway test
mvn -pl backend/services/api-gateway spring-boot:run
```

本次本地验证结果为通过。

### 7.5 运行态 smoke test 结果

本次还做了一轮带新网关的运行态验证，结果如下：

- `GET /actuator/health` 返回 `200 {"status":"UP"}`，说明网关可正常启动
- `GET /api/v1/notifications` 在无 Bearer Token 时返回 `401 AUTH_MISSING_TOKEN`，说明受保护接口仍会被鉴权层拦截
- `GET /api/v1/public/users/u_demo` 虽然返回 `500`，但响应头带有 `X-RateLimit-Limit: 180`，说明公开用户资料路径已经按 `PUBLIC_GET` 分类
- `GET /api/v1/oauth/qq/callback` 虽然返回 `500`，但响应头带有 `X-RateLimit-Limit: 120`，说明 OAuth 回调已经按 `AUTH` 分类

这里的两个 `500` 不是访问策略重构本身导致的，而是因为本地没有同时启动 `user-service`，网关转发到 `localhost:8081` 时出现了 `Connection refused`。这组 smoke test 主要验证的是：
- 新网关能起来
- 受保护接口仍会被正确拦截
- 公开路径和 OAuth 回调已经落入新的预期限流桶

### 7.6 网关 + user-service 联通验证

随后又补做了一轮更完整的联通验证：同时启动 `user-service` 与 `api-gateway`，让公开资料接口和 OAuth 回调真正落到下游服务。

运行结果如下：

- `GET /api/v1/public/users/u_demo`
  - 通过网关返回 `404 RES_NOT_FOUND`
  - 同时带有 `X-RateLimit-Limit: 180`
  - 说明这条公开资料链路已经不是“网关连接下游失败”，而是进入了用户服务的真实业务响应

- `GET /api/v1/oauth/qq/callback`
  - 通过网关返回 `400 Bad Request`
  - 同时带有 `X-RateLimit-Limit: 120`
  - `user-service` 日志显示原因是缺少必须的 `code` 请求参数，这也说明请求已经正确转发并进入了 OAuth 回调控制器

这轮联通验证把本次重构的结论进一步坐实了：
- 统一访问策略不只是在单元测试里成立
- 它在真实网关转发链路里也能先完成正确分类，再把请求交给下游服务处理

---

## 8. 收益与后续建议

### 当前收益

1. **减少规则漂移**
   - 访问分类现在有了单一入口，新增公开接口时不容易再漏改某一个过滤器

2. **提升可测试性**
   - 以前要从过滤器行为侧面判断
   - 现在可以直接对策略决策做矩阵测试

3. **降低维护成本**
   - `JwtAuthGlobalFilter` 与 `RateLimitGlobalFilter` 都更聚焦自身职责
   - 一个负责“怎么鉴权”，一个负责“怎么限流”，而不是同时维护路径表

### 下一步建议

- 如果后续公开接口继续增多，可以考虑把 `EndpointAccessPolicy` 再抽成更显式的规则表
- 可以补一份“新增公开接口 checklist”，要求新增路径时同步补策略矩阵测试
- 可以把 `02-jwt-auth.md` 与 `03-rate-limit.md` 中的旧实现说明逐步更新到统一访问策略的新口径，避免文档落后于代码
