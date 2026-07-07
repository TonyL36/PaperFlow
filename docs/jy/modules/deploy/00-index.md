# Deploy 模块索引

## 1. 模块定位

### 与前序模块的关系
`deploy` 是前面所有模块的落地层。前面我们已经拆解了网关、用户服务、内容服务、前端和 Python Agent，但这些能力只有经过统一的本地启动、容器编排和云端发布，才能真正形成一个可运行的完整系统。

### 本模块关注什么
- 本地如何一键拉起整套 PaperFlow，方便联调和验收
- Docker Compose 如何组织 PostgreSQL、三个 Java 服务和前端容器
- ECS 场景下为什么强调“本地构建、云端只替换运行产物”
- 数据库初始化、知识库 schema 补齐、备份与更新的标准入口

---

## 2. 文档清单

### 2.1 本模块包含的子文档

1. `01-local-dev.md`
   - 聚焦本地开发与 Docker dev/test 编排
   - 说明 `scripts/dev.ps1` 和 `scripts/deploy.ps1` 的职责差异

2. `02-cloud-ecs.md`
   - 聚焦 ECS 无构建发布流程
   - 说明打包、上传、远端替换、Nginx 代理与上线验收

3. `03-database-ops.md`
   - 聚焦数据库初始化、知识库 schema、备份与风险控制
   - 说明 `userdb`、`contentdb`、`paperflowdb` 三套数据库的角色分工

---

## 3. 阅读顺序建议

如果你是第一次接触这个项目，建议按下面顺序阅读：

1. 先看 `01-local-dev.md`
   - 搞清楚本地怎么跑通，才能理解后面的发布流程为什么这样设计

2. 再看 `02-cloud-ecs.md`
   - 这篇对应“怎么把本地确认过的产物放到服务器”

3. 最后看 `03-database-ops.md`
   - 当你开始做迁移、备份、排障时，这篇会更有价值

---

## 4. 交叉引用

### 前置阅读
- [网关索引](../gateway/00-index.md)
- [用户服务索引](../user-service/00-index.md)
- [内容服务索引](../content-service/00-index.md)
- [前端索引](../frontend/00-index.md)
- [Python Agent 索引](../python-agent/00-index.md)

如果你还没看过这些模块，建议至少先对系统职责边界有一个整体认识，再回来读部署模块。

### 强关联阅读
- 想理解 `api-gateway`、`user-service`、`content-service` 在 Compose 中为什么这样连：先回看 [网关索引](../gateway/00-index.md)、[用户服务索引](../user-service/00-index.md)、[内容服务索引](../content-service/00-index.md)
- 想理解 `/paperflow/` 子路径和 `/api/` 代理为什么这样配置：先回看 [前端索引](../frontend/00-index.md)
- 想理解知识库、AI 路径规划和数据库初始化为什么要额外补一层：先回看 [Python Agent 索引](../python-agent/00-index.md)

### 下一步推荐
- 想从部署回到全局：去看 [模块总索引](../00-index.md)
- 想按目标查文档：去看 [总览导航文档](../01-navigation-guide.md)

---

## 5. 本模块的核心原则

### 5.1 本地优先
项目现有脚本明显体现了“先本地验证，再远端替换”的思路：本地可以用 `scripts/dev.ps1` 拉起 jar + Vite 联调，也可以用 `scripts/deploy.ps1` 跑 Compose 环境；到了 ECS，则使用 `scripts/deploy-ecs-no-build.ps1` 做“无构建发布”，避免把构建风险带到线上。

### 5.2 配置外置
Compose 文件本身尽量稳定，环境差异主要交给 `docker/env/*.env` 注入。这样做的好处是：
- `compose.dev.yml`、`compose.test.yml`、`compose.prod.yml` 可以保持同一套拓扑思路
- 各环境只改端口、密钥、邮件、Pathfinder AI 等环境变量

### 5.3 服务边界不混乱
部署层没有把所有逻辑塞进一个大容器，而是仍然保持：
- `user-service` 负责用户域
- `content-service` 负责内容与 Pathfinder 会话域
- `api-gateway` 负责统一入口
- `frontend` 负责静态资源和 `/api` 代理
- `postgres` 负责多库承载

这和前面模块文档中的职责拆分是一一对应的。

---

## 6. 小结

`deploy` 模块不是单纯的“怎么上线”，而是把前面所有模块串起来的运行规范。读完本模块后，你应该能回答三个问题：

1. 本地怎么稳定地把整套系统跑起来
2. ECS 为什么不能直接在线构建
3. 数据库初始化、备份和更新应该从哪些脚本与 SQL 入口进入
