# PaperFlow 开发记录（可直接拆成博客）

本文把“做了什么/为什么这么做/代码在哪里”按模块整理，便于后续拆分成个人博客。

## 1. 三层架构落地

- 表现层：React SPA（已实现帖子/评论/管理/可视化，Notion 风格基础 UI）
- 业务层：统一 API 网关 + 用户服务 + 内容服务（每日帖子/评论/管理）
- 数据层：PostgreSQL（用户、refresh token、帖子、评论）

对应文档：

- [api-flow.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/api-flow.md)
- [api-design-spec.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/api-design-spec.md)

## 1.1 工程结构与端口约定（本次补充）

工程结构（单仓库，但边界清晰）：

- 前端：`apps/paperflow-web`
- 后端：`backend/services/*`（网关、用户服务、内容服务）
- 后端工具：`backend/tools/*`（API 文档生成插件）

端口约定（你指定的口径）：

- 前端开发服务器：`9628`，并且部署在子路径 `/paperflow`
- 后端网关：`3151`，前端通过代理转发 `/api/*` 到网关

这套约定的核心好处是：前端永远用一个入口（`/paperflow`）访问，并且永远只打网关（`/api/*`），不会直接打下游服务。

关键配置位置：

- Vite：[`vite.config.ts`](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/vite.config.ts)
- Router basename：[`main.tsx`](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/main.tsx#L8-L16)

## 2. 统一 API 网关（Spring Cloud Gateway）

目标：

- 单一入口：SPA 只访问网关
- 治理能力：requestId、鉴权、限流、错误归一化
- 转发路由：/api/v1/auth、/api/v1/users → user-service；/api/v1/posts、/api/v1/comments、/api/v1/admin → content-service

代码入口：

- 启动类：[GatewayApplication](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/java/com/paperflow/gateway/GatewayApplication.java)
- 路由配置：[application.yml](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/resources/application.yml)

关键实现点：

- requestId 注入与回传：[RequestIdGlobalFilter](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/java/com/paperflow/gateway/filter/RequestIdGlobalFilter.java)
- JWT 鉴权与用户身份透传（X-User-Id/X-User-Roles）：[JwtAuthGlobalFilter](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/java/com/paperflow/gateway/filter/JwtAuthGlobalFilter.java)
- 固定窗口限流（匿名/IP vs 登录/user）：[RateLimitGlobalFilter](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/java/com/paperflow/gateway/filter/RateLimitGlobalFilter.java) + [InMemoryFixedWindowRateLimiter](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/java/com/paperflow/gateway/ratelimit/InMemoryFixedWindowRateLimiter.java)
- JSON 错误 Envelope 写出：[JsonResponseWriter](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/java/com/paperflow/gateway/http/JsonResponseWriter.java)
- 兜底异常处理：[GlobalErrorHandler](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/java/com/paperflow/gateway/error/GlobalErrorHandler.java)

### 2.1 本次补充：几个“真实跑通”时才暴露的问题与修复

#### 2.1.1 Spring Boot `jar` 需要可运行（repackage）

现象：`java -jar .../target/*.jar` 报 “没有主清单属性”，说明打出来的是普通 jar，不是可运行的 Boot jar。

修复：在三服务模块的 `spring-boot-maven-plugin` 中显式加 `repackage` goal，打包后 jar 会变成可运行形式：

- [`api-gateway/pom.xml`](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/pom.xml)
- [`user-service/pom.xml`](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/pom.xml)
- [`content-service/pom.xml`](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/pom.xml)

关键片段（以某服务为例）：

```xml
<plugin>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-maven-plugin</artifactId>
  <executions>
    <execution>
      <goals>
        <goal>repackage</goal>
      </goals>
    </execution>
  </executions>
</plugin>
```

#### 2.1.2 配置前缀必须是 kebab-case（rate-limit）

现象：网关启动时报 `Configuration property name 'paperflow.rateLimit' is not valid`。

原因：Spring Boot 3 对 canonical name 更严格，配置前缀必须是 `paperflow.rate-limit` 这种形式。

修复：

- `@ConfigurationProperties(prefix=...)`：[`RateLimitProperties`](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/java/com/paperflow/gateway/config/RateLimitProperties.java)
- `application.yml`：[`api-gateway application.yml`](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/resources/application.yml#L35-L41)

#### 2.1.3 `/api/v1/posts`（无 trailing slash）路由不匹配

现象：前端请求 `/api/v1/posts?page[number]=...` 走网关时偶发 SYS_INTERNAL_ERROR。

原因：Gateway 路由写的是 `Path=/api/v1/posts/**`，它匹配 `/api/v1/posts/xxx`，但不一定匹配“刚好等于 `/api/v1/posts`”。

修复：同时匹配 `/api/v1/posts` 与 `/api/v1/posts/**`（comments 同理）：

- [`api-gateway application.yml`](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/resources/application.yml#L20-L27)

## 3. 用户服务（注册/登录/刷新/个人资料）

目标：

- 用户生命周期：注册、登录、刷新、注销
- 安全策略：BCrypt 存密码哈希；refresh token 只存 hash；JWT 作为 access token
- 与网关协作：用户服务不做强鉴权（信任网关注入的 X-User-Id），避免双重校验导致漂移

代码入口：

- 启动类：[UserServiceApplication](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/src/main/java/com/paperflow/user/UserServiceApplication.java)
- 配置：[application.yml](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/src/main/resources/application.yml)
- 数据库初始化（Flyway）：[V1__init.sql](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/src/main/resources/db/migration/V1__init.sql)

核心链路：

- Token 签发（JWT）：[TokenService](file:///f:/Gitee/PaperFlow/PaperFlow/services/user-service/src/main/java/com/paperflow/user/service/TokenService.java)
- 注册/登录/刷新/注销：[AuthService](file:///f:/Gitee/PaperFlow/PaperFlow/services/user-service/src/main/java/com/paperflow/user/service/AuthService.java)
- API 控制器：  
  - [AuthController](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/src/main/java/com/paperflow/user/api/AuthController.java)  
  - [UsersController](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/src/main/java/com/paperflow/user/api/UsersController.java)
- 错误与参数校验归一化：[ApiExceptionHandler](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/src/main/java/com/paperflow/user/api/ApiExceptionHandler.java)

## 4. 内容服务（每日帖子/评论/管理）

需求对应：

- 每日自动更新帖子：由内容服务内置 scheduler 生成（后续可替换为 Curator/Agent 推送）
- 用户系统评论：登录用户通过网关携带 JWT，网关注入 X-User-Id 后写评论
- 管理系统：管理员审批/驳回评论（最小化管理闭环）

代码入口：

- 启动类：[ContentServiceApplication](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/ContentServiceApplication.java)
- 定时任务：[DailyPostJob](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/job/DailyPostJob.java)
- API 控制器：  
  - 帖子列表/详情：[PostsController](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/api/PostsController.java)  
  - 评论列表/创建：[CommentsController](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/api/CommentsController.java)  
  - 审批管理：[AdminController](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/api/AdminController.java)
- 数据库初始化（Flyway）：[V1__init.sql](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/resources/db/migration/V1__init.sql)

### 4.1 本次补充：`page[number]` 这类参数在 Tomcat 下的坑

前端为了对齐 JSON:API 风格，会使用 `page[number]`、`page[size]` 这样的 query key。

但是 Spring Boot 默认 Tomcat 对 `[`、`]` 比较敏感，可能导致请求被直接拒绝，表现为网关/服务侧异常或前端“无限 loading”。

修复方式：在内容服务配置中放开 `relaxed-query-chars`：

- [`content-service application.yml`](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/resources/application.yml#L1-L8)

对应片段：

```yaml
server:
  tomcat:
    relaxed-query-chars: ['[', ']']
```

### 4.2 本次补充：启动即生成一条“今日帖子”

原先 `DailyPostJob` 只在每天 9:00 跑一次，因此你刚启动时帖子列表可能是空的。

为便于本地验证，我加了 `ApplicationReadyEvent` 触发一次 `ensureDailyPost()`，做到“服务启动就至少有一条数据”：

- [`DailyPostJob`](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/job/DailyPostJob.java#L20-L38)

## 5. API 文档生成插件（Controller 扫描 → 生成 → 上传）

目标：

- 文档与实现同源：从 Controller 注解生成 Markdown，避免手工漂移
- CI/CD 友好：构建时生成 `docs/generated/*.md`，可选上传到文档服务

实现位置：

- 核心扫描/渲染：[ControllerScanner](file:///f:/Gitee/PaperFlow/PaperFlow/backend/tools/apidoc/apidoc-generator-core/src/main/java/com/paperflow/apidoc/ControllerScanner.java)，[MarkdownRenderer](file:///f:/Gitee/PaperFlow/PaperFlow/backend/tools/apidoc/apidoc-generator-core/src/main/java/com/paperflow/apidoc/MarkdownRenderer.java)，[ApiDocGenerator](file:///f:/Gitee/PaperFlow/PaperFlow/backend/tools/apidoc/apidoc-generator-core/src/main/java/com/paperflow/apidoc/ApiDocGenerator.java)
- 上传（HTTP PUT）：[HttpPutUploader](file:///f:/Gitee/PaperFlow/PaperFlow/backend/tools/apidoc/apidoc-generator-core/src/main/java/com/paperflow/apidoc/HttpPutUploader.java)
- Maven 插件入口：[GenerateApiDocMojo](file:///f:/Gitee/PaperFlow/PaperFlow/backend/tools/apidoc/apidoc-maven-plugin/src/main/java/com/paperflow/apidoc/maven/GenerateApiDocMojo.java)
- Gradle 插件入口：[ApiDocPlugin](file:///f:/Gitee/PaperFlow/PaperFlow/backend/tools/apidoc/apidoc-gradle-plugin/src/main/java/com/paperflow/apidoc/gradle/ApiDocPlugin.java)

在服务模块中启用（verify 阶段输出到 docs/generated）：

- [user-service pom.xml](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/pom.xml)
- [content-service pom.xml](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/pom.xml)

## 6. 一键部署（dev/test/prod）

交付物：

- 三环境 compose：  
  - [compose.dev.yml](file:///f:/Gitee/PaperFlow/PaperFlow/docker/compose.dev.yml)  
  - [compose.test.yml](file:///f:/Gitee/PaperFlow/PaperFlow/docker/compose.test.yml)  
  - [compose.prod.yml](file:///f:/Gitee/PaperFlow/PaperFlow/docker/compose.prod.yml)
- 三环境 env：  
  - [dev.env](file:///f:/Gitee/PaperFlow/PaperFlow/docker/env/dev.env)  
  - [test.env](file:///f:/Gitee/PaperFlow/PaperFlow/docker/env/test.env)  
  - [prod.env](file:///f:/Gitee/PaperFlow/PaperFlow/docker/env/prod.env)
- 数据库初始化脚本：[01-init.sql](file:///f:/Gitee/PaperFlow/PaperFlow/docker/postgres/init/01-init.sql)
- Dockerfile：  
  - [Dockerfile.api-gateway](file:///f:/Gitee/PaperFlow/PaperFlow/docker/Dockerfile.api-gateway)  
  - [Dockerfile.user-service](file:///f:/Gitee/PaperFlow/PaperFlow/docker/Dockerfile.user-service)  
  - [Dockerfile.content-service](file:///f:/Gitee/PaperFlow/PaperFlow/docker/Dockerfile.content-service)
- 一键部署脚本：  
  - [deploy.ps1](file:///f:/Gitee/PaperFlow/PaperFlow/scripts/deploy.ps1) / [deploy.sh](file:///f:/Gitee/PaperFlow/PaperFlow/scripts/deploy.sh)

构建工具自举（本机没装 Maven 时）：

- [bootstrap-maven.ps1](file:///f:/Gitee/PaperFlow/PaperFlow/scripts/bootstrap-maven.ps1)
- [bootstrap-maven.sh](file:///f:/Gitee/PaperFlow/PaperFlow/scripts/bootstrap-maven.sh)

## 7. 前端 SPA（Notion 风格 + /paperflow 子路径部署）

本次前端的定位是：先跑通“业务层 API → 界面交互 → 可视化渲染”的闭环，后续再慢慢把 Curator/Editor 等能力接入。

入口与关键文件：

- 前端工程：[`apps/paperflow-web`](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web)
- 路由与页面容器：[`App.tsx`](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/App.tsx)
- API 客户端：[`api.ts`](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/data/api.ts)
- Notion 风格基础样式：[`global.css`](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/styles/global.css)

### 7.1 为什么必须做 /paperflow 子路径（basename + base）

你要求用户端入口是 `/paperflow`，这意味着：

- `index.html`/静态资源引用必须带 `/paperflow/` 前缀，否则刷新后会 404
- React Router 必须 `basename=/paperflow`，否则深链路（例如 `/paperflow/posts/xxx`）会找不到路由

这两点分别由：

- Vite `base: "/paperflow/"`：[`vite.config.ts`](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/vite.config.ts#L4-L18)
- Router basename 从 `import.meta.env.BASE_URL` 推导：[`main.tsx`](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/main.tsx#L8-L16)

### 7.2 为什么前端只打 `/api/*`

前端只调用 `/api/*`，由 Vite dev proxy 转到 `http://localhost:3151`（网关）。

好处：

- 生产环境同构：无论 dev/prod 前端代码都不需要知道下游服务地址
- 安全能力集中在网关：鉴权、限流、错误归一化的策略不会在前端散落

