# 从每日任务到后台权限，我们怎么做上线后的业务验收和日常巡检

> 摘要：项目真正发到云上之后，只确认服务活着还远远不够。对 PaperFlow 这类内容型系统来说，上线后的关键问题很快会变成另一组：每日任务有没有继续产出内容，评论审核到通知这条业务闭环有没有真正跑通，管理员页面是不是既能被管理员正常使用，又不会被普通用户绕过去。结合原来的定时任务巡检、评论审核通知验收、后台权限链检查三部分内容，本文把它们收成一篇更完整的复盘，整理我们是怎么判断系统“不只是能打开，而是真的在工作”的。文中的账号、凭证、远端路径和部署细节都只保留结构示意，不直接暴露真实环境信息。
>
> 标签：业务验收｜定时任务｜评论审核｜通知系统｜管理员权限｜大学生项目

很多学生项目在真正部署之后，最容易停留在一个看起来已经不错、但其实还不够稳的状态：

- 页面能打开；
- health 接口是绿的；
- 帖子列表也能返回；
- 于是就觉得“系统应该已经上线成功”。

但如果系统里已经有下面这些能力：

- 每日内容更新；
- 评论审核；
- 通知提醒；
- 管理员后台；

那只看页面和 health，其实远远不够。

PaperFlow 后来做下来，我们越来越觉得：  
上线后的确认不能只看“技术链路活着”，还要看“业务是不是继续在工作”。

## 1. 对内容型系统来说，“服务活着”和“每天有新内容”不是一回事

这件事是我们做每日任务之后感受最深的一点。

如果系统承诺的是“每天更新内容”，那上线之后真正该问的就不只是：

- 前端能不能打开；
- 网关是不是健康；
- 接口能不能返回；

你还得继续问：

- 今天有没有新增内容；
- 每个主题是不是都按预期产出；
- 上传有没有失败；
- 有没有重复内容被塞进去；
- 定时任务到底是没跑，还是跑了但没产出。

也就是说，到了这一步，系统健康已经不只是“接口健康”，而是“业务运行健康”。

## 2. 我们把每日内容更新理解成一条流水线，而不是一个脚本

从现有脚本看，PaperFlow 的每日内容流程其实已经是一条小型流水线，而不是单独一个批处理命令。

它大致会经过这些步骤：

```text
拉取线上现状
  -> 准备待审核内容
  -> 批量做 review 判定
  -> 把 APPROVED 项上传到业务系统
  -> 记录 ok / fail / skip 结果
  -> 更新状态文件
  -> 再回头检查线上总量和重复情况
```

像 `run-topic-daily.ps1` 一开始就会先看线上现状：

```powershell
$start = GetTopicStats -baseUrl $BaseUrl -sourceName $source
Write-Host ("START topic={0} count={1} dup={2}" -f $Topic, $start.count, $start.dup)
if ($start.dup -gt 0) { throw "duplicate titles exist online, please clean duplicates first" }
```

后面再准备 review 数据、筛出可上传项，最后调用上传脚本：

```powershell
& (Join-Path $root "upload-reviewed-papers.ps1") `
  -BaseUrl $BaseUrl `
  -Email $Email `
  -Password $Password `
  -ReviewJsonPath $review `
  -Source $source `
  -StatePath $StatePath
```

这说明任务真正要完成的，不只是“本地脚本跑了一次”，而是：

- 内容被准备出来；
- review 做完；
- 可上传数据被筛出来；
- 上传真的写进业务系统；
- 结果还能被后续巡检追踪到。

## 3. 任务有没有产出，我们不只看日志，还看留下了哪些证据

这是我们后来越来越重视的一点。

很多时候别人会说：

- cron 配好了；
- 脚本也确实在跑；
- 日志看着也一直在刷。

但这些都不等于真的有内容进入系统。

PaperFlow 这里比较好的地方是，上传脚本会把结果落成三类 CSV：

```powershell
$okPath = Join-Path $outDir ($prefix + "-ok-" + $ts + ".csv")
$failPath = Join-Path $outDir ($prefix + "-fail-" + $ts + ".csv")
$skipPath = Join-Path $outDir ($prefix + "-skip-" + $ts + ".csv")
```

这三类产物非常有用，因为它们把任务结果从“控制台输出”变成了可追踪的记录：

- `ok` 表示真正写进系统的内容；
- `fail` 表示上传失败的条目；
- `skip` 表示被去重或被状态跳过的条目。

只要这些文件还在，你就能回头回答很多很实际的问题：

- 这次任务到底做了什么；
- 为什么今天只上了几篇，不是预期数量；
- 是 review 阶段卡住了，还是上传阶段被跳过了。

## 4. 锁文件和状态文件看起来不起眼，但它们决定任务会不会越跑越乱

在 `run-topic-daily.ps1` 里，有两类文件特别关键：

- 锁文件；
- 状态文件。

锁文件的作用很直白，就是防止同一主题任务重复并发执行：

```powershell
if (Test-Path $LockFile) {
  $lockAgeMinutes = ((Get-Date) - (Get-Item $LockFile).LastWriteTime).TotalMinutes
  if ($lockAgeMinutes -gt $lockTtlMinutes) {
    Remove-Item -Force $LockFile
  } else {
    throw "$Topic daily job already running"
  }
}
```

而状态文件则是另一层防重：

```powershell
$state = LoadState -path $StatePath
$state.sourceIds = @($knownSourceIds.Keys | Sort-Object)
SaveState -path $StatePath -state $state
```

这类设计平时看起来不显眼，但一旦没有它们，系统很快就会开始：

- 重复发相同内容；
- 同一主题任务并发跑两次；
- 日志看起来挺热闹，但线上内容开始变脏。

对学生团队来说，这种“先把最容易乱的地方收住”的设计特别实用。

## 5. 真正决定内容有没有落地的，其实是上传阶段

很多人容易把“中间 JSON 生成成功”误当成“任务完成成功”。  
但在 PaperFlow 这里，最终是否真正落地，还是取决于上传脚本。

`upload-reviewed-papers.ps1` 的关键动作是：

```powershell
$login = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/v1/auth/login" ...
$token = $login.data.accessToken
```

拿到 token 之后，再调用真实业务接口：

```powershell
$res = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/v1/papers/ingest" -Headers @{ Authorization = "Bearer $token" } ...
```

也就是说，这条每日任务链最终还是要回到正式业务系统里：

- 先登录；
- 再带认证头；
- 调真实业务 API；
- 拿到真实返回。

这一点特别重要，因为它说明每日任务不是在“自说自话”，而是在走真实线上入口。  
任务是否成功，本身就能反向验证：

- 登录接口是否正常；
- 受保护的 ingest 接口是否正常；
- 业务系统写入链路是否正常。

## 6. 但系统稳定不只看每日任务，我们还需要一条真实业务闭环来做验收

如果说每日任务是在验证“系统有没有持续产出内容”，那评论审核到消息中心这条链，就是在验证“系统里的互动业务到底有没有真正跑通”。

这条链在 PaperFlow 里很完整：

```text
普通用户发表评论
  -> 评论进入待审核状态或直接发布
  -> 管理员在评论管理页处理状态
  -> 后端根据状态变化决定是否生成通知
  -> 被回复用户在消息中心看到结果
  -> 用户再跳回帖子详情页查看上下文
```

这条链特别适合拿来做上线验收，因为它同时覆盖了：

- 前端登录态；
- 管理端入口；
- 审核接口；
- 状态写回；
- 通知生成；
- 消息中心读取；
- 页面上下文跳转。

也就是说，它不是“某一个页面的功能测过了”，而是一条真正横跨前端、网关、后端和业务规则的闭环。

## 7. 评论审核真正验证的是“管理员身份”和“状态写回”

前端管理路由里，评论管理页是通过 `RequireAdmin` 包起来的：

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

页面本身也支持比较完整的审核动作：

- 按 `PENDING / APPROVED / REJECTED` 切换；
- 单条通过或驳回；
- 当前页批量通过或驳回；
- 联动切换文章评论审核策略。

后端对应的管理接口在 `AdminController.java`，更新状态时会先做管理员角色校验：

```java
if (!isAdmin(roles)) {
  return ResponseEntity.status(403).body(Envelope.err(..., "AUTH_FORBIDDEN", "Admin required", ...));
}
```

真正写回状态的动作则是：

```java
String before = c.getStatus();
c.setStatus(req.status());
comments.save(c);
```

这一步特别关键。  
因为如果前端点了“通过”，但这里没有成功写回，那么后面的通知链也就不会成立。

## 8. 真正让这条链变得有价值的，是“审核通过后是否触发通知”

PaperFlow 这里有个很适合拿来做验收的细节：

```java
if (!"APPROVED".equals(before) && "APPROVED".equals(c.getStatus())) {
  notifications.notifyReplyIfNeeded(c);
}
```

也就是说，通知不是每次状态变动都发，而是满足特定条件才触发：

- 原来不是 `APPROVED`
- 现在变成了 `APPROVED`

这个规则很有业务意义，因为它避免了：

- 已通过评论重复审核时重复发通知；
- 驳回状态变化时误发通知；
- 不该产生通知的评论也被误判成通知事件。

从验收角度看，这比“接口返回 200”更有价值。  
因为它开始验证系统是不是按预期执行了业务规则。

## 9. 消息中心是这条链在用户侧的终点

通知生成之后，前端消息中心页就成了用户侧最直观的观察点。

它的路由是：

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

页面读取的是：

```ts
apiListNotifications(accessToken, pageNumber, pageSize, signal)
```

这意味着当我们去做业务闭环验收时，可以直接走一条真实用户路径：

1. 普通用户发表评论  
2. 管理员在后台审核  
3. 被回复用户打开消息中心  
4. 查看通知是否出现  
5. 再跳回帖子详情页看上下文

如果这条链能顺利跑完，基本就说明：

- 评论写入链是通的；
- 管理端权限链是通的；
- 通知业务规则是对的；
- 用户侧感知链也已经成立。

## 10. 管理员后台这部分，还必须单独验证“前端限制”和“后端角色校验”是不是同时成立

只看评论审核页面能不能打开，其实还不够。  
因为管理端天然就有另一类风险：

- 前端页面拦住了，但接口其实裸奔；
- 普通用户界面上进不去后台，但直接调接口还能改数据；
- 页面入口和后端权限判断并不一致。

PaperFlow 里，前端第一层保护是路由守卫：

```tsx
if (auth.state.status !== "authenticated") {
  return <Navigate to="/login" replace />;
}
if (!auth.state.roles.includes("ADMIN")) {
  return <Navigate to="/posts" replace />;
}
```

顶部导航也只会在管理员登录时显示后台入口：

```tsx
const isAdmin = auth.state.status === "authenticated" ? auth.state.roles.includes("ADMIN") : false;
```

但真正不能省掉的，是后端第二层角色校验。  
管理接口仍然会继续判断角色信息：

```java
@RequestHeader(value = "X-User-Roles", required = false) String roles
if (!isAdmin(roles)) {
  return ResponseEntity.status(403).body(Envelope.err(...));
}
```

这才是一条完整的权限链。

## 11. 所以上线后的日常巡检，我们最后会落回三件事

回头看这次实践，我们最后沉淀下来的上线后检查，其实可以收成 3 类问题。

第一类，看系统是不是还在持续产出：

- 每日任务有没有继续跑；
- 每个主题是不是还在正常出内容；
- 有没有重复标题、重复上传或掉量。

第二类，看真实业务是不是还在工作：

- 评论能不能创建；
- 管理员能不能正确审核；
- 通知是不是在正确时机生成；
- 用户能不能在消息中心真正看到结果。

第三类，看后台权限是不是还是闭环的：

- 普通用户是否还能看到后台入口；
- 普通用户是否能直接调后台接口；
- 管理员是否既能进页面也能调接口；
- 前端限制和后端限制是否保持一致。

这三类问题合在一起，才更接近“系统上线以后到底是不是稳定可用”。

## 12. 最后

如果把这次上线后的经验压缩成一句话，我们现在会更倾向于这样理解：

> 真正可用的系统，不只是服务活着，而是内容还在继续产出、业务闭环还能跑通、后台权限也没有漏。

对 PaperFlow 来说，这 3 件事分别对应：

- 每日任务和巡检；
- 评论审核到消息中心的业务闭环；
- 管理员页面和后台接口的权限链。

这也是为什么我们后来不再满足于“页面能打开”和“health 是绿的”。  
对大学生团队来说，能把这些更贴近真实使用的检查真正做起来，才算是项目从“能演示”往“能运行”迈出去的一步。
