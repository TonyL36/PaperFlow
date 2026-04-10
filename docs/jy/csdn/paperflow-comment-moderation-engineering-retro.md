# PaperFlow 评论审核设计复盘：可见性、状态流转与通知闭环

> 摘要：评论审核看起来只是状态变更，但真正影响系统稳定性的，是创建、查询、审核与通知是否围绕同一套状态语义运转。本文结合 PaperFlow 的实现，复盘评论审核中的 4 个关键设计点：文章级审核策略、`APPROVED + 我的待审/驳回` 可见性规则、5 层评论深度控制，以及只在“进入可见态”时触发通知的闭环设计。
>
> 标签：评论系统｜内容审核｜Spring Boot｜React｜系统设计｜技术复盘

做评论功能时，很多人第一反应是：加一个 `status` 字段，再补一个后台审核页面，这事就差不多了。  
但我把 PaperFlow 的评论链路真正接起来之后，发现评论审核最难的地方从来都不是“把评论写进数据库”，而是下面这几个工程问题会不会互相打架：

- 未审核评论到底谁能看到；
- 评论审核开启和关闭时，创建链路怎么保持一致；
- 回复类评论什么时候能发通知，什么时候绝对不能发；
- 前端怎么把这些状态解释清楚，而不是让用户觉得“我评论是不是丢了”。

PaperFlow 当前这版评论审核，没有先做成一个重型审核平台，而是先把最核心的四条边界站稳：

- 可见性边界清楚；
- 状态流转简单可控；
- 审核与通知形成闭环；
- 前端对用户足够可解释。

这篇文章就从工程复盘角度，讲讲这套方案是怎么落地的。

## 1. 先说结论：评论审核真正难的是状态边界

我最后把评论审核理解成一条状态链路，而不是一个单独后台功能：

```text
创建评论
  -> 按文章策略决定是 APPROVED 还是 PENDING
  -> 列表查询按可见性规则返回
  -> 管理端审核 APPROVED / REJECTED
  -> 只有进入可见态的回复，才允许触发通知
```

这套链路的关键不在功能数量，而在规则是否统一。  
只要“创建、查询、审核、通知”四个环节用的是同一套状态语义，系统就不会越做越乱。

## 2. 第一处取舍：我没有把评论审核做成全局开关，而是做成文章级策略

最开始我也考虑过用一个全局配置，统一决定“评论是否需要审核”。实现会很简单，但问题也很明显：

- 不同来源的文章风险不一样；
- 有些帖子适合开放讨论，有些帖子更适合先审后发；
- 后面如果要做运营配置，全局开关太粗了。

所以最后把审核策略下沉到了帖子本身，在 `pf_post` 表上加了 `comment_moderation_enabled` 字段。

数据库迁移非常直接：

```sql
alter table pf_post
  add column if not exists comment_moderation_enabled boolean not null default true;
```

这样做的好处是，评论状态在创建当下就能被确定，而不是创建之后再靠别的流程补判断。

后端创建逻辑也因此变得很明确：

```java
String status = Boolean.FALSE.equals(post.getCommentModerationEnabled()) ? "APPROVED" : "PENDING";
c.setStatus(status);
comments.save(c);
if ("APPROVED".equals(status)) {
  notifications.notifyReplyIfNeeded(c);
}
```

这里我比较满意的一点是：  
“能不能发通知”不需要额外猜，它天然依赖评论是否已经进入可见态。这样就避免了一个很常见的问题：评论还没审核通过，通知却先发出去了。

## 3. 第二处取舍：公开评论和“我的待审核评论”，我没有拆成两套接口

评论查询是这次实现里最容易踩坑的部分。

如果接口只返回 `APPROVED`，作者刚发出的 `PENDING` 评论刷新后就看不到，很容易误以为“提交失败了”。  
但如果接口把所有 `PENDING/REJECTED` 都返回给前端，那又会直接泄露别人的未审核内容。

我的做法是：不拆两套查询接口，而是在一条查询里同时表达“公开可见”和“作者自见”两种规则。核心仓储查询如下：

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

控制器入口：

```java
String normalizedUserId = userId == null ? "" : userId.trim();
List<CommentEntity> visible = comments.listVisibleByPostForUser(postId, normalizedUserId);
```

这背后其实就是三条规则：

- 所有人都能看 `APPROVED`；
- 当前登录用户可以额外看到自己的 `PENDING/REJECTED`；
- 别人的待审和驳回评论永远不可见。

这套规则的最大收益不是“少写了一个接口”，而是前后端对状态认知统一了。  
前端不需要猜，后端也不需要维护两套几乎重复的查询逻辑。

## 4. 第三处取舍：评论层级没有无限放开，而是封顶 5 层

评论树另一个容易被低估的问题，是一旦允许无限回复，复杂度会同时出现在三个地方：

- 后端树构建；
- 前端渲染和折叠；
- 审核时的上下文回溯。

PaperFlow 当前把评论深度限制在 5 层，校验逻辑如下：

```java
String parentCommentId = req.parentCommentId() == null || req.parentCommentId().isBlank() ? null : req.parentCommentId().trim();
if (parentCommentId != null) {
  CommentEntity parent = comments.findById(parentCommentId).orElse(null);
  if (parent == null || !req.postId().equals(parent.getPostId())) {
    return ResponseEntity.status(404).body(...);
  }
  int parentDepth = commentDepth(parent);
  if (parentDepth >= 5) {
    return ResponseEntity.status(400).body(Envelope.err(..., "Max comment depth is 5", java.util.Map.of()));
  }
}
```

深度计算本身也保持了朴素实现：

```java
private int commentDepth(CommentEntity comment) {
  int depth = 1;
  CommentEntity cursor = comment;
  while (cursor.getParentCommentId() != null && !cursor.getParentCommentId().isBlank()) {
    depth += 1;
    cursor = comments.findById(cursor.getParentCommentId()).orElse(null);
    if (cursor == null) {
      break;
    }
    if (depth > 5) {
      break;
    }
  }
  return depth;
}
```

这不是最“炫”的设计，但它足够稳。  
当前阶段我更希望把可见性和审核闭环先做扎实，而不是为了“支持任意深度楼中楼”把整个评论模型复杂化。

## 5. 第四处取舍：通知只在“不可见 -> 可见”时触发

如果评论审核只是改状态，那它还不算真正闭环。  
真正的闭环是：一条回复评论在进入可见态之后，能把被回复的人正确唤醒。

这里最核心的设计点是：通知不能跟“创建动作”强绑定，而要跟“进入可见态”绑定。

对应实现分成两段：

- 创建时，如果评论本身已经是 `APPROVED`，立即触发；
- 审核时，如果状态从非 `APPROVED` 变成 `APPROVED`，再触发一次。

审核控制器：

```java
String before = c.getStatus();
c.setStatus(req.status());
comments.save(c);
if (!"APPROVED".equals(before) && "APPROVED".equals(c.getStatus())) {
  notifications.notifyReplyIfNeeded(c);
}
```

通知服务：

```java
@Transactional
public void notifyReplyIfNeeded(CommentEntity comment) {
  if (comment == null) {
    return;
  }
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
  NotificationEntity n = new NotificationEntity();
  n.setType("COMMENT_REPLY");
  n.setRecipientUserId(recipient);
  n.setActorUserId(actor);
  n.setPostId(comment.getPostId());
  n.setTargetCommentId(parentId);
  notifications.save(n);
}
```

这里有两个我认为必须守住的边界：

- 自己回复自己，不发通知；
- 只有进入公开可见态的评论，才允许发通知。

否则评论审核和消息系统之间一定会出现时序错乱。

## 6. 前端这次最重要的改动，不是加审核按钮，而是把状态解释清楚

纯后端视角很容易忽略一点：  
用户不关心你后端有没有 `PENDING`，用户只关心“我刚发的评论去哪了”。

所以前端我没有把审核状态藏起来，而是直接在评论区明确展示。

评论节点里直接显示状态提示：

```tsx
const statusText =
  comment.status === "PENDING"
    ? "待审核（仅自己可见）"
    : comment.status === "REJECTED"
      ? "已驳回（仅自己可见）"
      : null;
```

评论区标题也把规则说透：

```tsx
<div className="pf-muted2">
  共 {visibleCommentCount} 条；展示：全部已发布 + 我的待审核/驳回；
  创建：{post?.commentModerationEnabled === false ? "APPROVED（即时发布）" : "PENDING（需管理员审核）"}
</div>
```

提交后的反馈也区分状态：

```tsx
flashCommentTip(
  created.status === "APPROVED"
    ? "评论已发布"
    : created.status === "PENDING"
      ? "评论已提交，等待审核"
      : "评论已提交"
);
```

这个改动看起来只是文案层面，但实际上很值钱。  
因为它直接降低了“评论丢失感”和“审核黑盒感”。

## 7. 后台我没有先做复杂审核平台，而是先做最小可运营闭环

后台这块很容易越做越重：审核理由、审核人、操作日志、批量规则、敏感词引擎、申诉流……每一项都能继续展开。

但在这一阶段，我只保留最小闭环：

- 按状态查看评论；
- 单条/批量通过或驳回；
- 支持按文章切换“需要审核 / 直接发布”。

比如帖子级审核策略切换，前端调用就很直接：

```ts
await apiAdminUpdatePostCommentModeration(accessToken, post.postId, !moderationEnabled);
```

这种做法的好处是上线快、规则清晰、学习成本低；  
代价也很明显：目前没有独立审核日志，没有审核理由，也没有更细粒度的策略配置。

这部分我认为是可接受的技术债，因为当前系统最需要的不是“审核中心”，而是“审核闭环”。

## 8. 我专门补了集成测试，验证最容易出事故的边界

评论审核如果只靠手点，很难保证没漏边界。  
所以我把最关键的用例补进了集成测试。

当前至少覆盖了两类核心场景：

- 文章关闭审核后，评论直接 `APPROVED`；
- 作者能看到自己的 `PENDING` 评论，其他用户看不到。

尤其第二个场景，我认为是这次实现里最关键的一条回归保障。  
因为评论审核最怕的不是接口报错，而是“边界悄悄漏掉了”。

## 9. 这版实现我认可的地方，以及我明确知道还没做的地方

我比较认可的点有三个：

- 状态语义统一，创建、查询、审核、通知都围绕同一套规则；
- 前端没有把审核做成黑盒，作者能理解自己为什么看到这条评论；
- 实现复杂度还控制得住，没有过早引入重型审核系统。

但我也很清楚这版还不完整，至少还有这些后续空间：

- 没有审核日志，缺少“谁在什么时间做了什么操作”的审计信息；
- 没有审核原因字段，驳回对用户的解释力还不够；
- 没有敏感词、频控、举报流，治理能力还只是第一层；
- 状态目前仍然是字符串常量，后续可以进一步收敛成更明确的领域枚举。

换句话说，这版不是终局方案，但它已经把评论审核里最容易把系统做乱的几条边界先站稳了。

## 10. 小结

回过头看，这次评论审核实现最重要的收获，不是多了一个“审核后台”，而是我把评论链路里最核心的状态问题理顺了：

- 评论在创建时就决定可见性起点；
- 查询时同时兼顾公开安全和作者可解释；
- 审核通过后再进入通知链路；
- 前端明确告诉用户当前状态，而不是让状态消失。

很多时候，评论系统的难点不在“能不能发评论”，而在“系统状态是否一致、边界是否说得清楚、链路是否闭环”。  
PaperFlow 当前这版评论审核，至少先把这三件事做对了。

## 文末可附实现位置

如果文章发布到 CSDN，不建议保留本地 `file:///` 路径。更合适的做法有两种：

- 直接把本文提到的关键实现代码片段贴在正文对应位置；
- 在文末保留“仓库内实现位置”，使用相对路径描述，方便读者理解模块分布。

本文对应的主要实现位置可以整理为：

- 后端主链路：`backend/services/content-service/src/main/java/com/paperflow/content/api/CommentsController.java`
- 可见性查询：`backend/services/content-service/src/main/java/com/paperflow/content/repo/CommentRepository.java`
- 审核管理接口：`backend/services/content-service/src/main/java/com/paperflow/content/api/AdminController.java`
- 通知闭环：`backend/services/content-service/src/main/java/com/paperflow/content/service/NotificationService.java`
- 前端评论页：`apps/paperflow-web/src/ui/pages/PostDetailPage.tsx`
- 前端审核策略页：`apps/paperflow-web/src/ui/pages/AdminPostModerationPage.tsx`
