# 内容服务（content-service）模块索引

## 1. 模块定位

内容服务负责 PaperFlow 中“用户真正消费和互动的内容”。它承接了前面的登录态和网关转发，主要覆盖：
- 每日帖子保底生成
- 帖子列表、详情、点赞
- 收藏与阅读足迹
- 评论树、审核状态、通知触发
- 管理员侧的内容审核

从整体阅读顺序上看，它通常排在网关、用户服务之后，因为它既依赖用户身份，也依赖网关完成入口转发。

---

## 2. 子文档清单

| 编号 | 文档 | 核心内容 |
|------|------|----------|
| 01 | [每日帖子保底任务](./01-daily-post.md) | 启动补偿、定时触发、按天幂等生成帖子 |
| 02 | [帖子查询与互动 API](./02-posts-api.md) | 帖子列表、详情、点赞与查询参数 |
| 03 | [收藏与足迹 API](./03-favorites-footprints.md) | 收藏、取消收藏、浏览足迹的存取逻辑 |
| 04 | [评论 API](./04-comments-api.md) | 树形评论、层级限制、状态审核、回复关系 |
| 05 | [后台内容审核](./05-admin-moderation.md) | 管理员审核帖子与评论的后台入口 |

---

## 3. 阅读顺序建议

推荐按下面顺序阅读：

1. 先看 [01-daily-post.md](./01-daily-post.md)
   - 先理解内容是怎么被保底生成出来的，后面读帖子 API 才知道数据从哪里来

2. 再看 [02-posts-api.md](./02-posts-api.md)
   - 这篇是内容服务最核心的对外接口层

3. 接着看 [03-favorites-footprints.md](./03-favorites-footprints.md)
   - 这一层开始和用户身份建立更强关系

4. 再看 [04-comments-api.md](./04-comments-api.md)
   - 评论依赖帖子主流程，放在帖子之后读更顺

5. 最后看 [05-admin-moderation.md](./05-admin-moderation.md)
   - 这篇更偏后台治理，适合在前面业务链路读完后再进入

---

## 4. 交叉引用

### 前置阅读
- [网关索引](../gateway/00-index.md)
  - 推荐先读 [路由配置与重写](../gateway/05-routing-rewrite.md)
- [用户服务索引](../user-service/00-index.md)
  - 推荐先读 [注册与登录](../user-service/01-auth-register-login.md)

### 强关联模块
- [前端索引](../frontend/00-index.md)
  - 推荐连着看 [帖子查询与互动 API](./02-posts-api.md)、[收藏与足迹 API](./03-favorites-footprints.md) 和 [阅读体验](../frontend/02-reading-experience.md)
- [Python Agent 索引](../python-agent/00-index.md)
  - 如果你关心 AI 路径或 Agent 侧如何回写后端，可以继续看 Python Agent 模块
- [部署索引](../deploy/00-index.md)
  - 如果你想知道定时任务、数据库和生产配置如何落地，可以继续看部署模块

### 下一步推荐
- 想继续看“前端如何消费这些接口”：去看 [前端索引](../frontend/00-index.md)
- 想继续看“AI 能力如何与内容域结合”：去看 [Python Agent 索引](../python-agent/00-index.md)
