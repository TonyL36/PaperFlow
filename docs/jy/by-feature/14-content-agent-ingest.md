# 14 内容服务：演示用“Agent 推送帖子”接收接口（落库闭环）

本章描述一个用于演示的最小闭环：模拟“外部 Agent/任务调度器”把帖子推送给内容服务，内容服务完成落库后，前端即可通过 `/posts` 列表与详情页展示。

注意：这不是生产级开放接口。它默认关闭，并且可选 token 保护，主要用于本地演示与自动化测试。

## 功能目标与边界

目标：

- 让你在不实现 5 个 agent 的前提下，仍能演示“发送→接收→存储→展示”的端到端流程
- 支持幂等：相同 `postId` 重复推送不会产生重复帖子
- 默认关闭：避免把演示接口暴露到非预期环境

边界：

- 不涉及网关鉴权（JWT）与角色控制，这条接口属于“内部演示接口”
- 不做复杂的内容校验/富文本清洗（演示数据自行保证质量）

## 端到端行为（从 SPA 视角）

1) 外部模拟方（脚本/测试）请求网关：

- `POST /api/v1/internal/agent/posts`
- 网关转发到内容服务：`POST http://content-service:8082/api/v1/internal/agent/posts`

2) 内容服务：

- 若未启用演示开关：返回 `404 RES_NOT_FOUND`
- 若启用了 token 且 token 不匹配：返回 `403 AUTH_FORBIDDEN`
- 若 `postId` 已存在：返回 `200`，并返回已存在的帖子
- 若 `postId` 不存在：落库并返回 `201`

3) 前端：

- `GET /api/v1/posts` 列表页出现新帖子
- `GET /api/v1/posts/{postId}` 详情页可展示正文

## API 概览

- `POST /api/v1/internal/agent/posts`

请求 body：

```json
{
  "postId": "post_demo_manual_001",
  "userId": "u_agent_001",
  "title": "Demo Title",
  "content": "# Hello\n- item 1\n- item 2",
  "source": "agent-demo",
  "publishedAt": "2026-03-16T00:00:00Z"
}
```

约束：

- `postId` 可省略：服务端会生成 `post_demo_<uuid>`
- `publishedAt` 可省略：服务端使用当前时间
- `source` 为演示来源字段（例如 `agent-demo`）

## 关键代码原文 + 解读

### 14.1 接收接口：AgentIngestController

代码位置：[AgentIngestController.java](file:///f:/Gitee/PaperFlow/paperflow/backend/services/content-service/src/main/java/com/paperflow/content/api/AgentIngestController.java)

核心逻辑（节选）：

```java
@PostMapping("/posts")
public ResponseEntity<Envelope<PostResponse>> ingestPost(
    @RequestHeader(value = "X-Request-Id", required = false) String requestId,
    @RequestHeader(value = "X-Demo-Ingest-Token", required = false) String token,
    @Valid @RequestBody IngestPostRequest req
) {
  if (!props.isEnabled()) {
    return ResponseEntity.status(404).body(Envelope.err(safeRequestId(requestId), "RES_NOT_FOUND", "Endpoint not enabled", java.util.Map.of()));
  }
  String expected = props.getToken();
  if (expected != null && !expected.isBlank()) {
    if (token == null || token.isBlank() || !expected.equals(token)) {
      return ResponseEntity.status(403).body(Envelope.err(safeRequestId(requestId), "AUTH_FORBIDDEN", "Forbidden", java.util.Map.of()));
    }
  }

  String postId = normalizePostId(req.postId());
  PostEntity existing = posts.findById(postId).orElse(null);
  if (existing != null) {
    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        toDto(existing),
        List.of(new Link("self", "/api/v1/posts/" + existing.getId(), Optional.of("GET"), Optional.empty()))
    ));
  }

  PostEntity p = new PostEntity();
  p.setId(postId);
  p.setTitle(req.title());
  p.setContent(req.content());
  p.setSource(req.source());
  p.setPublishedAt(req.publishedAt() == null ? OffsetDateTime.now() : req.publishedAt());
  posts.save(p);

  return ResponseEntity.status(201).body(Envelope.ok(
      safeRequestId(requestId),
      toDto(p),
      List.of(new Link("self", "/api/v1/posts/" + p.getId(), Optional.of("GET"), Optional.empty()))
  ));
}
```

逐段解释：

- “默认关闭”：
  - `if (!props.isEnabled())` 直接返回 404，而不是 403/401
  - 好处是：不开启时对外看起来就像不存在这个接口（减少误用与扫描风险）
- “可选 token 保护”：
  - `paperflow.demo-ingest.token` 配置为空：不校验 token
  - 配置不为空：要求请求头 `X-Demo-Ingest-Token` 完全匹配，否则 `403 AUTH_FORBIDDEN`
- “幂等”：
  - 以 `postId` 为唯一键：查到已有记录就直接返回 200，并返回已存在的帖子
  - 这样你可以反复执行演示脚本，不会越跑数据越多
- “落库与回读链接”：
  - 新建时返回 201，并附上 `self` link 指向 `/api/v1/posts/{id}`，便于前端/脚本继续链路验证

### 14.2 配置开关：DemoIngestProperties

代码位置：[DemoIngestProperties.java](file:///f:/Gitee/PaperFlow/paperflow/backend/services/content-service/src/main/java/com/paperflow/content/config/DemoIngestProperties.java)

```java
@Component
@ConfigurationProperties(prefix = "paperflow.demo-ingest")
public class DemoIngestProperties {
  private boolean enabled;
  private String token;
  // getter/setter
}
```

解释：

- 使用 `@ConfigurationProperties` 而不是散落的 `@Value`，目的是让演示开关集中、可读、可测试。
- `enabled=false` 时（默认），接口返回 404。

### 14.3 请求 DTO：IngestPostRequest

代码位置：[IngestPostRequest.java](file:///f:/Gitee/PaperFlow/paperflow/backend/services/content-service/src/main/java/com/paperflow/content/api/dto/IngestPostRequest.java)

```java
public record IngestPostRequest(
    String postId,
    String userId,
    @NotBlank @Size(min = 1, max = 255) String title,
    @NotBlank @Size(min = 1, max = 20000) String content,
    @NotBlank @Size(min = 1, max = 64) String source,
    OffsetDateTime publishedAt
) {}
```

解释：

- `title/content/source` 走 Bean Validation，避免“演示脚本推了空数据但看起来是成功”。
- `postId/publishedAt` 可空，便于脚本快速造数据。
- `userId` 用于与外部 Agent 侧用户标识对齐，会落库到 `pf_post.author_user_id`。

ID 约定：

- `postId` 由调用方传入时，内容服务会直接作为本地主键写入，实现“外部 Agent 与本地共用一个文章 ID”。
- 当 `postId` 为空时，服务端自动生成 `post_demo_<uuid>`。

## 测试：模拟发送/接收/展示闭环

我们不实现 5 个 agent，只用集成测试模拟发送与接收过程，保证“推送→落库→列表/详情可查”。

测试位置：[AgentIngestControllerIT.java](file:///f:/Gitee/PaperFlow/paperflow/backend/services/content-service/src/test/java/com/paperflow/content/api/AgentIngestControllerIT.java)

测试覆盖点（摘述）：

- 第一次推送 → `201 Created`
- 第二次同 `postId` 推送 → `200 OK`（幂等）
- 缺少 token → `403 AUTH_FORBIDDEN`
- `GET /api/v1/posts/{id}` 可查到 `source=agent-demo`
- `GET /api/v1/posts` 列表包含该 postId

## 演示请求（PowerShell）

前提：

- 网关运行在 `http://localhost:3151`
- 内容服务已配置开启（仅用于演示环境）：
  - `paperflow.demo-ingest.enabled=true`
  - `paperflow.demo-ingest.token=your-token`（可选）

请求：

```powershell
$base = "http://localhost:3151/api/v1"
$body = @{
  postId = "post_demo_manual_001"
  title = "Demo: 外部推送到内容服务"
  content = "# 标题\n- 列表项1\n- 列表项2\n\n> 这是一个引用块。\n\n```text\nhello\n```"
  source = "agent-demo"
  publishedAt = "2026-03-16T00:00:00Z"
} | ConvertTo-Json

Invoke-RestMethod -Method POST `
  -Uri "$base/internal/agent/posts" `
  -Headers @{ "X-Request-Id" = "rid-demo"; "X-Demo-Ingest-Token" = "your-token" } `
  -ContentType "application/json" `
  -Body $body
```

## 常见坑与排查

- 404：`RES_NOT_FOUND Endpoint not enabled`
  - 原因：未开启 `paperflow.demo-ingest.enabled`
  - 排查：确认内容服务配置与启动参数
- 403：`AUTH_FORBIDDEN`
  - 原因：配置了 token 但请求头缺失/不匹配
  - 排查：确认 `paperflow.demo-ingest.token` 与 `X-Demo-Ingest-Token`
- 推送成功但前端看不到
  - 排查路径：
    1) 先用网关查 `GET /api/v1/posts?page[number]=1&page[size]=50`
    2) 如果能查到但前端没有：检查前端是否走 `/api` 代理、是否仍在旧页面缓存
    3) 如果查不到：确认网关路由到 content-service 是否正常（网关 logs + content-service logs）

## API 文档如何更新

该接口会被现有 apidoc 插件扫描生成到：

- `docs/generated/content-service-api.md`

生成方式：在仓库根目录执行 `mvn verify`（Windows 可用脚本包装），注意生成时不要占用正在运行的 jar 文件（否则 repackage 可能无法重命名）。
