# 41 论坛点赞与子评论技术文档

## X需求

- 支持文章点赞与取消点赞，详情页实时展示点赞状态与点赞数
- 支持评论点赞与取消点赞，主评论与子评论均可操作
- 支持评论子评论（两层），满足“主评论 + 回复”论坛场景
- 保持现有评论审核策略兼容，不破坏收藏与既有帖子阅读链路

## 开发方法

### 1) 数据模型扩展

- 新增迁移： [V8__comment_parent_and_likes.sql](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/resources/db/migration/V8__comment_parent_and_likes.sql)
  - `pf_comment` 增加 `parent_comment_id`
  - 新增 `pf_post_like`（用户-帖子唯一）
  - 新增 `pf_comment_like`（用户-评论唯一）

### 2) 后端接口实现

- 文章点赞接口：
  - `POST /api/v1/posts/{postId}/like`
  - `DELETE /api/v1/posts/{postId}/like`
  - 实现位置： [PostsController.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/api/PostsController.java)
- 评论点赞接口：
  - `POST /api/v1/comments/{commentId}/like`
  - `DELETE /api/v1/comments/{commentId}/like`
  - 实现位置： [CommentsController.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/api/CommentsController.java)
- 评论两层结构：
  - 创建评论支持 `parentCommentId`
  - 查询按主评论聚合 `replies`
  - DTO： [CommentResponse.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/api/dto/CommentResponse.java)

### 3) 前端交互改造

- 详情页新增文章点赞按钮与计数
- 评论区支持点赞、回复、子评论渲染
- 主要实现： [PostDetailPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PostDetailPage.tsx)
- API/类型同步： [api.ts](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/data/api.ts)、[types.ts](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/data/types.ts)

## 测试方法

### 后端测试

- 新增集成测试覆盖点赞与子评论闭环：  
  [EngagementAndCommentsIT.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/test/java/com/paperflow/content/api/EngagementAndCommentsIT.java)
- 执行命令：
  - `.\.tools\apache-maven-3.9.9\bin\mvn.cmd -pl backend/services/content-service test`
  - `.\.tools\apache-maven-3.9.9\bin\mvn.cmd -pl backend/services/api-gateway test`

### 前端测试

- 新增评论交互工具单测：  
  [postDetailCommentUtils.test.ts](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/postDetailCommentUtils.test.ts)
- 执行命令：
  - `npm run test`
  - `npm run typecheck`

### 回归验证

- 验证收藏接口与收藏按钮行为未退化
- 验证评论审核开启时，主评论与子评论状态流转一致
- 验证未登录态点赞/回复仍被正确拦截提示

## 验收与回滚

### 验收标准

- 文章点赞与评论点赞均可“点一次生效、再点取消”
- 评论可展示两层结构，回复关系正确
- 刷新后点赞状态与计数回显一致
- 自动化测试全部通过

### 回滚方案

- 代码回滚：回退 `PostsController`、`CommentsController`、前端详情页改动
- 数据回滚：执行对应逆向 SQL 清理 `pf_post_like`/`pf_comment_like`，保留原帖子与评论主数据
- 风险控制：若仅前端异常，可先回滚前端并保留后端能力
