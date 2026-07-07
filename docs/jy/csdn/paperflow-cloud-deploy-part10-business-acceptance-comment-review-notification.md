# 从评论审核到消息中心：我们怎么用一条真实业务闭环做上线验收

> 摘要：系统上线之后，如果只看服务健康和页面能否打开，往往还不能说明真实业务已经跑通。对 PaperFlow 来说，评论区相关功能就很适合做上线后的业务闭环验收：普通用户提交评论，管理员审核状态变化，系统按条件生成通知，最终用户在消息中心看到结果并跳转回上下文页面。本文结合真实前端页面、后端接口和通知服务实现，整理我们是怎么把这条链当成一条最小业务验收链路来检查的。文中只保留业务链和接口关系，不涉及任何账号、凭证或可直接利用的部署信息。
>
> 标签：上线验收｜评论审核｜通知系统｜React｜Spring Boot｜大学生团队项目

很多大学生团队把项目部署完之后，最容易停留在一个状态：

- 首页能打开；
- 接口 health 正常；
- 帖子列表能返回数据；
- 于是就认为“系统已经上线成功”。

这种判断不能说错，但如果系统里已经存在互动能力、审核能力和通知能力，那么只看这些还不够。

对我们这个 PaperFlow 学生项目来说，评论相关功能就是一个很适合拿来做验收的业务样本。  
因为它不是单一页面功能，而是一条真正跨越多层的链路：

```text
普通用户发表评论
  -> 评论进入待审核状态或直接发布
  -> 管理员在评论管理页处理状态
  -> 后端根据状态变化决定是否生成通知
  -> 被回复用户在消息中心看到结果
  -> 用户再跳回帖子详情页查看上下文
```

只要这条链路能通，往往说明上线之后不仅“服务活着”，而且“业务在工作”。

## 1. 这条链路为什么适合作为上线验收样本

因为它同时覆盖了前端、网关、后端和业务状态变化。

这条链里至少会经过这些环节：

- 前端登录态是否正常；
- 评论接口是否能正常创建数据；
- 管理端路由和管理员权限是否生效；
- 审核状态是否能成功写回数据库；
- 通知服务是否会在正确时机生成消息；
- 用户自己的通知列表是否能正常读取；
- 页面跳转是否还能回到具体评论上下文。

对大学生团队来说，这种验收方式有一个很现实的好处：

> 不需要设计特别复杂的压测或监控体系，也能验证系统是不是已经具备真实业务闭环。

## 2. 评论审核这一层，前端其实已经准备好了完整的管理入口

前端路由里，管理员相关入口是单独收起来的：

```tsx
<Route
  path="/admin/comments"
  element={
    <RequireAdmin>
      <AdminCommentsPage />
    </RequireAdmin>
  }
/>
```

顶部导航也只有管理员才会看到：

```tsx
{isAdmin ? (
  <NavLink to="/admin/comments">
    <NavTile icon="🛡️" label="Comment Review" />
  </NavLink>
) : null}
```

这说明评论审核并不是一个“后台接口先放着”，而是已经有完整的前端入口。

而 `AdminCommentsPage.tsx` 里，页面本身也不是只展示列表，它已经支持：

- 按 `PENDING / APPROVED / REJECTED` 切换状态；
- 单条通过或驳回；
- 当前页批量通过或批量驳回；
- 联动切换文章的评论审核策略。

例如批量审核调用的就是：

```ts
await apiAdminUpdateCommentStatus(accessToken, commentId, nextStatus);
```

而切换某篇文章的评论策略则是：

```ts
await apiAdminUpdatePostCommentModeration(accessToken, post.postId, !moderationEnabled);
```

这意味着上线验收时，我们完全可以直接从真实前端页面走，而不是只拿 Postman 单独调接口。

## 3. 后端审核接口真正验证的是“管理员身份”和“状态写回”

评论审核的后端入口在：

```text
backend/services/content-service/src/main/java/com/paperflow/content/api/AdminController.java
```

列表接口是：

```java
@GetMapping("/comments")
```

更新状态接口是：

```java
@PatchMapping("/comments/{commentId}")
```

而这两个接口都不是默认开放的，它们先做了一层角色校验：

```java
if (!isAdmin(roles)) {
  return ResponseEntity.status(403).body(Envelope.err(..., "AUTH_FORBIDDEN", "Admin required", ...));
}
```

这层很重要，因为它说明管理端验收不只是看“按钮能不能点”，还要看：

- 普通用户是否会被正确拦住；
- 管理员是否真的能通过；
- `X-User-Roles` 是否已经从网关透传到下游；
- 审核动作是否真的写回了评论状态。

真正写回状态的逻辑是：

```java
String before = c.getStatus();
c.setStatus(req.status());
comments.save(c);
```

这就是业务验收里的核心断点。  
如果前端点了“通过”按钮，但这里没有成功写回，那么后续通知和消息中心都不会成立。

## 4. 这条链最关键的一步，不是审核本身，而是“审核通过后是否触发通知”

PaperFlow 这套实现里，有一个很值得拿来做验收的细节：

```java
if (!"APPROVED".equals(before) && "APPROVED".equals(c.getStatus())) {
  notifications.notifyReplyIfNeeded(c);
}
```

也就是说，通知不是每次状态更新都发，而是满足下面这个条件才触发：

- 原来不是 `APPROVED`
- 现在变成了 `APPROVED`

这点很有业务意义。  
因为它避免了下面这些问题：

- 已通过的评论重复审核时重复发通知；
- 驳回状态变化也误发通知；
- 没有父评论的普通评论也被误判成通知事件。

从上线验收角度看，这一步比“接口 200”更有价值。  
因为它开始验证系统是不是按预期执行了业务规则。

## 5. 通知服务真正补上的，是“审核结果对用户可感知”

通知生成逻辑在：

```text
backend/services/content-service/src/main/java/com/paperflow/content/service/NotificationService.java
```

核心条件包括：

```java
String parentId = comment.getParentCommentId();
if (parentId == null || parentId.isBlank()) {
  return;
}
CommentEntity parent = comments.findById(parentId).orElse(null);
if (parent == null) {
  return;
}
String recipient = parent.getUserId();
String actor = comment.getUserId();
if (recipient == null || recipient.isBlank() || actor == null || actor.isBlank()) {
  return;
}
if (recipient.equals(actor)) {
  return;
}
```

也就是说，通知只会在“回复别人评论”这种场景下生成，而不会：

- 对根评论生成通知；
- 对不存在的父评论生成通知；
- 给自己回复自己时生成通知。

最后落库的数据也比较完整：

```java
n.setRecipientUserId(recipient);
n.setActorUserId(actor);
n.setType("COMMENT_REPLY");
n.setTitle("你收到一条新回复");
n.setContent(preview(comment.getContent()));
n.setPostId(comment.getPostId());
n.setTargetCommentId(parentId);
```

这正好说明通知系统不是“额外做一个提示框”，而是业务闭环中的正式一环。

## 6. 消息中心页面，正好可以作为这条链的用户侧终点

前端消息中心路由是：

```tsx
<Route
  path="/notifications"
  element={
    <RequireAuth>
      <NotificationsPage />
    </RequireAuth>
  }
/>
```

页面请求的接口是：

```ts
apiListNotifications(accessToken, pageNumber, pageSize, signal)
```

后端对应的是：

```java
@GetMapping("/notifications")
```

接口会同时返回：

- `items`
- `page`
- `unreadCount`

消息中心页还支持：

- 单条标记已读；
- 全部标记已读；
- 跳回帖子详情页对应评论位置。

例如页面里的链接就是：

```tsx
<Link to={`/posts/${n.postId}#comment-${n.targetCommentId}`} className="pf-link-btn">
  查看上下文
</Link>
```

这意味着用户不是只能在消息中心“看到一条消息”，而是可以顺着消息回到原始业务上下文。  
这一点特别适合在老师看我们项目的时候，或者做上线验收时展示，因为它能把“业务闭环”讲清楚。

## 7. 对我们这个学生团队来说，真正有效的验收方式不是测单点，而是按业务顺序走一遍

如果把这条链拆成一组最小验收动作，大致可以这样做：

1. 普通用户登录并进入某篇帖子详情页  
2. 先发布一条根评论，再用另一账号回复这条评论  
3. 如果文章开启审核，确认回复在前台还不可见或处于待审核效果  
4. 管理员登录 `/admin/comments` 页面，筛到 `PENDING` 状态  
5. 管理员点击“通过”  
6. 被回复用户登录后打开 `/notifications`  
7. 检查是否出现新通知，未读数是否变化  
8. 点击“查看上下文”，确认能回到目标帖子和对应评论位置

这一套流程跑通之后，基本可以说明：

- 登录态可用；
- 评论创建可用；
- 管理员权限可用；
- 审核状态写回可用；
- 通知生成可用；
- 用户消息中心可用；
- 前端路由跳转可用。

对大学生团队来说，这比单独说“我测过接口”更有说服力。

## 8. 只看页面截图，很容易漏掉这条链里最关键的状态变化

评论审核这一类功能，表面上看只是管理端一个页面。  
但真正关键的，其实是下面这些状态变化有没有发生：

- 评论是否从 `PENDING` 变成 `APPROVED`
- 通知是否只在条件满足时生成
- 未读数是否同步变化
- 已读操作是否真正更新
- 跳转链接是否还能定位到正确上下文

如果这些状态没有被验到，就算页面截图看起来都正常，系统也不一定真的完成了上线闭环。

## 9. 最后

在大学生团队项目上线之后，评论审核和消息中心这条链之所以值得专门验证，不是因为它最复杂，而是因为它最能说明系统已经开始具备真实业务流转能力。

对我们这个 PaperFlow 学生项目来说，这条链把下面几件事串在了一起：

- 用户互动
- 管理员审核
- 状态变化
- 通知生成
- 用户感知

如果这条链跑通，那么上线后的系统就不只是“能打开”，而是已经开始“能协同工作”。  
这也是大学生团队项目从能演示走向能真正跑起来的一个很重要的标志。
