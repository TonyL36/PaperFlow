# 模块功能拆解文档总索引

本目录（`docs/jy/modules/`）包含 PaperFlow 各模块的详细技术文档，每个功能都进行了单独拆解，适合稍有基础的开发者阅读与参考。

## 推荐入口

如果你是第一次阅读这些文档，建议先看：

- [01-navigation-guide.md](./01-navigation-guide.md)
  - 这是一份按主线、角色、问题组织的总览导航文档
- 然后再按模块进入各自的 `00-index.md`

## 目录结构

```
docs/jy/modules/
├── 00-index.md                  # 本文档，总索引
├── 01-navigation-guide.md       # 总览导航文档
├── gateway/                     # 网关模块
│   ├── 00-index.md
│   ├── 01-request-id.md
│   ├── 02-jwt-auth.md
│   ├── 03-rate-limit.md
│   ├── 04-error-envelope.md
│   └── 05-routing-rewrite.md
├── user-service/                # 用户服务模块
│   ├── 00-index.md
│   ├── 01-auth-register-login.md
│   ├── 02-refresh-logout.md
│   ├── 03-profile.md
│   ├── 04-oauth-bindings.md
│   └── 05-admin-user.md
├── content-service/             # 内容服务模块
│   ├── 00-index.md
│   ├── 01-daily-post.md
│   ├── 02-posts-api.md
│   ├── 03-favorites-footprints.md
│   ├── 04-comments-api.md
│   └── 05-admin-moderation.md
├── frontend/                    # 前端模块
│   ├── 00-index.md
│   ├── 01-spa-architecture.md
│   ├── 02-reading-experience.md
│   └── 03-ai-reading-pathfinder.md
├── python-agent/                # Python Agent 模块
│   ├── 00-index.md
│   ├── 01-five-agent-workflow.md
│   ├── 02-pdf-parsing-and-translation.md
│   └── 03-backend-integration.md
└── deploy/                      # 部署模块
    ├── 00-index.md
    ├── 01-local-dev.md
    ├── 02-cloud-ecs.md
    └── 03-database-ops.md
```

## 各模块文档说明

| 模块 | 文档风格 | 核心内容 |
|------|----------|----------|
| gateway/ | Spring Cloud Gateway 技术详解 | RequestId、JWT 鉴权、限流、错误归一、路由 |
| user-service/ | Spring Boot 用户服务 | 注册登录、个人资料、OAuth、后台管理 |
| content-service/ | Spring Boot 内容服务 | 每日帖子、帖子查询、收藏足迹、评论、审核 |
| frontend/ | React/TypeScript 前端 | SPA 架构、阅读体验、AI 阅读与 Pathfinder UI |
| python-agent/ | Python/FastAPI Agent | 五 Agent 工作流、PDF 解析与翻译、后端集成 |
| deploy/ | 部署与运维文档 | 本地开发、云部署、数据库操作 |

## 建议阅读路径

### 全局主线

1. [gateway/00-index.md](./gateway/00-index.md)
2. [user-service/00-index.md](./user-service/00-index.md)
3. [content-service/00-index.md](./content-service/00-index.md)
4. [frontend/00-index.md](./frontend/00-index.md)
5. [python-agent/00-index.md](./python-agent/00-index.md)
6. [deploy/00-index.md](./deploy/00-index.md)

### 快速跳转

- 想先看总览：去 [01-navigation-guide.md](./01-navigation-guide.md)
- 想看前后端主链路：从 [gateway/00-index.md](./gateway/00-index.md) 开始
- 想看 AI 相关能力：从 [python-agent/00-index.md](./python-agent/00-index.md) 开始
- 想看环境与上线：从 [deploy/00-index.md](./deploy/00-index.md) 开始

## 每篇功能文档的结构

每篇功能文档都包含以下章节：

| 章节 | 说明 |
|------|------|
| 1. 背景与目标 | 为什么要做这个功能、要解决什么问题 |
| 2. 架构与流程设计 | 整体流程、关键决策点 |
| 3. 核心代码详解 | 逐段代码解析、核心逻辑说明 |
| 4. 边界与约束 | 当前实现的边界、什么不做、什么要注意 |
| 5. 常见问题与踩坑经验 | 实际开发中遇到的问题与解决方案 |
| 6. 可演进方向 | 后续可以优化或扩展的方向 |

## 文档写作原则

1. **基于真实代码**：所有文档都基于仓库当前真实的代码实现，不是空想的设计文档
2. **适合有基础的开发者**：不会从头讲解语法，重点讲设计思路与实现细节
3. **可复现的决策**：关键代码都注明了文件路径与行号
4. **有总结**：每篇文档最后有小结，提炼核心要点

## 与其他文档的关系

- `docs/jy/by-feature/`：按功能点的原始文档，更偏向功能说明
- `docs/jy/modules/`（本文档目录）：更详细的技术拆解，适合深度理解与参考
- `docs/jy/csdn/`：适合对外发布的技术文章
