构建面向AI研究者的智能科研中枢，通过多Agent协作实现“智能发现 - PDF阅读 - 知识库RAG问答 - 可视化探索 - 个性化学习路径”的完整闭环，解决学术文献信息过载与知识管理碎片化问题。

## 本次交付范围（后端三层架构 + API 文档规范）

- React SPA（帖子/评论/管理/可视化，支持 Mock 与真实网关模式）
- Java Spring Boot：
  - 统一 API 网关（鉴权、限流、版本、错误归一化、路由）
  - 用户服务（注册/登录/刷新/个人资料）
  - 内容服务（每日自动帖子、评论、评论管理）
- 5-Agent 模块独立迭代：通过网关以“下游服务”方式接入（不实现其业务能力）

## 文档

- 端到端 API 流程：[api-flow.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/api-flow.md)
- API 设计规范：[api-design-spec.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/api-design-spec.md)
- 开发记录（可拆成博客）：[dev-notes.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/dev-notes.md)
- 按功能拆分（含代码原文与详细解读）：[00-index.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/00-index.md)
- 项目开发要求总览（新同学快速入门）：[20-project-dev-requirements-overview.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/20-project-dev-requirements-overview.md)
- 后端数据库设计说明：[21-backend-database-design.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/21-backend-database-design.md)
- 每日开发记录：
  - [2026-03-18.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/daily/2026-03-18.md)
  - [2026-03-17.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/daily/2026-03-17.md)
  - [2026-03-16.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/daily/2026-03-16.md)

## 工程结构

- 前端：`apps/paperflow-web`
- 后端：`backend/services/*`（网关、用户服务、内容服务），`backend/tools/*`（文档生成插件）

## 一键部署（dev/test/prod）

Windows：

```powershell
.\scripts\deploy.ps1 -Env dev
```

Linux/macOS：

```bash
./scripts/deploy.sh dev
```

如果本机没有 Maven，可先用自举脚本下载 Maven 再构建：

```powershell
.\scripts\bootstrap-maven.ps1 -Cmd verify
```

## 本地双击启动（Windows）

- 直接双击：`scripts/run-local.bat`
  - 默认行为：`up build`
  - 启动成功后自动打开 SPA 与网关验证地址

常用命令：

```powershell
.\scripts\run-local.bat
.\scripts\run-local.bat up quick
.\scripts\run-local.bat up build --no-open
.\scripts\run-local.bat up build -Force
.\scripts\run-local.bat down
.\scripts\run-local.bat status
```

参数说明：

- `up|down|status`：启动、停止、查看状态
- `build`：启动前执行后端打包
- `quick|nobuild`：跳过打包，快速拉起
- `--no-open`：启动后不自动打开浏览器
- `-Force`：当端口被占用时，按端口强制清理后启动

手动打包脚本（不启动服务）：

```powershell
.\scripts\build-local.bat
```

## 前端本地跑通（先 Mock，再接真实网关）

Mock 模式（推荐先跑通业务层与可视化）：

```powershell
.\scripts\run-spa-mock.ps1
```

- 前端：`http://localhost:9628/paperflow/`
- Mock API：`http://localhost:3151`

对接真实后端网关（需要你先把网关启动到 `http://localhost:3151`）：

```powershell
.\scripts\run-spa.ps1
```
