# 路由配置与重写功能详解

## 1. 背景与目标

### 与前序模块的关系

前四个模块都是请求处理中间环节，这个模块是请求的最后一环：
- [RequestId](./01-request-id.md) → [JWT 鉴权](./02-jwt-auth.md) → [限流](./03-rate-limit.md) → 路由转发

路由转发是请求的终点，然后响应回来后还会经过前面的过滤器（比如 RequestId 响应头也会加上）。

### 为什么要路由配置与重写

如果没有网关路由，常见问题：
1. 前端要记多个端口/域名，麻烦
2. 不好统一做入口治理（鉴权/限流/日志）
3. 外部无法灵活调整服务地址/路径
4. 跨域问题复杂

### 功能目标

1. **统一入口**：前端只访问网关一个地址（比如 localhost:8080）
2. **按路径路由**：根据路径前缀转发到不同的下游服务
3. **路径重写**：支持 RewritePath 调整路径后转发
4. **环境变量可配置**：下游地址通过环境变量注入，方便部署灵活
5. **默认过滤器**：统一加响应头标识是网关

---

## 2. 架构与流程设计

### 路由配置概览

```
浏览器 → 网关 (8080)
         ↓
    路径判断
         ↓
    ┌─────────────────────────────────────────────────┐
    │ Path 匹配                             │
    ├──────────────────────────────────────┤
    │ /api/v1/auth/** → 用户服务 (8081)    │
    │ /api/v1/users/** → 用户服务 (8081)  │
    │ /api/v1/oauth/** → 用户服务 (8081)│
    │ /api/v1/admin/users/** → 用户服务 (8081)│
    │ /api/v1/posts/** → 内容服务 (8082)  │
    │ /api/v1/papers/** → 内容服务 (8082)│
    │ /api/v1/comments/** → 内容服务 (8082)│
    │ /api/v1/ai/** → 内容服务 (8082)│
    │ /api/v1/agents/** → Agent 服务 (8090) │
    │   (带 RewritePath)                    │
    └──────────────────────────────────────┘
```

### 关键决策点

| 问题 | 决策 | 理由 |
|------|------|
| 路由按功能分块 | user-auth/user-users/user-oauth/user-admin/content-posts/... | 每个路由职责单一，方便阅读和维护 |
| URI 来源 | ${USER_SERVICE_URL:http://localhost:8081} | 环境变量可配置，默认值方便本地开发 |
| 默认过滤器 | AddResponseHeader=X-Api-Gateway, paperflow | 统一加标识，方便调试和监控 |
| 路径重写 | RewritePath=/api/v1/agents/(?<segment>.*), /$\{segment} | 外部路径和内部路径解耦 |

---

## 3. 核心代码详解

### 3.1 完整配置

**文件位置**：[application.yml](file:///F:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/resources/application.yml)

```yaml
server:
  port: 8080

spring:
  application:
    name: api-gateway
  cloud:
    gateway:
      default-filters:
        - AddResponseHeader=X-Api-Gateway, paperflow
      routes:
        - id: user-auth
          uri: ${USER_SERVICE_URL:http://localhost:8081}
          predicates:
            - Path=/api/v1/auth/**
        - id: user-users
          uri: ${USER_SERVICE_URL:http://localhost:8081}
          predicates:
            - Path=/api/v1/users/**,/api/v1/public/users/**
        - id: user-oauth
          uri: ${USER_SERVICE_URL:http://localhost:8081}
          predicates:
            - Path=/api/v1/oauth/**,/api/v1/users/me/bind/**
        - id: user-admin
          uri: ${USER_SERVICE_URL:http://localhost:8081}
          predicates:
            - Path=/api/v1/admin/users,/api/v1/admin/users/**,/api/v1/admin/settings/mail-templates/**,/api/v1/admin/settings/mail-templates
        - id: content-posts
          uri: ${CONTENT_SERVICE_URL:http://localhost:8082}
          predicates:
            - Path=/api/v1/posts,/api/v1/posts/**
        - id: content-papers
          uri: ${CONTENT_SERVICE_URL:http://localhost:8082}
          predicates:
            - Path=/api/v1/papers,/api/v1/papers/**
        - id: content-comments
          uri: ${CONTENT_SERVICE_URL:http://localhost:8082}
          predicates:
            - Path=/api/v1/comments,/api/v1/comments/**
        - id: content-public-papers
          uri: ${CONTENT_SERVICE_URL:http://localhost:8082}
          predicates:
            - Path=/api/v1/public/papers,/api/v1/public/papers/**
        - id: content-engagement
          uri: ${CONTENT_SERVICE_URL:http://localhost:8082}
          predicates:
            - Path=/api/v1/favorites,/api/v1/footprints,/api/v1/notifications,/api/v1/notifications/**,/api/v1/posts/*/favorite,/api/v1/posts/*/like,/api/v1/comments/*/like
        - id: content-pathfinder
          uri: ${CONTENT_SERVICE_URL:http://localhost:8082}
          predicates:
            - Path=/api/v1/pathfinder/sessions,/api/v1/pathfinder/sessions/**
        - id: content-ai
          uri: ${CONTENT_SERVICE_URL:http://localhost:8082}
          predicates:
            - Path=/api/v1/ai,/api/v1/ai/**
        - id: content-internal-agent
          uri: ${CONTENT_SERVICE_URL:http://localhost:8082}
          predicates:
            - Path=/api/v1/internal/agent,/api/v1/internal/agent/**
        - id: content-admin
          uri: ${CONTENT_SERVICE_URL:http://localhost:8082}
          predicates:
            - Path=/api/v1/admin/comments,/api/v1/admin/comments/**,/api/v1/admin/posts,/api/v1/admin/posts/**
        - id: agents-out-of-scope
          uri: ${AGENT_SERVICE_URL:http://localhost:8090}
          predicates:
            - Path=/api/v1/agents/**
          filters:
            - RewritePath=/api/v1/agents/(?<segment>.*), /$\{segment}
```

### 3.2 逐段解析

#### 3.2.1 默认过滤器

```yaml
default-filters:
  - AddResponseHeader=X-Api-Gateway, paperflow
```

| 配置 | 解释 |
|------|------|
| AddResponseHeader | 给所有响应都加一个头 `X-Api-Gateway: paperflow`，方便调试和监控，一眼看出响应经过了网关 |

#### 3.2.2 用户服务路由

```yaml
- id: user-auth
  uri: ${USER_SERVICE_URL:http://localhost:8081}
  predicates:
    - Path=/api/v1/auth/**
```

| 配置 | 解释 |
|------|------|
| id | 路由唯一标识，便于日志和监控 |
| uri | 下游地址，从环境变量 `USER_SERVICE_URL` 读，没有则用默认值 `http://localhost:8081` |
| Path=/api/v1/auth/** | Ant 路径匹配，`**` 表示后面任意内容都匹配 |

用户服务相关路由分了四块：
- user-auth：登录注册
- user-users：用户信息（公开和非公开
- user-oauth：OAuth 绑定
- user-admin：管理员管理用户和邮件模板

这样拆分职责单一，方便维护。

#### 3.2.3 内容服务路由

```yaml
- id: content-posts
  uri: ${CONTENT_SERVICE_URL:http://localhost:8082}
  predicates:
    - Path=/api/v1/posts,/api/v1/posts/**
```

内容服务也分了更多块：
- content-posts：帖子
- content-papers：论文
- content-comments：评论
- content-public-papers：公开论文
- content-engagement：收藏/足迹/通知/点赞
- content-pathfinder：AI 阅读 Pathfinder
- content-ai：AI 能力
- content-internal-agent：内部 Agent 接口
- content-admin：管理员管理帖子和评论

#### 3.2.4 Agent 服务路由（带路径重写）

```yaml
- id: agents-out-of-scope
  uri: ${AGENT_SERVICE_URL:http://localhost:8090}
  predicates:
    - Path=/api/v1/agents/**
  filters:
    - RewritePath=/api/v1/agents/(?<segment>.*), /$\{segment}
```

这个路由带了 RewritePath 过滤器，路径转换：
- 外部请求：`/api/v1/agents/upload`
- 重写后：`/upload`
- 转发到 Agent 服务：`http://localhost:8090/upload`

| 配置 | 解释 |
|------|------|
| RewritePath | 第一个参数是匹配模式，用正则捕获 `segment` 分组；第二个参数是替换模板，用 `$\{segment}` 引用 |

为什么要路径重写？
- 外部路径统一前缀 `/api/v1/agents/`，内部路径可以短一些
- 解耦外部 API 路径和内部实现
- 如果内部路径可以灵活调整，不影响外部调用者

---

## 4. 边界与约束

### 4.1 当前实现的边界

- 路由是静态配置在 YAML，不是动态路由
- 路径重写只有一个地方用（Agent 服务）
- 没有负载均衡（目前单实例）
- 没有熔断降级
- 路径匹配按顺序，先匹配先转发

---

## 5. 常见问题与踩坑经验

### 5.1 问题：为什么要分成多个路由 id，而不是一个大的？

**原因**：
1. 职责清晰，每个路由对应一个功能块，方便阅读
2. 未来要加单独的过滤器/限流策略时，可以只针对某个路由加
3. 日志和监控时，可以按路由 id 查看，排查问题

### 5.2 问题：${VAR:default} 语法是什么？

**原因**：Spring 配置文件语法：
- `${VAR}`：从环境变量读
- `${VAR:default}`：从环境变量读，没有则用默认值
- 本地开发时直接用默认值，部署时设环境变量改下游地址

### 5.3 问题：RewritePath 的 `$\{segment}` 为什么要这样写？

**原因**：
- YAML 里 `$` 本身有含义，要转义成 `$\{...}`
- 实际传给 Spring Cloud Gateway 的 RewritePath 过滤器时，会把 `$\{segment}` 替换成 `${segment}`

---

## 6. 可演进方向

### 6.1 动态路由

可以用 Nacos/Config Server 动态路由，不用重启改配置。

### 6.2 负载均衡

如果下游服务多实例，可以加上 lb:// 前缀。

### 6.3 熔断降级

加 Resilience4j 做熔断降级，保护下游服务。

### 6.4 限流更精细

可以按路由 id 单独设限流策略。

---

## 7. 小结

路由配置与重写是网关的最后一环，核心要点：

1. **统一入口**：前端只访问网关
2. **按功能分块路由**：职责清晰，方便阅读维护
3. **环境变量可配置**：部署灵活，本地开发用默认值
4. **RewritePath 路径重写**：外部路径和内部路径解耦
5. **默认过滤器统一加标识**：方便调试和监控

至此，网关五个模块全部完成：
1. [RequestId](./01-request-id.md)
2. [JWT 鉴权](./02-jwt-auth.md)
3. [限流](./03-rate-limit.md)
4. [统一错误格式](./04-error-envelope.md)
5. [路由配置与重写](./05-routing-rewrite.md)

接下来可以继续看 [用户服务](../user-service/00-index.md)。

---

## 9. 页内导航

- 所属模块：[网关模块索引](./00-index.md)
- 上一篇：[统一错误格式功能详解](./04-error-envelope.md)
- 下一篇：当前已是本模块最后一篇，建议回看 [模块索引](./00-index.md) 或继续阅读 [总览导航文档](../01-navigation-guide.md)
- 关联阅读：
  - [用户服务索引](../user-service/00-index.md)
  - [内容服务索引](../content-service/00-index.md)
  - [前端模块索引](../frontend/00-index.md)
