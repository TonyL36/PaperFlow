# 前端模块功能拆解文档索引

## 1. 模块定位

前端模块负责把前面几个后端模块的能力组织成一个可用的 SPA，主要覆盖：
- 路由与子路径部署
- 登录态管理与接口调用
- 帖子列表、详情页、评论与交互体验
- AI 阅读、Pathfinder 会话和学习路径可视化

如果你前面已经读过网关、用户服务和内容服务，这个模块会把那些接口和状态真正串成用户可见的页面。

---

## 2. 子文档清单

| 编号 | 文档 | 核心内容 |
|------|------|----------|
| 01 | [SPA 整体架构](./01-spa-architecture.md) | 项目结构、路由设计、双模式（Mock/真实网关） |
| 02 | [阅读体验](./02-reading-experience.md) | Feed 列表、详情页、Markdown 渲染、错误兜底 |
| 03 | [AI 阅读与 Pathfinder](./03-ai-reading-pathfinder.md) | AI 对话界面、学习路径 UI、高亮与引用 |

---

## 3. 阅读顺序建议

推荐按下面顺序阅读：

1. 先看 [01-spa-architecture.md](./01-spa-architecture.md)
   - 先理解路由、鉴权上下文和 API 封装，再看具体页面会更顺

2. 再看 [02-reading-experience.md](./02-reading-experience.md)
   - 这一篇对应最基础、最常见的用户阅读链路

3. 最后看 [03-ai-reading-pathfinder.md](./03-ai-reading-pathfinder.md)
   - 这篇是建立在基础阅读体验之上的 AI 增强能力

---

## 4. 交叉引用

### 前置阅读
- [网关索引](../gateway/00-index.md)
  - 推荐先读 [统一错误格式](../gateway/04-error-envelope.md) 和 [路由配置与重写](../gateway/05-routing-rewrite.md)
- [用户服务索引](../user-service/00-index.md)
  - 推荐先读 [注册与登录](../user-service/01-auth-register-login.md)
- [内容服务索引](../content-service/00-index.md)
  - 推荐先读 [帖子查询与互动 API](../content-service/02-posts-api.md) 和 [评论 API](../content-service/04-comments-api.md)

### 强关联模块
- [Python Agent 索引](../python-agent/00-index.md)
  - 推荐连着看 [AI 阅读与 Pathfinder](./03-ai-reading-pathfinder.md) 和 [PDF 解析与划词翻译](../python-agent/02-pdf-parsing-and-translation.md)
- [部署索引](../deploy/00-index.md)
  - 如果你关心 `/paperflow/` 子路径、Nginx 代理和生产发布，可以继续看部署模块

### 下一步推荐
- 想继续看“AI 页面背后的服务实现”：去看 [Python Agent 索引](../python-agent/00-index.md)
- 想继续看“这些页面最终如何部署”：去看 [部署索引](../deploy/00-index.md)
