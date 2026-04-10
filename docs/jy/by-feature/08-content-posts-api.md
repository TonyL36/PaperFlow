# 08 内容服务：帖子查询 API（列表 / 详情）

## 功能目标

- 给 React SPA 提供“每日更新”页面的数据源
- 支持分页查询最近帖子（倒序）
- 支持按 `postId` 查询单条详情
- 支持帖子点赞/取消点赞
- 支持基于登录态返回个性化字段（`liked/favorited/lastViewedAt`）
- 响应遵循统一 Envelope + 最小 HATEOAS links

## API 概览

- `GET /api/v1/posts?page[number]=1&page[size]=20`
- `GET /api/v1/posts/{postId}`
- `POST /api/v1/posts/{postId}/like`（需要登录）
- `DELETE /api/v1/posts/{postId}/like`（需要登录）

## 当前实现补充（与早期版本差异）

- 列表与详情均接收可选 `X-User-Id`：
  - 返回 `liked`（当前用户是否点赞）
  - `likeCount` 为实时聚合值
- 详情接口在登录态下会写入足迹：
  - 自动 upsert `post_footprints`
  - 返回 `favorited` 与 `lastViewedAt`
- 点赞接口是幂等行为：
  - 重复点赞不会报错
  - 取消点赞在不存在时同样返回成功

## 关键代码原文 + 解读

代码位置：[PostsController.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/api/PostsController.java)

```java
@RestController
@RequestMapping("/posts")
public class PostsController {
  private final PostRepository posts;

  @GetMapping
  public ResponseEntity<Envelope<Object>> list(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestParam(value = "page[number]", required = false, defaultValue = "1") int pageNumber,
      @RequestParam(value = "page[size]", required = false, defaultValue = "20") int pageSize
  ) {
    int pn = Math.max(1, pageNumber);
    int ps = Math.min(200, Math.max(1, pageSize));
    List<PostResponse> items = posts.listRecent(PageRequest.of(pn - 1, ps)).stream().map(this::toDto).toList();

    var data = new java.util.LinkedHashMap<String, Object>();
    data.put("items", items);
    data.put("page", java.util.Map.of("number", pn, "size", ps));

    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        data,
        List.of(new Link("self", "/api/v1/posts?page[number]=" + pn + "&page[size]=" + ps, Optional.of("GET"), Optional.empty()))
    ));
  }

  @GetMapping("/{postId}")
  public ResponseEntity<Envelope<PostResponse>> get(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @PathVariable String postId
  ) {
    PostEntity p = posts.findById(postId).orElse(null);
    if (p == null) {
      return ResponseEntity.status(404).body(Envelope.err(safeRequestId(requestId), "RES_NOT_FOUND", "Post not found", java.util.Map.of()));
    }
    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        toDto(p),
        List.of(new Link("self", "/api/v1/posts/" + postId, Optional.of("GET"), Optional.empty()))
    ));
  }
}
```

逐段解释（更新后）：

- 分页参数：
  - `page[number]` 从 1 开始，服务端转为 `PageRequest.of(pn - 1, ps)`（Spring Data 页码从 0 开始）
  - `page[size]` 做上限 200，避免无界查询
- 返回结构：
  - `data.items`：帖子列表
  - `data.page`：当前分页元信息（这里先给 number/size，后续可加 totalItems/totalPages）
- 个性化字段：
  - `liked`：未登录返回 `null`
  - `favorited/lastViewedAt`：只在详情接口按登录态计算
- 错误：
  - 详情不存在返回 `404 RES_NOT_FOUND`
- 点赞错误：
  - 未登录返回 `401 AUTH_REQUIRED`
  - 帖子不存在返回 `404 RES_NOT_FOUND`
- links：
  - 列表/详情都返回 `self`，保证最小 HATEOAS 约束成立

## 演进方向

- 增强分页元数据：增加 `totalItems/totalPages`
- 支持排序与过滤：例如按日期范围、source 过滤
- 内容安全：对 `content` 做富文本白名单或 Markdown 渲染策略（前端/后端择一）
