# PaperFlow 模块文档总览导航

## 1. 这份文档怎么用

`docs/jy/modules/` 下面的文档已经按模块拆开了，但当文档数量变多以后，只靠目录名很难快速定位“我现在应该先读哪篇”。这份导航文档就是为了解决这个问题。

你可以用它做三件事：

1. 按主线阅读
   - 适合第一次系统了解 PaperFlow

2. 按角色阅读
   - 适合前端、后端、AI、运维分别切入

3. 按问题检索
   - 适合遇到具体问题时快速跳到对应文档

---

## 2. 建议主线阅读顺序

如果你想从“系统整体是怎么跑起来的”这个角度阅读，推荐按下面顺序：

| 顺序 | 模块 | 为什么先看它 | 推荐入口 |
|------|------|--------------|----------|
| 1 | gateway | 先看统一入口、鉴权入口和路由入口 | [网关索引](./gateway/00-index.md) |
| 2 | user-service | 明确用户身份、Token 和绑定体系 | [用户服务索引](./user-service/00-index.md) |
| 3 | content-service | 理解帖子、评论、收藏、审核这些核心业务 | [内容服务索引](./content-service/00-index.md) |
| 4 | frontend | 看这些接口和状态最终如何组成 SPA 页面 | [前端索引](./frontend/00-index.md) |
| 5 | python-agent | 在前面主链路已理解后，再补 AI 阅读和 Agent 能力 | [Python Agent 索引](./python-agent/00-index.md) |
| 6 | deploy | 最后看本地运行、云端上线和数据库落地 | [Deploy 索引](./deploy/00-index.md) |

这条主线对应的是一个完整的全栈理解顺序：

请求怎么进来 -> 用户是谁 -> 内容怎么组织 -> 页面怎么呈现 -> AI 怎么增强 -> 系统怎么运行

---

## 3. 按角色阅读路线

## 3.1 如果你是前端开发者

优先顺序：

1. [前端索引](./frontend/00-index.md)
2. [网关索引](./gateway/00-index.md)
3. [用户服务索引](./user-service/00-index.md)
4. [内容服务索引](./content-service/00-index.md)
5. [Python Agent 索引](./python-agent/00-index.md)

重点文档：
- [SPA 整体架构](./frontend/01-spa-architecture.md)
- [阅读体验](./frontend/02-reading-experience.md)
- [AI 阅读与 Pathfinder](./frontend/03-ai-reading-pathfinder.md)
- [统一错误格式](./gateway/04-error-envelope.md)
- [注册与登录](./user-service/01-auth-register-login.md)

## 3.2 如果你是后端开发者

优先顺序：

1. [网关索引](./gateway/00-index.md)
2. [用户服务索引](./user-service/00-index.md)
3. [内容服务索引](./content-service/00-index.md)
4. [Deploy 索引](./deploy/00-index.md)
5. [前端索引](./frontend/00-index.md)

重点文档：
- [JWT 鉴权与身份透传](./gateway/02-jwt-auth.md)
- [刷新 Token 与注销](./user-service/02-refresh-logout.md)
- [帖子查询与互动 API](./content-service/02-posts-api.md)
- [评论 API](./content-service/04-comments-api.md)
- [本地开发与 Docker 编排](./deploy/01-local-dev.md)

## 3.3 如果你是做 AI / Agent 的开发者

优先顺序：

1. [Python Agent 索引](./python-agent/00-index.md)
2. [前端索引](./frontend/00-index.md)
3. [内容服务索引](./content-service/00-index.md)
4. [Deploy 索引](./deploy/00-index.md)

重点文档：
- [PDF 解析与划词翻译](./python-agent/02-pdf-parsing-and-translation.md)
- [FiveAgentWorkflow 核心工作流](./python-agent/01-five-agent-workflow.md)
- [与后端的集成方式](./python-agent/03-backend-integration.md)
- [AI 阅读与 Pathfinder](./frontend/03-ai-reading-pathfinder.md)

## 3.4 如果你是做运维 / 发布的开发者

优先顺序：

1. [Deploy 索引](./deploy/00-index.md)
2. [前端索引](./frontend/00-index.md)
3. [网关索引](./gateway/00-index.md)
4. [内容服务索引](./content-service/00-index.md)
5. [Python Agent 索引](./python-agent/00-index.md)

重点文档：
- [本地开发与 Docker 编排](./deploy/01-local-dev.md)
- [云端 ECS 发布与运行约束](./deploy/02-cloud-ecs.md)
- [数据库初始化与运维操作](./deploy/03-database-ops.md)
- [SPA 整体架构](./frontend/01-spa-architecture.md)
- [路由配置与重写](./gateway/05-routing-rewrite.md)

---

## 4. 按问题快速定位

| 你现在遇到的问题 | 建议先看 |
|------------------|----------|
| 登录成功后接口还是 401/403 | [JWT 鉴权与身份透传](./gateway/02-jwt-auth.md)、[注册与登录](./user-service/01-auth-register-login.md) |
| 前端拿到的错误格式看不懂 | [统一错误格式](./gateway/04-error-envelope.md) |
| 帖子列表、详情页、点赞链路要从后端查起 | [帖子查询与互动 API](./content-service/02-posts-api.md) |
| 收藏、足迹为什么和用户绑定在一起 | [收藏与足迹 API](./content-service/03-favorites-footprints.md) |
| 评论为什么有层级限制和审核状态 | [评论 API](./content-service/04-comments-api.md) |
| Pathfinder 页面怎么和后端会话关联 | [AI 阅读与 Pathfinder](./frontend/03-ai-reading-pathfinder.md)、[与后端的集成方式](./python-agent/03-backend-integration.md) |
| PDF 上传后为什么能划词翻译 | [PDF 解析与划词翻译](./python-agent/02-pdf-parsing-and-translation.md) |
| 五 Agent 工作流到底怎么路由 | [FiveAgentWorkflow 核心工作流](./python-agent/01-five-agent-workflow.md) |
| 本地怎么稳定拉起全套服务 | [本地开发与 Docker 编排](./deploy/01-local-dev.md) |
| ECS 为什么不能直接在线构建 | [云端 ECS 发布与运行约束](./deploy/02-cloud-ecs.md) |
| `userdb`、`contentdb`、`paperflowdb` 的区别是什么 | [数据库初始化与运维操作](./deploy/03-database-ops.md) |

---

## 5. 模块依赖地图

可以把当前文档主线粗略理解成下面这张关系图：

1. [gateway](./gateway/00-index.md)
   - 统一入口，连接前端与后端服务

2. [user-service](./user-service/00-index.md)
   - 提供身份、登录态、绑定和管理员用户管理

3. [content-service](./content-service/00-index.md)
   - 承接帖子、评论、收藏、足迹和审核等核心业务

4. [frontend](./frontend/00-index.md)
   - 组合网关、用户服务、内容服务，形成 SPA 页面

5. [python-agent](./python-agent/00-index.md)
   - 在阅读链路之上补 AI 解析、翻译、问答和学习路径能力

6. [deploy](./deploy/00-index.md)
   - 负责把前面所有模块的代码、配置、数据库和运行方式真正落地

如果换成一句更短的话：

网关管入口，用户服务管身份，内容服务管业务，前端管交互，Python Agent 管智能增强，部署模块管运行落地。

---

## 6. 推荐的跳读策略

如果你不想从头到尾完整阅读，可以按下面方式跳读：

### 只想先搭环境
- [Deploy 索引](./deploy/00-index.md)
- [本地开发与 Docker 编排](./deploy/01-local-dev.md)
- [数据库初始化与运维操作](./deploy/03-database-ops.md)

### 只想先改登录链路
- [网关索引](./gateway/00-index.md)
- [用户服务索引](./user-service/00-index.md)
- [SPA 整体架构](./frontend/01-spa-architecture.md)

### 只想先改帖子和评论
- [内容服务索引](./content-service/00-index.md)
- [阅读体验](./frontend/02-reading-experience.md)

### 只想先改 AI 阅读和 Pathfinder
- [AI 阅读与 Pathfinder](./frontend/03-ai-reading-pathfinder.md)
- [Python Agent 索引](./python-agent/00-index.md)
- [数据库初始化与运维操作](./deploy/03-database-ops.md)

---

## 7. 小结

这份导航文档的作用，不是替代各模块索引，而是把它们再组织成两层入口：

1. 一层按系统主线读
2. 一层按角色和问题跳着读

如果你准备继续深挖某个模块，下一步建议直接进入对应模块的 `00-index.md`，再按它里面的阅读顺序往下走。
