# PaperFlow 评论审核中的通知与前端提示：从状态变更到用户可感知闭环

> 摘要：评论审核如果只停留在后台改状态，系统链路通常并不完整。真正影响用户体验的是：评论进入可见态之后，通知能否正确触发，前端能否解释清楚状态变化，消息中心能否把用户带回原始上下文。本文结合 PaperFlow 的实现，复盘审核、通知与前端提示如何接成一条完整闭环。
>
> 标签：评论审核｜消息通知｜前端体验｜Spring Boot｜React｜技术设计

很多评论审核方案，后端状态流转其实已经做出来了，但用户体验依然很差。  
原因通常不是“审核没生效”，而是下面这三条链路没有接起来：

- 用户发完评论之后，不知道自己这条评论现在是什么状态；
- 管理员审核通过了，但被回复的人根本没有被唤醒；
- 前端页面没有把这些状态讲清楚，最后用户只会觉得“系统怪怪的”。

我在 PaperFlow 里做评论审核时，最后最大的感受是：  
**评论审核不是一个后台按钮，而是一条必须从创建、审核、通知一路串到前端提示的完整链路。**

这篇文章就专门讲这部分。

## 1. 审核真正要解决的问题，不是“能不能改状态”

如果只从后台实现看，评论审核很像一件很简单的事：

- 评论创建出来是 `PENDING`
- 管理员把它改成 `APPROVED` 或 `REJECTED`

但如果系统只停在这一步，实际用户体验会非常差：

- 评论作者不知道自己发出去的内容为什么只有自己能看到；
- 被回复的人不知道有人回复了自己；
- 管理员审核完之后，前台和消息中心没有任何联动。

所以我后来把评论审核理解成两段：

```text
审核状态流转
  -> 评论从不可见变成可见
  -> 通知链路被触发
  -> 前端把状态和结果讲清楚
```

这三件事缺一不可。

## 2. 我把通知触发点绑定在“进入可见态”，而不是“创建成功”

评论通知最容易做错的地方，是把它和“评论创建”绑死。

如果回复评论刚创建出来还是 `PENDING`，你就先给被回复的人发通知，那么用户点进来之后却看不到内容，整个通知系统反而成了制造困惑的来源。

所以 PaperFlow 这里做了一个非常明确的约束：  
**只有评论进入可见态时，回复通知才允许触发。**

创建时的逻辑：

```java
String status = Boolean.FALSE.equals(post.getCommentModerationEnabled()) ? "APPROVED" : "PENDING";
c.setStatus(status);
comments.save(c);
if ("APPROVED".equals(status)) {
  notifications.notifyReplyIfNeeded(c);
}
```

审核通过时的逻辑：

```java
String before = c.getStatus();
c.setStatus(req.status());
comments.save(c);
if (!"APPROVED".equals(before) && "APPROVED".equals(c.getStatus())) {
  notifications.notifyReplyIfNeeded(c);
}
```

这里最关键的一点不是“调用了通知服务”，而是通知触发时机被严格限制在了：

- 创建时已可见；
- 或者审核后首次进入可见态。

这样一来，消息链路和内容可见性链路就不会打架。

## 3. 通知服务里，我保留了两个必须存在的降噪规则

通知服务本身的实现不复杂，但里面有两个规则我认为必须保留。

通知核心逻辑如下：

```java
String recipient = parent.getUserId();
String actor = comment.getUserId();
if (recipient == null || recipient.isBlank() || actor == null || actor.isBlank()) {
  return;
}
if (recipient.equals(actor)) {
  return;
}
NotificationEntity n = new NotificationEntity();
n.setType("COMMENT_REPLY");
n.setRecipientUserId(recipient);
n.setActorUserId(actor);
n.setPostId(comment.getPostId());
n.setTargetCommentId(parentId);
notifications.save(n);
```

这里我特别看重两点：

### 3.1 自回复不发通知

这看起来像小细节，但其实非常重要。  
如果用户自己回复自己也能收到一条“你收到一条新回复”，消息中心很快就会被无效提醒污染掉。

所以这条判断：

```java
if (recipient.equals(actor)) {
  return;
}
```

一定不能省。

### 3.2 通知要指向“被回复的那条评论”

我这里保存的是：

```java
n.setTargetCommentId(parentId);
```

而不是当前新评论自己的 ID。  
这样消息中心点击“查看上下文”时，才能准确回到被回复的那条评论附近，用户不会迷失在评论树里。

这类细节如果不提前想清楚，后面前端跳转逻辑会很别扭。

## 4. 后台审核页的重点，不是页面功能多，而是让运营动作足够顺手

后台这部分我没有一上来做复杂审核中心，而是优先做“够用且顺手”的最小闭环。

当前管理端做的事情很聚焦：

- 默认查看 `PENDING` 评论列表；
- 支持单条或批量通过 / 驳回；
- 支持在评论审核页里直接切换帖子“需审核 / 免审核”。

默认待审核列表：

```java
@GetMapping("/comments")
public ResponseEntity<Envelope<Object>> listComments(...,
    @RequestParam(value = "status", required = false, defaultValue = "PENDING") String status, ...) {
  List<CommentResponse> items =
      comments.listByStatus(status, PageRequest.of(pn - 1, ps)).stream().map(this::toDto).toList();
  ...
}
```

前端切换帖子审核策略：

```ts
await apiAdminUpdatePostCommentModeration(accessToken, post.postId, !moderationEnabled);
```

这块我有意没有先做太重，因为现阶段更重要的是：

- 审核的人能快速处理积压；
- 审核动作能立即影响前台状态；
- 文章级策略切换不需要跳好几个页面。

对早期系统来说，这比“大而全的审核后台”更有价值。

## 5. 前端最关键的工作，不是多一个按钮，而是把状态讲清楚

后端把 `PENDING / APPROVED / REJECTED` 做出来并不代表用户就能理解。  
如果前端不把这层语义翻译成人能理解的话，用户的感受还是只有一句话：  
“我评论是不是没发出去？”

所以这轮前端里，我专门做了三件事。

### 5.1 把评论当前状态直接展示出来

```tsx
const statusText =
  comment.status === "PENDING"
    ? "待审核（仅自己可见）"
    : comment.status === "REJECTED"
      ? "已驳回（仅自己可见）"
      : null;
```

这个文案的意义在于：  
它不是单纯告诉用户“有个状态字段”，而是明确解释了**为什么你能看到，别人看不到**。

### 5.2 把列表展示规则写在评论区标题里

```tsx
<div className="pf-muted2">
  共 {visibleCommentCount} 条；展示：全部已发布 + 我的待审核/驳回；
  创建：{post?.commentModerationEnabled === false ? "APPROVED（即时发布）" : "PENDING（需管理员审核）"}
</div>
```

这段提示非常值钱，因为它把两个最容易产生误解的问题直接说透了：

- 当前列表为什么是这样；
- 当前帖子发评论会走什么状态流转。

### 5.3 提交后反馈必须区分“已发布”和“待审核”

```tsx
flashCommentTip(
  created.status === "APPROVED"
    ? "评论已发布"
    : created.status === "PENDING"
      ? "评论已提交，等待审核"
      : "评论已提交"
);
```

如果这里统一提示“评论提交成功”，用户其实还是不知道自己是否已经公开可见。  
所以这里必须把状态含义翻译成人话。

## 6. 消息中心要做的，不是把通知列出来，而是把人和上下文补齐

如果消息中心里只有一条“你收到一条新回复”，但没有触发人是谁、也跳不回上下文，那它的价值其实很有限。

所以 PaperFlow 这里补了两层东西：

- 触发者昵称映射；
- 查看上下文入口。

前端会先把 actor 的昵称查出来：

```tsx
const unresolved = Array.from(new Set(items.map((it) => it.actorUserId).filter((id) => id && !nameMap[id])));
const card = await apiGetCommentUserCard(id);
```

渲染时优先显示昵称：

```tsx
<span style={{ fontWeight: 600 }}>{nameMap[n.actorUserId] ?? n.actorUserId}</span>
```

同时消息里保留“查看上下文”：

```tsx
<Link to={`/posts/${n.postId}#comment-${n.targetCommentId}`} className="pf-link-btn">
  查看上下文
</Link>
```

这样通知才不只是“提醒你有事发生”，而是能把用户送回那条互动链路里。

## 7. 这次实现真正补上的，是审核、通知和前端提示之间的断点

回头看这轮实现，我觉得最重要的不是“又多了几个接口”，而是以前最容易断掉的几个点，现在被连起来了：

- 评论创建时，状态有统一依据；
- 评论审核通过时，通知能正确触发；
- 消息中心能把用户带回原始上下文；
- 前端能解释清楚评论为什么现在这样显示。

很多系统的评论审核做着做着会变得很奇怪，本质上不是后台做错了，而是审核、通知、前端提示各自独立演进，最后互相之间没有统一语义。

这次在 PaperFlow 里，我最大的收获反而不是“补了审核功能”，而是第一次把这几条链路真正接成了一条闭环。

## 8. 小结

评论审核如果只理解成“管理员把评论从 `PENDING` 改成 `APPROVED`”，那它永远只是一个后台动作。  
但如果把它放进完整链路里看，它其实同时影响三件事：

- 评论前台是否可见；
- 被回复用户是否该收到提醒；
- 作者是否能理解自己当前看到的状态。

也正因为这样，我现在越来越觉得：  
**评论审核的核心价值，不在后台能不能改状态，而在系统有没有把状态变化正确地传递给每一个相关角色。**

对 PaperFlow 来说，当前这版已经先把这条链路的骨架搭起来了。  
后面无论继续补审核日志、审核原因、敏感词、频控还是举报工单，都有明确的挂载点，而不是重新推翻这套交互与状态语义。
