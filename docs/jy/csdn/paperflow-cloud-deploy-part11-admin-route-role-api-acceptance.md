# 管理员页面上线后不能只测能不能进：我们怎么把前端限制和后端角色校验一起验掉

> 摘要：很多系统做到管理端时，容易把验收理解成“后台页面能打开、按钮能点击”。但对真正上线的系统来说，管理员链路至少包含两层保护：前端路由限制和后端角色校验。PaperFlow 当前的评论管理、文章评论策略管理就已经具备这条链路：普通用户在前端进不去管理页，管理员才能访问页面；即使绕过前端直接调接口，后端也会继续根据角色信息做 `ADMIN` 判断。本文结合真实路由、导航和后端控制器，整理我们是怎么把这条权限链一起验掉的。文中只讨论角色链路和接口校验逻辑，不涉及任何真实账号、凭证或敏感部署信息。
>
> 标签：管理员权限｜角色校验｜React Router｜Spring Boot｜上线验收｜大学生团队项目

在很多大学生团队做项目的时候，管理端通常是后期才补上的。  
先说明一下，这篇只讲权限链怎么设计、怎么验收，不会放真实管理员账号、令牌或者任何敏感信息。  
也正因为如此，它特别容易出现一种情况：

- 页面做出来了；
- 接口也能调；
- 但权限链其实还没有真正闭环。

比如常见的问题就包括：

- 普通用户也能进管理页；
- 前端页面拦住了，但接口仍然裸奔；
- 页面显示正常，但角色不是管理员时没有正确返回错误；
- 管理端和业务端对权限的理解不一致。

所以管理端上线之后，真正需要验收的不是某一个按钮，而是一整条权限链。

对我们这个 PaperFlow 学生项目来说，这条链已经比较清楚了，主要体现在两块：

- 评论管理
- 文章评论审核策略管理

## 1. 前端第一层保护，其实不是按钮禁用，而是路由守卫

PaperFlow 前端应用路由在：

```text
apps/paperflow-web/src/ui/App.tsx
```

评论管理页和文章审核策略页，都是通过 `RequireAdmin` 包起来的：

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

```tsx
<Route
  path="/admin/posts/moderation"
  element={
    <RequireAdmin>
      <AdminPostModerationPage />
    </RequireAdmin>
  }
/>
```

`RequireAdmin` 本身的逻辑也很直接：

```tsx
if (auth.state.status !== "authenticated") {
  return <Navigate to="/login" replace />;
}
if (!auth.state.roles.includes("ADMIN")) {
  return <Navigate to="/posts" replace />;
}
```

这一步的意义在于：

- 未登录用户直接回登录页；
- 已登录但不是管理员的用户直接回普通页面；
- 只有管理员才有资格真正进入管理页面。

所以从前端视角看，管理能力不是“所有人都能看到，再根据按钮状态区分”，而是先从路由层就做了访问限制。

## 2. 顶部导航只对管理员显示，说明页面入口本身已经做了角色区分

顶部导航在：

```text
apps/paperflow-web/src/ui/layout/TopNav.tsx
```

里面先根据当前登录态判断：

```tsx
const isAdmin = auth.state.status === "authenticated" ? auth.state.roles.includes("ADMIN") : false;
```

只有 `isAdmin` 为真时，才会显示这些入口：

```tsx
<NavLink to="/admin/users">
  <NavTile icon="🧑‍⚖️" label="Users" />
</NavLink>
<NavLink to="/admin/comments">
  <NavTile icon="🛡️" label="Comment Review" />
</NavLink>
<NavLink to="/admin/posts/moderation">
  <NavTile icon="🧩" label="Post Policy" />
</NavLink>
```

这层虽然看起来像 UI 细节，但上线验收时也值得专门验证。  
因为它能回答一个很实际的问题：

> 系统是否已经把“普通用户入口”和“管理员入口”区分开了。

如果这一步没有做对，用户即使进不去后台，也可能会看到一堆本不该出现的管理入口，体验会很混乱。

## 3. 但管理链路真正不能省掉的，是后端第二层角色校验

只靠前端路由和导航并不安全。  
因为任何人都可以尝试直接调接口。

PaperFlow 后端管理接口在：

```text
backend/services/content-service/src/main/java/com/paperflow/content/api/AdminController.java
```

评论列表接口：

```java
@GetMapping("/comments")
```

评论状态更新接口：

```java
@PatchMapping("/comments/{commentId}")
```

文章评论策略更新接口：

```java
@PatchMapping("/posts/{postId}/comment-moderation")
```

而这些接口都会先判断：

```java
if (!isAdmin(roles)) {
  return ResponseEntity.status(403).body(Envelope.err(..., "AUTH_FORBIDDEN", "Admin required", ...));
}
```

其中 `roles` 来自请求头：

```java
@RequestHeader(value = "X-User-Roles", required = false) String roles
```

这就意味着，后端并不信任“前端已经拦过了”，而是仍然会独立判断角色。  
这才是一条完整的管理权限链。

## 4. 角色判断本身其实很朴素，但正因为朴素才适合大学生团队项目

`AdminController` 里的管理员判断没有设计得很复杂：

```java
private boolean isAdmin(String roles) {
  if (roles == null || roles.isBlank()) {
    return false;
  }
  for (String r : roles.split(",")) {
    if ("ADMIN".equalsIgnoreCase(r.trim())) {
      return true;
    }
  }
  return false;
}
```

这段逻辑虽然简单，但很适合当前阶段的大学生团队项目：

- 规则清楚；
- 成本低；
- 可读性高；
- 足够支撑管理员角色校验。

而且从验收角度看，它也非常容易验证：

- `roles` 为空时应该拒绝；
- `roles` 不含 `ADMIN` 时应该拒绝；
- `roles` 含 `ADMIN` 时应该通过。

这类规则越清楚，越适合在老师看我们项目的时候说明“为什么权限控制是闭环的”。

## 5. 管理端验收不能只测“能进页面”，还要测“接口拒绝是否正确”

如果只测前端页面，很容易遗漏一种情况：

- 普通用户界面上进不去后台；
- 但只要直接发请求，接口依然能改数据。

这类问题在真正上线后会非常危险。  
所以管理链路至少要分成两组测试：

第一组是前端页面测试：

- 未登录访问 `/admin/comments`，应跳转到 `/login`
- 普通用户访问 `/admin/comments`，应跳转到 `/posts`
- 管理员访问 `/admin/comments`，应正常进入页面

第二组是后端接口测试：

- 不带管理员角色调用 `/api/v1/admin/comments`，应返回 `403`
- 不带管理员角色调用 `/api/v1/admin/comments/{id}`，应返回 `403`
- 不带管理员角色调用 `/api/v1/admin/posts/{postId}/comment-moderation`，应返回 `403`

只有这两组都通过，才能说明“页面限制”和“接口限制”是一致的。

## 6. 评论管理页本身还适合拿来验证“角色 + 业务”是否同时成立

`AdminCommentsPage.tsx` 这页不只是一个后台列表，它实际上已经把几类操作都放在一起了：

- 查询待审核评论；
- 批量通过或批量驳回；
- 单条通过或驳回；
- 切换某篇文章的评论审核策略。

例如页面中批量通过的逻辑就是：

```ts
for (const commentId of selectedPendingIds) {
  await apiAdminUpdateCommentStatus(accessToken, commentId, nextStatus);
}
```

单条策略切换则会调用：

```ts
await apiAdminUpdatePostCommentModeration(accessToken, post.postId, !moderationEnabled);
```

这说明管理端验收还不只是权限问题，它已经连到具体业务规则里去了。  
也就是说，管理员链路可以同时验证两件事：

- 管理员是否真的有权限
- 管理员的操作是否真的改变了业务状态

这对大学生团队来说是很实用的一种验收样本。

## 7. 文章评论策略这类功能，特别适合用来说明“权限控制不是一次性的”

`AdminController` 里，文章评论策略更新接口是：

```java
@PatchMapping("/posts/{postId}/comment-moderation")
```

真正写回的是：

```java
post.setCommentModerationEnabled(req.commentModerationEnabled());
posts.save(post);
```

这类功能很适合展示一个事实：

> 管理员权限不是只用在“查看后台页面”，而是会持续影响系统后续业务行为。

比如某篇文章如果改成“需要审核”，后续评论就会进入审核流；  
如果改成“直接发布”，后续评论路径又会变化。

因此这类接口的验收不只是“按钮点了返回 200”，还应该继续观察：

- 页面状态文案是否同步变化；
- 同一篇文章后续评论是否走了不同路径；
- 管理设置是否真的影响后续业务。

## 8. 对我们这个学生团队来说，管理端上线的核心不是“做一个后台”，而是把边界讲清楚

从当前实现看，PaperFlow 这条管理链的边界已经比较清楚：

- 普通用户只看到普通入口；
- 管理员才看到后台入口；
- 前端通过路由守卫拦住非管理员；
- 后端再次通过角色判断拦住非法请求；
- 管理操作再去影响实际业务状态。

这条边界越清楚，系统越容易维护，也越容易解释。  
对大学生团队来说，这一点其实很重要，因为老师往往不只看“做了多少功能”，也会看“有没有基本的系统边界意识”。

## 9. 一套更稳妥的最小验收清单，可以这样设计

如果把管理员链路收成一份最小验收清单，可以按这个顺序走：

1. 未登录访问 `/admin/comments`，确认跳到登录页  
2. 普通用户登录后访问 `/admin/comments`，确认跳回普通页面  
3. 管理员登录后访问 `/admin/comments`，确认页面加载成功  
4. 管理员切换状态筛选，确认能拿到 `PENDING / APPROVED / REJECTED` 数据  
5. 管理员通过一条待审核评论，确认页面刷新后状态变化  
6. 管理员切换某篇文章的评论审核策略，确认页面文案同步变化  
7. 非管理员直接调后台接口，确认返回 `403`  
8. 管理员直接调后台接口，确认返回正常数据

这份清单不复杂，但已经足够覆盖：

- 登录态
- 页面权限
- 接口权限
- 管理动作
- 业务状态变化

## 10. 最后

管理员页面上线之后，真正应该验收的不是“后台有没有做出来”，而是：

- 页面入口有没有区分角色；
- 路由有没有拦住非管理员；
- 接口有没有继续做角色校验；
- 管理动作有没有真实影响业务状态。

对我们这个 PaperFlow 学生项目来说，这条链路已经不只是一个管理页面，而是一套比较完整的权限闭环。  
如果这条链能稳定跑通，那么系统在“角色分层”和“管理边界”上就已经比很多只停留在演示层的大学生团队项目更完整了一步。
