# 09 内容服务：评论 API（创建 / 展示 / 点赞 / 用户卡片）

## 功能目标

- 登录用户可发表评论与回复评论
- 评论支持最多 5 层深度
- 支持评论点赞/取消点赞
- 支持评论用户卡片查询（昵称、发帖数、获赞数）
- 评论状态由文章开关决定：
  - `commentModerationEnabled=true` → 新评论 `PENDING`
  - `commentModerationEnabled=false` → 新评论 `APPROVED`
- 列表可见性规则：
  - 所有人都能看到 `APPROVED`
  - 登录用户可额外看到“自己”的 `PENDING/REJECTED`

## API 概览

- `GET /api/v1/comments?postId=...&page[number]=1&page[size]=20`
  - 公开可用
  - 返回树形结构 `items + replies`
  - 可见范围为“全部已发布 + 当前用户自己的待审核/驳回”
- `POST /api/v1/comments`
  - 需要登录
  - 支持 `parentCommentId`
  - 深度超过 5 层返回 `REQ_INVALID`
- `POST /api/v1/comments/{commentId}/like`（需要登录）
- `DELETE /api/v1/comments/{commentId}/like`（需要登录）
- `GET /api/v1/comments/users/{userId}/card`（公开）

## 当前实现要点

- 评论输入校验统一为：
  - 不能为空白
  - 最大长度 2000
  - 深度最多 5 层
- 评论列表按创建时间组树，根评论分页，回复按时间升序挂载。
- 评论 DTO 包含：
  - `status`
  - `parentCommentId`
  - `replies`
  - `likeCount` / `liked`
- “被回复通知”与评论联动：
  - 直接发布为 `APPROVED` 时触发通知
  - `PENDING` 评论在管理员审核为 `APPROVED` 后触发通知

## 关键代码

- 评论主流程：[CommentsController.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/api/CommentsController.java)
- 评论查询仓储：[CommentRepository.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/repo/CommentRepository.java)
- 审核通过触发通知：[AdminController.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/api/AdminController.java)

## 说明

- 早期“两级评论”限制已取消，当前为最多 5 层。
- 展示区不再是“仅 APPROVED”；已切换为“APPROVED + 我的待审核/驳回”。
