# 43 评论展示最新资料联动与云端热修复技术文档

这篇文档记录 2026-06-21 这轮评论昵称头像联动的完整落地过程。它不只讲“前端改了个显示逻辑”，而是把本次真正踩到的 4 个关键点一起讲清楚：

- 为什么评论区之前只能显示 `userId` 派生名，改昵称后历史评论不会跟着变
- 为什么只在 `user-service` 补接口还不够，云端上线后仍然会失败
- 为什么线上真实数据会触发 `avatarUrl = null` 的接口报错
- 为什么这轮最终采用“小包热更新”，而不是继续传整仓库包

## 功能目标与边界

目标：

- 用户修改昵称后，历史评论展示最新昵称
- 用户修改头像后，历史评论展示最新头像
- 评论用户卡和消息中心评论相关展示统一跟随最新资料
- 保持最小公开原则，只暴露评论展示需要的资料字段

边界：

- 不做评论昵称/头像快照
- 不修改评论表结构
- 不在评论服务里冗余保存头像地址
- 不返回邮箱、手机号、角色、状态等敏感信息

## 问题根因

这次问题表面上是“评论区头像和昵称显示有问题”，但实际拆开后有 3 层根因：

1. 评论接口本身只有 `userId`，没有真实昵称和头像。
2. 前端评论区和消息中心只能基于 `userId` 做本地回退。
3. 云端真正上线后，还暴露出网关白名单和空头像兼容两个线上问题。

所以这不是单纯前端文案修一下就行，而是“用户服务公开资料接口 + 前端资料合并 + 网关放行 + 线上空值兼容”一整条链路一起收口。

## 最终实现

### 1. `user-service` 提供最小公开资料接口

这轮新增的最核心接口是：

- `GET /api/v1/public/users/{userId}`

实现文件：

- [PublicUserAssetsController.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/src/main/java/com/paperflow/user/api/PublicUserAssetsController.java)

接口只返回 3 个字段：

- `userId`
- `displayName`
- `avatarUrl`

实际实现没有继续使用 `Map.of(...)`，而是改成 `LinkedHashMap`，原因是线上真实用户可能出现 `avatarUrl = null`。`Map.of(...)` 不接受空值，云端第一次回查时就是在这里触发了 `500`。

核心实现思路：

```java
Map<String, Object> profile = new LinkedHashMap<>();
profile.put("userId", user.getId());
profile.put("displayName", user.getDisplayName());
profile.put("avatarUrl", user.getAvatarUrl());
```

这一步的意义是把“评论展示所需的真实资料”从用户服务里抽成一个最小公共出口，而不是让评论接口背更多用户字段。

### 2. 前端统一合并“评论用户卡 + 公开资料”

前端没有新增第二套评论展示接口，而是继续复用：

- `apiGetCommentUserCard(userId)`

实现文件：

- [api.ts](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/data/api.ts)

这次的关键变化是让它并行拉两路数据：

1. 评论服务里的用户卡片统计
2. 用户服务里的公开资料

然后按优先级合并：

```ts
return {
  ...card,
  displayName: profile?.displayName?.trim() || card.displayName,
  avatarUrl: profile?.avatarUrl ?? card.avatarUrl ?? null
};
```

这样做有两个好处：

- 评论用户卡原有的 `postCount`、`receivedLikeCount` 不用重做
- 昵称和头像统一升级为“优先显示最新公开资料”

### 3. 评论区渲染层改为优先显示真实头像和真实昵称

实现文件：

- [PostDetailPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PostDetailPage.tsx)
- [postDetailCommentUtils.ts](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/postDetailCommentUtils.ts)

评论区现在有两个明确的渲染入口：

```ts
const displayNameOfUser = (userId: string) => commentDisplayNameOf(userId, userCardCache[userId]?.displayName);
const avatarUrlOfUser = (userId: string) => userCardCache[userId]?.avatarUrl ?? null;
```

渲染规则也统一了：

1. 有 `avatarUrl` 就显示真实头像
2. 没有头像就回退到昵称首字母
3. 昵称也没有时，再回退到 `userId`

工具函数也同步改成“真实展示名优先”：

```ts
export function commentDisplayNameOf(userId: string, displayName?: string | null): string {
  const provided = (displayName ?? "").trim();
  if (provided) return provided;
  const raw = (userId ?? "").trim();
  if (!raw) return "用户";
  return raw.startsWith("u_") ? raw.slice(2) : raw;
}
```

这一步修掉的不只是“名字看起来不对”，还一起修掉了“无头像时首字母仍按 `userId` 算”的问题。

### 4. 消息中心不再单独维护一套回退逻辑

本次没有为消息中心重新做一套接口，而是继续复用 `apiGetCommentUserCard()`。

这样评论区、评论用户卡、消息中心这三处评论相关展示，就都落在同一套资料合并逻辑上，不会再出现一个地方显示昵称、另一个地方还是 `u_xxx` 的分裂状态。

### 5. 云端第一次验收暴露出网关白名单缺口

本地实现完成后，云端第一次验收并没有直接通过。

线上实际暴露的问题是：

- `/api/v1/public/users/{id}` 返回 `AUTH_MISSING_TOKEN`

说明虽然路由已经转发到了 `user-service`，但 `api-gateway` 的全局 JWT 过滤器并没有把这条路径当成匿名 GET。

修复文件：

- [JwtAuthGlobalFilter.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/java/com/paperflow/gateway/filter/JwtAuthGlobalFilter.java)

最终补上的关键判断是：

```java
path.startsWith("/api/v1/public/users/")
```

也就是说，设计阶段“网关路由已放行”并不等于“网关鉴权过滤器已放行”。这次线上问题就是在这两层之间暴露出来的。

### 6. 云端第二次验收暴露出空头像兼容问题

网关白名单修完之后，匿名访问问题解决了，但真实用户资料仍然报 `500`。

最终定位到：

- 数据里存在 `avatarUrl = null`
- `PublicUserAssetsController` 初版使用了 `Map.of(...)`
- `Map.of(...)` 在值为 `null` 时直接抛异常

这个问题只靠本地“有头像测试”是看不出来的，所以后面又补了一条“空头像用户也应返回 200”的集成测试，才把这个坑彻底锁住。

## 测试与验证

### 1. `user-service` 集成测试

文件：

- [PublicUserAssetsControllerIT.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/src/test/java/com/paperflow/user/api/PublicUserAssetsControllerIT.java)

覆盖点：

- 返回真实 `displayName` 和 `avatarUrl`
- `avatarUrl = null` 时仍然返回 `200`

### 2. `api-gateway` 过滤器测试

文件：

- [JwtAuthGlobalFilterTest.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/test/java/com/paperflow/gateway/filter/JwtAuthGlobalFilterTest.java)

覆盖点：

- `GET /api/v1/public/users/{id}` 在没有 Bearer Token 时也应继续放行

### 3. 前端评论展示工具测试

文件：

- [postDetailCommentUtils.test.ts](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/postDetailCommentUtils.test.ts)

覆盖点：

- 真实展示名优先
- 首字母优先基于真实昵称计算
- 没有资料时仍能正常回退

### 4. 云端回查

这轮最终做了 3 类云端回查：

- 前端入口是否还能正常访问
- 公开资料接口是否可匿名访问
- 真实用户资料是否能返回 `displayName`，并兼容 `avatarUrl = null`

回查结果说明：

- `frontend` 正常
- `/api/v1/public/users/{userId}` 已不再被网关拦截
- 真实用户资料可正常返回，空头像场景不再报错

## 发布策略调整

这轮还顺手调整了远端更新策略。

一开始沿用的是“整仓库打包上传 + 远端解压覆盖”，但实际遇到两个问题：

- SSH 交互认证会阻断脚本自动继续
- 整包上传耗时长，不利于快速回查线上问题

最终改成了“小包热更新”：

1. 只上传 `user-service` jar
2. 只上传前端 `dist`
3. 后续只补传 `api-gateway` jar
4. 远端 `docker cp` 覆盖后，只重启受影响容器

这套方式更适合这次“实现已完成，但需要快速修线上阻塞点”的场景。

## 验收结论

这轮评论资料联动最终不是单点修复，而是一次完整的端到端收口：

- `user-service` 提供最小公开资料接口
- 前端统一合并评论卡片与最新资料
- 评论区、用户卡、消息中心走同一套显示逻辑
- 网关补齐匿名白名单
- 空头像场景补齐线上兼容
- 发布策略切到更轻量的热更新路径

到这一步，评论相关展示已经具备“跟随最新昵称和头像”的技术基础，后续只需要再补一轮带登录态的页面级联动验收，就能把这条链路彻底闭环。

## 常见坑

- 只看评论接口会误以为问题在前端
  - 实际根因是评论接口只有 `userId`，必须补公开资料来源
- 路由放行不等于鉴权放行
  - `application.yml` 里能路由过去，不代表 `JwtAuthGlobalFilter` 不会拦
- 本地 200 不代表线上真实数据也能过
  - `avatarUrl = null` 这种问题通常要到真实云端数据才会暴露
- 整包发布不一定最稳
  - 这类小范围热修复更适合“小包上传 + 定向重启”
