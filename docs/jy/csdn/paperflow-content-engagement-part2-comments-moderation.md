# PaperFlow 内容互动链路设计（下）：评论互动、审核与通知机制

## 1. 项目背景

帖子详情跑通之后，评论系统真正进入的不是“功能补齐阶段”，而是“状态边界治理阶段”。  
评论写入本身并不难，真正容易把系统做乱的，通常是三件事：

- 评论结构能不能保持可读，而不是很快演变成失控的楼中楼；
- 审核边界能不能收紧，既不泄露未审核内容，也不让作者误以为评论丢了；
- 点赞、用户卡片、被回复通知这些互动能力，能不能真正形成一条闭环。

当前 PaperFlow 的评论链路可以概括为：

```text
帖子详情页
   │
   ▼
评论树（最多 5 层）
   │
   ├─ 点赞 / 排序 / 回复
   ├─ 用户卡片（点击触发）
   ├─ 状态提示（APPROVED / PENDING / REJECTED）
   └─ 可见性：全部 APPROVED + 我的待审/驳回
   ▼
审核后台
   ├─ 待审核列表（批量通过/驳回）
   └─ 帖子级“需审核/免审核”开关
   ▼
消息中心
   └─ 评论被回复通知（COMMENT_REPLY）
```

## 2. 评论查询边界：公开安全与作者可解释，必须同时成立

评论查询最容易踩坑的地方，不是 SQL 写不写得出来，而是可见性边界会不会漏。  

如果接口只返回 `APPROVED`，作者会误以为刚提交的评论“根本没发出去”；  
如果接口把所有 `PENDING/REJECTED` 都一并返回，又会把别人的未审核内容直接暴露出来。  

PaperFlow 这里没有把“公开评论”和“作者自己的评论”拆成两套接口，而是在一条查询里同时表达两种可见性规则。后端入口如下：

```java
String normalizedUserId = userId == null ? "" : userId.trim();
List<CommentEntity> visible = comments.listVisibleByPostForUser(postId, normalizedUserId);
```

对应仓储查询：

```java
@Query("""
    select c
    from CommentEntity c
    where c.postId=:postId
      and (
        c.status='APPROVED'
        or (:userId is not null and :userId <> '' and c.userId=:userId)
      )
    order by c.createdAt asc
    """)
List<CommentEntity> listVisibleByPostForUser(@Param("postId") String postId, @Param("userId") String userId);
```

也就是说，当前真正落地的可见性规则是：

- 所有人都能看到 `APPROVED`；
- 当前登录用户可额外看到自己的 `PENDING/REJECTED`；
- 他人的待审/驳回依旧不可见。

## 3. 评论层级：把深度封顶，不是保守，而是主动控制复杂度

评论层级这件事，真正难的从来不是“让它继续往下回”，而是放开之后查询、渲染和治理复杂度会一起抬升。  
PaperFlow 当前采用“最多 5 层”的策略，创建时沿父评论链做校验，核心代码如下：

```java
String parentCommentId = req.parentCommentId() == null || req.parentCommentId().isBlank() ? null : req.parentCommentId().trim();
if (parentCommentId != null) {
  CommentEntity parent = comments.findById(parentCommentId).orElse(null);
  if (parent == null || !req.postId().equals(parent.getPostId())) {
    return ResponseEntity.status(404).body(...);
  }
  int parentDepth = commentDepth(parent);
  if (parentDepth >= 5) {
    return ResponseEntity.status(400).body(Envelope.err(..., "Max comment depth is 5", ...));
  }
}
```

深度计算逻辑：

```java
private int commentDepth(CommentEntity comment) {
  int depth = 1;
  CommentEntity cursor = comment;
  while (cursor.getParentCommentId() != null && !cursor.getParentCommentId().isBlank()) {
    depth += 1;
    cursor = comments.findById(cursor.getParentCommentId()).orElse(null);
    if (cursor == null || depth > 5) break;
  }
  return depth;
}
```

这里把深度封顶，不是为了少做功能，而是给当前实现模型下的查询、树构建、前端展开和审核回溯都设一个上限。  
在这个边界内，连续讨论是成立的，系统复杂度也还可控。

## 4. 帖子级审核策略：状态在创建时就定下来

评论状态在创建时就确定，代码如下：

```java
String status = Boolean.FALSE.equals(post.getCommentModerationEnabled()) ? "APPROVED" : "PENDING";
c.setStatus(status);
comments.save(c);
if ("APPROVED".equals(status)) {
  notifications.notifyReplyIfNeeded(c);
}
```

这段逻辑真正锁住的是评论状态流转的边界：

- `commentModerationEnabled=false`：直接公开；
- 其他情况：进入 `PENDING`，等待后台审核；
- 只有已经进入可见态的回复，才会继续往通知链路流转。

这件事很关键。  
如果把“通知是否发送”放到创建之后的其他环节再猜，系统很容易出现“评论还没公开，通知先发出去了”的错位体验。  
把状态在创建时就定下来，后面的查询、审核和通知就都有了统一依据。

## 5. 互动增强：点赞与用户卡片

### 5.1 点赞链路：幂等不是优化项，而是互动底线

点赞接口的幂等写法如下（`userId + commentId` 唯一键）：

```java
UserCommentKey key = new UserCommentKey(userId, commentId);
CommentLikeEntity like = commentLikes.findById(key).orElse(null);
if (like == null) {
  like = new CommentLikeEntity();
  like.setId(key);
  like.setCreatedAt(OffsetDateTime.now(ZoneOffset.UTC));
  commentLikes.save(like);
}
```

取消点赞：

```java
commentLikes.deleteById(new UserCommentKey(userId, commentId));
```

列表返回里会同步给前端 `likeCount` 与 `liked`。  
这意味着评论点赞不是靠前端自己“猜当前状态”，而是每次都以服务端关系表为准，重复点击、多端点击也不会把计数打乱。

### 5.2 用户卡片：只给最小必要信息，不把评论区做成社交主页

卡片接口返回最小必要信息：

```java
long postCount = posts.countByAuthorUserId(normalized);
long receivedLikeCount =
    postLikes.countReceivedByAuthorUserId(normalized)
    + commentLikes.countReceivedByCommentAuthorUserId(normalized);
var data = Map.of(
    "userId", normalized,
    "displayName", displayName(normalized),
    "postCount", postCount,
    "receivedLikeCount", receivedLikeCount
);
```

这套卡片信息非常克制，但正因为克制，职责边界才清楚。  
评论区当前并不试图承接完整社交关系，而是优先解决“我眼前这个人是谁、活跃度怎样、历史认可度怎样”这三个最常见的问题。  

前端现在的处理也和这个思路保持一致：

- 评论昵称优先展示 `displayName`；
- 用户卡片改为点击触发，不再是 hover 自动弹出；
- 同一时刻仅打开当前点击评论对应卡片，避免一人多评导致“多弹窗同时出现”。

## 6. 前端评论区：重点不是加按钮，而是让系统状态可解释

这一轮前端改造，重点不是继续堆操作入口，而是降低用户对系统状态的理解成本：

- 支持“最新 / 最热”排序，把时间新鲜度和互动热度拆开；
- 回复默认折叠，把长链回复对正文阅读的干扰压到首屏之外；
- 点赞按钮图标化，让互动入口更轻，不抢正文注意力；
- 移除复制链接和举报快捷按钮，减少无效噪声操作；
- 回复草稿使用昵称而不是原始用户 ID，降低阅读和输入成本；
- 评论状态直接可见，让待审核 / 驳回从隐性状态变成显性反馈。

对应前端片段（昵称与点击卡片）：

```tsx
const displayNameOfUser = (userId: string) =>
  userCardCache[userId]?.displayName ?? commentDisplayNameOf(userId);

<span className="pf-comment-user__name">{displayNameOfUser(comment.userId)}</span>
<Button onClick={() => beginReply(comment.commentId, displayNameOfUser(comment.userId), depth + 1)}>
  回复
</Button>
```

点赞图标化按钮片段：

```tsx
<Button
  onClick={() => void toggleCommentLike(comment)}
  variant={comment.liked ? "primary" : "default"}
>
  <span className="pf-like-button-content">
    <BiliLikeIcon active={comment.liked === true} />
    <span>{likeCountOf(comment)}</span>
  </span>
</Button>
```

## 7. 审核后台闭环：重点不是页面多，而是状态能真正流转起来

后台这部分没有直接做成复杂审核平台，而是先把最小闭环站稳：

- 按状态查询评论（默认待审核）；
- 批量或单条通过/驳回；
- 在评论审核页可直接切换帖子级“需审核/免审核”策略。

审核列表查询默认落在 `PENDING`：

```java
@GetMapping("/comments")
public ResponseEntity<Envelope<Object>> listComments(...,
    @RequestParam(value = "status", required = false, defaultValue = "PENDING") String status, ...) {
  List<CommentResponse> items =
      comments.listByStatus(status, PageRequest.of(pn - 1, ps)).stream().map(this::toDto).toList();
  ...
}
```

审核状态变更与通知触发：

```java
String before = c.getStatus();
c.setStatus(req.status());
comments.save(c);
if (!"APPROVED".equals(before) && "APPROVED".equals(c.getStatus())) {
  notifications.notifyReplyIfNeeded(c);
}
```

这段逻辑里最关键的不是“能改状态”，而是只在状态发生“不可见 → 可见”的跃迁时触发通知。  
这样可以避免重复审核、重复保存导致消息重复发送。

管理页快捷切换审核策略：

```ts
await apiAdminUpdatePostCommentModeration(accessToken, post.postId, !moderationEnabled);
```

## 8. 被回复通知：通知不是附属能力，而是互动闭环是否成立的判断点

评论系统只做到“能发出去”，其实还不算真正闭环。  
只有回复进入可见态、通知正确发出、用户还能点回原上下文，这条互动链路才算走完。当前链路为：

- 回复评论达到可见状态时（直接通过或审核后通过）；
- 生成 `COMMENT_REPLY` 通知；
- 消息中心可查看、单条已读、全部已读；
- 通知内容显示触发者昵称，支持跳转评论上下文。

通知生成逻辑：

```java
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

消息中心昵称映射片段：

```tsx
const unresolved = Array.from(new Set(items.map((it) => it.actorUserId).filter((id) => id && !nameMap[id])));
const card = await apiGetCommentUserCard(id);
...
<span style={{ fontWeight: 600 }}>{nameMap[n.actorUserId] ?? n.actorUserId}</span>
```

这里有两个边界尤其重要：

- 自回复不发通知，这是最基础的降噪规则；
- `targetCommentId` 指向被回复的那条评论，而不是当前新评论，这样消息中心才能正确跳回上下文。

评论写入只是入口，只有回复进入可见态、通知正确触发、用户能回到对应上下文，这条互动链路才算真正闭环。

## 9. 这一版方案的核心收益

这一版方案并不追求一次性做成重型社区，而是先把最容易把系统做乱的几条边界站稳：

- 查询边界清晰（公开安全 + 作者可解释）；
- 层级可控（最多 5 层）；
- 审核可运营（后台策略与批处理完整）；
- 互动可感知（点赞、卡片、通知全链路）。

当查询边界、层级控制、审核闭环和互动触达都先站稳之后，后续无论继续补敏感词、频控、举报工单，还是补审核审计字段，都会自然得多，而不是一边上线一边返工。

## 10. 小结

评论系统真正的价值，不在“能发几层回复”，而在“状态边界是否清楚、互动链路是否闭环、后续治理能力是否有地方可接”。  
从这个角度看，PaperFlow 当前这版评论实现已经先把最关键的三条线接通了：评论可见性、审核状态流转、被回复通知触达。后面的敏感词、频控、举报和审计，不需要推翻模型，只需要沿着这套边界继续往里补。
