# PaperFlow 内容互动链路设计（上）：每日帖子与查询聚合

## 1. 项目背景

内容平台的第一阶段，表面上是“把帖子列表展示出来”，真正进入联调后，问题会迅速转向读取链路是否完整。以 PaperFlow 为例，首批需求并不复杂，但具有明确的工程约束：

- 首页必须持续有内容，避免系统启动后出现空白页；
- 同一套帖子接口需要同时服务匿名访问和登录访问；
- 点赞、收藏、阅读足迹等轻量互动信息，应尽量在查询阶段完成聚合；
- 后续还要继续接入评论、审核与治理能力，因此接口边界不能过早做窄。

因此，这一阶段的核心工作不是单独设计“帖子表”或“点赞表”，而是先把一条稳定的读取链路做完整：

```text
每日保底内容
   │
   ▼
帖子列表
   │
   ▼
帖子详情
   │
   ├─ 点赞状态
   ├─ 收藏状态
   └─ 阅读足迹
   ▼
评论区与审核能力
```

本文聚焦这条链路的上半段：如何保证内容源不断档，以及如何让帖子查询接口自然承接用户态互动信息。

## 2. 每日帖子保底机制

在开发环境、演示环境或冷启动阶段，最常见的问题不是接口不可用，而是系统可以访问但没有内容。相较于通过临时 SQL 反复灌入测试数据，在服务内提供一个可开关的保底任务，更符合长期维护需求。

PaperFlow 中的 `DailyPostJob` 采用了非常直接的实现：

```java
@Component
@ConditionalOnProperty(prefix = "paperflow.daily-post", name = "enabled", havingValue = "true")
public class DailyPostJob {
  private final PostRepository posts;

  @EventListener(ApplicationReadyEvent.class)
  public void bootstrap() {
    ensureDailyPost();
  }

  @Scheduled(cron = "0 0 9 * * *")
  public void ensureDailyPost() {
    OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
    OffsetDateTime start = now.truncatedTo(ChronoUnit.DAYS);
    OffsetDateTime end = start.plusDays(1);
    if (posts.existsBySourceAndPublishedAtBetween("scheduler", start, end)) {
      return;
    }

    PostEntity p = new PostEntity();
    p.setId("post_" + UUID.randomUUID().toString().replace("-", ""));
    p.setTitle("Daily Update " + start.toLocalDate());
    p.setContent("...");
    p.setSource("scheduler");
    p.setPublishedAt(now);
    posts.save(p);
  }
}
```

这一实现虽然简短，但包含四个关键设计点。

### 2.1 用配置开关隔离保底任务

`@ConditionalOnProperty(prefix = "paperflow.daily-post", name = "enabled", havingValue = "true")` 不是装饰性注解，而是职责边界的一部分。它明确了两件事：

- 该任务默认不承担正式内容生产职责；
- 只有显式开启配置的环境才会注册该 Bean。

这样处理后，开发、演示、灰度环境可以获得稳定的占位内容，而生产主链路仍然可以由运营发布、脚本导入或自动生成流程单独负责。

### 2.2 用启动补偿覆盖定时任务空窗

如果只保留 `@Scheduled(cron = "0 0 9 * * *")`，那么服务在 09:00 之后启动时，当日任务会被直接跳过。`bootstrap()` 通过监听 `ApplicationReadyEvent` 再调用一次 `ensureDailyPost()`，等价于为定时任务增加了启动补偿。

这段实现的价值在于，调度语义被拆成两层：

- `bootstrap()` 负责“服务启动后立即补检一次”；
- `ensureDailyPost()` 负责“按固定节奏执行正式检查”。

两者共享同一套幂等逻辑，因此不会额外引入重复数据风险。

### 2.3 通过来源字段实现幂等判断

判断条件使用的是：

```java
if (posts.existsBySourceAndPublishedAtBetween("scheduler", start, end)) {
  return;
}
```

这里没有写成“今天存在任意帖子就跳过”，而是显式限定 `source=scheduler`。这个差异非常重要，因为它决定了保底数据与业务数据是否可区分：

- 业务帖子可以来自人工发布、批量导入或外部脚本；
- 保底帖子只认 `scheduler` 来源；
- 统计、清理和排障时，可以准确识别哪条内容属于兜底生成。

从数据库设计角度看，这相当于把“是否已执行过保底补偿”落在了可查询的业务字段上，而不是隐藏在内存状态或单独锁表中。

### 2.4 用 UTC 时间窗定义“当天”

`OffsetDateTime.now(ZoneOffset.UTC)`、`truncatedTo(ChronoUnit.DAYS)` 和 `plusDays(1)` 共同定义了一个 UTC 日窗。之所以不直接用字符串日期比较，是因为“今天”在分布式系统中并不是天然稳定的概念：

- 应用服务器可能与数据库处于不同时区；
- 不同环境对本地时区的配置可能不一致；
- 直接依赖数据库日期函数，容易导致测试与线上行为不一致。

使用 UTC 起止窗口后，`existsBySourceAndPublishedAtBetween` 的语义更明确，也为后续跨地域部署保留了余量。

## 3. 列表查询如何承接轻量互动字段

帖子列表在第一版上线后，很快就不再只是标题、摘要和时间。前端通常还会需要：

- 文章点赞数；
- 当前用户是否已点赞；
- 文章是否开启评论审核；
- 同一接口同时兼容匿名访问与登录访问。

PaperFlow 在 `PostsController` 中选择直接把这些轻量互动字段并入 `PostResponse`：

```java
private PostResponse toDto(PostEntity p, String userId) {
  return new PostResponse(
      p.getId(),
      p.getTitle(),
      p.getContent(),
      p.getSource(),
      p.getPublishedAt(),
      p.getCommentModerationEnabled(),
      likes.countByIdPostId(p.getId()),
      liked(userId, p.getId()),
      null,
      null
  );
}
```

这段代码可以拆开理解：

- `p.getCommentModerationEnabled()` 直接把帖子级审核策略暴露给前端；
- `likes.countByIdPostId(p.getId())` 返回实时点赞数；
- `liked(userId, p.getId())` 依据可选的 `X-User-Id` 计算用户态；
- `favorited` 与 `lastViewedAt` 在列表场景下暂不填充，因此保留为 `null`。

这样的返回结构有两个直接收益。

第一，列表页不需要额外请求 `/likes/count`、`/likes/me` 或独立的评论策略接口。第二，匿名与登录两种访问模式共用同一个 DTO，前端只需要判断字段是否为空，而不需要切换完全不同的接口模型。

## 4. “公开读取 + 可选登录态”的接口边界

`PostsController.list()` 和 `PostsController.get()` 都把 `X-User-Id` 设为可选请求头：

```java
@GetMapping
public ResponseEntity<Envelope<Object>> list(
    @RequestHeader(value = "X-Request-Id", required = false) String requestId,
    @RequestHeader(value = "X-User-Id", required = false) String userId,
    @RequestParam(value = "page[number]", required = false, defaultValue = "1") int pageNumber,
    @RequestParam(value = "page[size]", required = false, defaultValue = "20") int pageSize
) {
  ...
}
```

这意味着帖子查询接口的边界不是“游客接口”和“登录接口”两套并行实现，而是“一套公开接口，在登录态存在时补充个性化字段”。该设计在内容型产品中有较高的适用性，原因主要有三点：

- 匿名用户可直接浏览内容，降低访问门槛；
- 登录用户在不增加额外页面逻辑的情况下获得 `liked`、`favorited` 等增强信息；
- 接口数量保持稳定，后续联调成本更低。

进一步看，`liked()` 的实现也刻意保持为可空布尔值：

```java
private Boolean liked(String userId, String postId) {
  if (userId == null || userId.isBlank()) {
    return null;
  }
  return likes.existsByIdUserIdAndIdPostId(userId, postId);
}
```

未登录时返回 `null`，登录后返回 `true/false`。这比简单返回 `false` 更准确，因为它区分了“用户明确未点赞”和“当前请求没有用户身份”两种语义。

### 4.1 登录态保持设计的实际效果

在当前首发设计中，前端已接入 refresh 自动续期链路（启动刷新、401 自动刷新重放、定时刷新与回前台刷新），同时默认 access token TTL 设为 4 小时。  
这使“公开读取 + 可选登录态”这套边界在真实使用中更稳定：用户闲置后返回页面时，接口仍能尽量保持在登录语义下返回 `liked/favorited/lastViewedAt` 等字段，而不是频繁退化成匿名态。

## 5. 详情页中的读时聚合

帖子详情页是最容易产生接口碎片化的位置。进入详情页后，通常会同时需要正文、点赞状态、收藏状态、阅读足迹以及评论区数据。如果把这些信息全部拆成独立接口，前端需要维护的请求组合会迅速增加。

PaperFlow 在 `PostsController.get()` 中采用了“读时聚合”方式，在读取详情时顺带完成用户态补充：

```java
if (userId != null && !userId.isBlank()) {
  OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
  lastViewedAt = now;

  UserPostKey key = new UserPostKey(userId, postId);
  PostFootprintEntity fp = footprints.findById(key).orElse(null);
  if (fp == null) {
    fp = new PostFootprintEntity();
    fp.setId(key);
  }

  fp.setLastViewedAt(now);
  footprints.save(fp);
  favorited = favorites.existsByIdUserIdAndIdPostId(userId, postId);
}
```

这段逻辑包含两个值得单独说明的实现细节。

### 5.1 足迹写入采用 upsert 思路

`UserPostKey key = new UserPostKey(userId, postId)` 先构造复合主键，再通过 `footprints.findById(key).orElse(null)` 判断记录是否存在。如果不存在，就新建 `PostFootprintEntity` 并设置主键；无论新旧记录，最终都只更新 `lastViewedAt`。

这实际上是一种标准的应用层 upsert：

- 已有足迹时更新最近阅读时间；
- 首次访问时创建足迹记录；
- 主键由 `userId + postId` 组成，天然约束同一用户对同一帖子的唯一足迹。

### 5.2 收藏状态与足迹一起回填

在同一个登录态分支中，又执行了：

```java
favorited = favorites.existsByIdUserIdAndIdPostId(userId, postId);
```

这说明详情接口承担的不只是“返回正文”，还包括“补齐当前用户与该帖子的关系状态”。这样处理后，前端不必额外发起“查询是否收藏”的独立请求。

严格从 REST 语义看，`GET` 中伴随足迹更新属于一次轻量写操作；但如果目标是降低接口碎片化和联调成本，这种权衡是可接受的，而且非常常见。

## 6. 前端如何消费这条聚合链路

前端详情页的加载逻辑与后端设计是一一对应的。`PostDetailPage` 中直接并行请求帖子详情和评论列表：

```ts
const [p, c] = await Promise.all([
  apiGetPost(pid, accessToken, signal),
  apiListComments(pid, 1, 50, accessToken, signal)
]);
return { post: p, comments: c.items };
```

因为帖子接口已经回填了 `likeCount`、`liked`、`favorited`、`lastViewedAt` 等字段，前端不需要在初始渲染阶段额外拼接更多状态请求。

点赞交互同样保持了简单实现：

```ts
if (liked) {
  await apiUnlikePost(accessToken, post.postId);
} else {
  await apiLikePost(accessToken, post.postId);
}
reload();
```

这里没有做本地乐观更新，而是统一调用 `reload()` 重新拉取后端数据。这样做会牺牲一部分极致交互流畅度，但换来两个工程收益：

- 页面状态以服务端返回为准，点赞、收藏、评论等交叉状态不容易出现漂移；
- 接口仍在快速迭代时，问题定位和回放更直接。

对中早期项目而言，这种策略通常比过早引入复杂状态管理更稳健。

## 7. 这一阶段真正完成了什么

从功能表面看，这一阶段只是补齐了“每日帖子”和“帖子查询”。从链路角度看，它实际上完成了三项更关键的基础能力：

- 通过 `DailyPostJob` 解决了冷启动和演示环境的内容可用性问题；
- 通过 `PostResponse` 聚合轻量互动字段，建立了统一的读取模型；
- 通过详情接口的读时聚合，为评论、审核和治理能力预留了稳定入口。

这也是为什么本文没有把“内容生产”“内容查询”“内容互动”完全拆成三套孤立系统。对于仍在快速演进的内容平台，更有效的方式往往是先把读取链路做厚，再逐步把评论、审核和治理能力接进来。

## 8. 小结

PaperFlow 在内容互动链路的上半段，重点并不是功能数量，而是接口边界是否稳定。用一句话概括，这一阶段要回答的是三个工程问题：

- 系统在没有人工干预时，是否仍然能够稳定提供内容；
- 同一套帖子查询接口，是否能够同时覆盖匿名访问与登录访问；
- 帖子详情是否已经具备承接用户态互动信息的能力。

这三个问题解决之后，评论系统的设计空间会明显增大。下一篇将继续展开评论链路，包括最多 5 层评论树、`APPROVED + 我的待审/驳回` 可见性策略，以及评论审核与被回复通知如何形成闭环。
