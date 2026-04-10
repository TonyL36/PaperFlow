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

- 07 每日帖子自动生成（Scheduler 保底任务）： [07-content-daily-post.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/by-feature/07-content-daily-post.md)
- 08 帖子查询与互动（列表/详情/点赞）： [08-content-posts-api.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/by-feature/08-content-posts-api.md)
- 09 评论与互动（两级评论/点赞/用户卡片）： [09-content-comments-api.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/by-feature/09-content-comments-api.md)
- 10 管理审核（评论状态 + 文章审核开关）： [10-content-admin-moderation.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/by-feature/10-content-admin-moderation.md)
- 14 演示接收接口（Agent 推送 → 落库）： [14-content-agent-ingest.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/14-content-agent-ingest.md)
- 15 演示 Seed + 每日内容升级： [15-content-demo-seed-posts.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/15-content-demo-seed-posts.md)
- 18 收藏与足迹： [18-content-favorites-footprints.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/18-content-favorites-footprints.md)
- 27 按文章控制评论审核策略： [27-content-post-comment-policy.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/by-feature/27-content-post-comment-policy.md)
- 29 统一 AI 对话接口（/api/v1/ai/chat）： [29-content-ai-chat-unified-endpoint.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/by-feature/29-content-ai-chat-unified-endpoint.md)

## 4. 文档生成与部署

- 11 Controller 扫描生成文档插件： [11-apidoc-plugin.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/by-feature/11-apidoc-plugin.md)
- 12 一键部署（dev/test/prod）： [12-deploy.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/12-deploy.md)
- 19 本地启动与可配置项脚本： [19-local-dev-scripts.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/19-local-dev-scripts.md)
- 20 项目开发要求总览： [20-project-dev-requirements-overview.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/20-project-dev-requirements-overview.md)
- 21 后端数据库设计说明： [21-backend-database-design.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/21-backend-database-design.md)
- 23 后端 Pathfinder 模型密钥配置： [23-backend-pathfinder-model-key.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/23-backend-pathfinder-model-key.md)
- 24 数据库总览与更新操作（H2/PostgreSQL、Flyway/备份/发布）： [24-database-overview-and-ops.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/24-database-overview-and-ops.md)
- 30 云端部署红线与经验（ECS）： [30-cloud-deploy-guardrails.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/by-feature/30-cloud-deploy-guardrails.md)
- 31 Agent 批量论文导入与质量控制： [31-agent-batch-ingest-and-quality.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/by-feature/31-agent-batch-ingest-and-quality.md)
- 32 医疗论文去重上传使用说明（可重复执行）： [32-medical-ingest-usage-runbook.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/by-feature/32-medical-ingest-usage-runbook.md)
- 33 医疗论文去重上传技术文档： [33-medical-ingest-technical-design.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/by-feature/33-medical-ingest-technical-design.md)
- 34 多领域论文每日定时导入使用说明（已停用）： [34-openalex-daily-usage-runbook.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/by-feature/34-openalex-daily-usage-runbook.md)
- 35 多领域论文每日定时导入技术文档（已停用）： [35-openalex-daily-technical-design.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/by-feature/35-openalex-daily-technical-design.md)
- 36 医疗论文每日定时更新使用说明（昨晚脚本链路）： [36-medical-daily-usage-runbook.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/by-feature/36-medical-daily-usage-runbook.md)
- 37 医疗论文每日定时更新技术文档： [37-medical-daily-technical-design.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/by-feature/37-medical-daily-technical-design.md)
- 38 网络安全/大数据每日更新使用说明： [38-topic-daily-cyber-bigdata-runbook.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/by-feature/38-topic-daily-cyber-bigdata-runbook.md)
- 39 网络安全/大数据每日更新技术文档： [39-topic-daily-cyber-bigdata-technical-design.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/by-feature/39-topic-daily-cyber-bigdata-technical-design.md)
- 40 scheduler 模板帖治理技术文档： [40-daily-post-governance-technical-design.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/by-feature/40-daily-post-governance-technical-design.md)
- 41 论坛点赞与子评论技术文档： [41-forum-likes-threaded-comments-technical-design.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/by-feature/41-forum-likes-threaded-comments-technical-design.md)
- 番外：阿里云 ECS 无构建部署手册： [2026-03-27-ecs-deploy-no-build-runbook.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/daily/%E7%95%AA%E5%A4%96/2026-03-27-ecs-deploy-no-build-runbook.md)

## 7. 最新日报

- 周报索引（近三周）： [weekly/00-index.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/daily/weekly/00-index.md)
- 2026-04-01：Markdown 渲染修复、中文编码修复、重写回灌与 502 排障： [2026-04-01.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/daily/2026-04-01.md)
- 2026-04-04：scheduler 模板帖治理、topic 板块扩展与云端定时配置： [2026-04-04.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/daily/2026-04-04.md)

## 5. 前端（paperflow-web）

- 13 前端 SPA（Notion 风格 + /paperflow 子路径 + 双模式）： [13-frontend-spa.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/13-frontend-spa.md)
- 16 阅读体验升级（Feed/Detail/块级正文/错误兜底）： [16-frontend-reading-experience.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/16-frontend-reading-experience.md)
- 22 AI 阅读 + Pathfinder（论文阅读 + 学习路径对话）： [22-frontend-ai-reading-pathfinder.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/22-frontend-ai-reading-pathfinder.md)
- 28 论文 Agent 传输与高亮协议： [28-paper-agent-protocol-and-highlights.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/by-feature/28-paper-agent-protocol-and-highlights.md)

## 6. 项目定义与需求

- 20 项目需求、任务与方法定义： [20-project-requirements-and-methods.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/20-project-requirements-and-methods.md)
- 21 PaperFlow 知识库数据库： [21-paperflow-knowledge-database.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/21-paperflow-knowledge-database.md)
- 26 复盘：Gitee 不及时提交的后果与改进： [2026-03-25-gitee-untimely-commit-retrospective.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/2026-03-25-gitee-untimely-commit-retrospective.md)
