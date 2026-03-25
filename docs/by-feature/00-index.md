# 按功能拆分文档索引

这组文档以“功能”为单位，包含：

- 功能目标与边界
- 端到端调用/数据流
- 关键代码原文（节选）+ 逐段解释
- 常见坑与可演进方向

## 1. API 网关（api-gateway）

- 01 RequestId： [01-gateway-request-id.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/01-gateway-request-id.md)
- 02 JWT 鉴权与身份透传： [02-gateway-jwt-auth.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/02-gateway-jwt-auth.md)
- 03 限流： [03-gateway-rate-limit.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/03-gateway-rate-limit.md)
- 04 错误归一化： [04-gateway-error-envelope.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/04-gateway-error-envelope.md)

## 2. 用户服务（user-service）

- 05 注册/登录/刷新/注销： [05-user-auth.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/05-user-auth.md)
- 06 获取/更新个人资料： [06-user-profile.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/06-user-profile.md)
- 17 资料、绑定与 OAuth（Email/Phone/QQ/WeChat）： [17-user-bindings-and-oauth.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/17-user-bindings-and-oauth.md)
- 25 用户管理与邮件模板设置（Admin）： [25-admin-user-and-mail-templates.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/25-admin-user-and-mail-templates.md)

## 3. 内容服务（content-service）

- 07 每日帖子自动生成： [07-content-daily-post.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/07-content-daily-post.md)
- 08 帖子查询（列表/详情）： [08-content-posts-api.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/08-content-posts-api.md)
- 09 评论（创建/展示）： [09-content-comments-api.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/09-content-comments-api.md)
- 10 评论管理（审核/驳回）： [10-content-admin-moderation.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/10-content-admin-moderation.md)
- 14 演示接收接口（Agent 推送 → 落库）： [14-content-agent-ingest.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/14-content-agent-ingest.md)
- 15 演示 Seed + 每日内容升级： [15-content-demo-seed-posts.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/15-content-demo-seed-posts.md)
- 18 收藏与足迹： [18-content-favorites-footprints.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/18-content-favorites-footprints.md)

## 4. 文档生成与部署

- 11 Controller 扫描生成文档插件： [11-apidoc-plugin.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/11-apidoc-plugin.md)
- 12 一键部署（dev/test/prod）： [12-deploy.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/12-deploy.md)
- 19 本地启动与可配置项脚本： [19-local-dev-scripts.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/19-local-dev-scripts.md)
- 20 项目开发要求总览： [20-project-dev-requirements-overview.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/20-project-dev-requirements-overview.md)
- 21 后端数据库设计说明： [21-backend-database-design.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/21-backend-database-design.md)
- 23 后端 Pathfinder 模型密钥配置： [23-backend-pathfinder-model-key.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/23-backend-pathfinder-model-key.md)
- 24 数据库总览与更新操作（H2/PostgreSQL、Flyway/备份/发布）： [24-database-overview-and-ops.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/24-database-overview-and-ops.md)

## 5. 前端（paperflow-web）

- 13 前端 SPA（Notion 风格 + /paperflow 子路径 + 双模式）： [13-frontend-spa.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/13-frontend-spa.md)
- 16 阅读体验升级（Feed/Detail/块级正文/错误兜底）： [16-frontend-reading-experience.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/16-frontend-reading-experience.md)
- 22 AI 阅读 + Pathfinder（论文阅读 + 学习路径对话）： [22-frontend-ai-reading-pathfinder.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/22-frontend-ai-reading-pathfinder.md)

## 6. 项目定义与需求

- 20 项目需求、任务与方法定义： [20-project-requirements-and-methods.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/20-project-requirements-and-methods.md)
- 21 PaperFlow 知识库数据库： [21-paperflow-knowledge-database.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/21-paperflow-knowledge-database.md)
