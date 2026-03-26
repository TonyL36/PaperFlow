# 27 内容服务：按文章控制评论审核策略

## 功能目标

- 将“评论是否需要审核”从评论处理页拆分为独立策略管理能力
- 支持管理员按文章切换：
  - `true`：新评论进入 `PENDING`
  - `false`：新评论直接 `APPROVED`

## 后端改动

- `pf_post` 新增字段：`comment_moderation_enabled boolean not null default true`
  - 迁移：[V6__post_comment_moderation.sql](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/resources/db/migration/V6__post_comment_moderation.sql)
- 帖子实体增加字段：
  - [PostEntity.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/domain/PostEntity.java)
- 管理接口新增：
  - `PATCH /api/v1/admin/posts/{postId}/comment-moderation`
  - 控制器：[AdminController.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/api/AdminController.java)
- 评论创建逻辑改为按文章策略决策状态：
  - [CommentsController.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/api/CommentsController.java)

## 网关路由

- 放行内容服务管理路由：
  - `/api/v1/admin/posts/**`
  - [application.yml](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/resources/application.yml)

## 前端改动

- 新增独立页面：`/admin/posts/moderation`
  - 页面文件：[AdminPostModerationPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/AdminPostModerationPage.tsx)
  - 路由接入：[App.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/App.tsx)
  - 导航入口：[TopNav.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/layout/TopNav.tsx)
- 评论管理页只保留评论处理动作（通过/驳回），不再承担文章策略配置：
  - [AdminCommentsPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/AdminCommentsPage.tsx)
- 后续增强（当日已完成）：
  - 文章策略页支持 `关键词 + 来源 + 发布时间区间` 过滤
  - 文章策略页支持分页翻页（上一页/下一页）
  - 评论审核页支持当前页待审核批量通过/批量驳回

## 验证清单

- 管理员可在 `/admin/posts/moderation` 切换文章策略
- 关闭审核后，新评论 `status=APPROVED`
- 开启审核后，新评论 `status=PENDING`
- `/admin/comments` 仍可正常执行通过/驳回
