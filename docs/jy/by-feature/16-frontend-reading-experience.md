# 16 前端：阅读体验（Feed + Detail + 评论互动 + 错误兜底）

本章解释“为什么现在看起来更像给用户看的站”，以及实现上做了哪些取舍。

设计目标不是复制某个站的像素级 UI，而是把阅读体验的关键点做到位：

- 列表页读起来像信息流（标题、摘要、元信息）
- 详情页读起来像文章（封面、icon、meta、正文分块）
- 错误展示可读、可定位（requestId / code）

## 功能目标与边界

目标：

- 列表页不再出现“数据来源：/api/v1/posts”这类工程文案，转为面向用户的文案与信息层级
- 详情页正文支持块级排版：标题/列表/引用/代码块
- 详情页评论区支持排序、回复、点赞、昵称卡片与状态提示
- 后端/网关异常时不出现“无限 loading”，且错误信息不崩溃（例如 `reading 'message'`）

边界：

- 不引入重型 Markdown/富文本库（例如 react-markdown/remark），先用轻量规则满足演示与可读性
- 不做 XSS 富文本清洗（当前正文是纯文本约定渲染）

## 端到端行为

1) 列表页请求：

- `GET /api/v1/posts?page[number]=1&page[size]=30`（走网关）
- 渲染为 Feed 列表：icon + title + label + time + excerpt

2) 详情页请求：

- `GET /api/v1/posts/{postId}`
- `GET /api/v1/comments?postId={postId}`（返回“APPROVED + 我的待审/驳回”）
- 渲染为文章页：cover + icon + title + meta + blocks + 评论互动区

3) 错误与兜底：

- 任意请求失败：展示 `加载失败` Alert，带 `code` 与 `requestId`（如果后端返回）
- 不允许出现“无限加载”或“Cannot read properties of null”

## 关键代码原文 + 解读

### 16.1 Feed 列表页：PostsPage

代码位置：[PostsPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PostsPage.tsx)

核心结构（节选）：

```tsx
<Page title="Daily Feed" subtitle="每天生成一条更新；也支持接收演示推送数据。">
  <div className="pf-hero">
    <div className="pf-hero__title">PaperFlow</div>
    <div className="pf-hero__sub">更像 Notion/Medium 的阅读体验：清爽排版、块级正文、可审阅评论。</div>
  </div>

  <div className="pf-postlist">
    {items.map((p) => (
      <div key={p.postId} className="pf-postitem">
        <span style={{ fontSize: 18 }}>{sourceMeta(p.source).icon}</span>
        <Link to={`/posts/${encodeURIComponent(p.postId)}`} className="pf-titlelink">{p.title}</Link>
        <span className="pf-pill">{sourceMeta(p.source).label}</span>
        <span>{formatDateTime(p.publishedAt)}</span>
        <div className="pf-excerpt">{excerpt(p.content, 180)}</div>
      </div>
    ))}
  </div>
</Page>
```

逐段解释：

- Hero 区（`pf-hero`）：
  - 这是“产品化观感”的关键：给页面一个明确的标题与一句话定位
  - 避免把 API 路径当成用户文案（之前用户观感差的主要来源之一）
- 列表项信息层级：
  - icon（按 source 映射）让用户快速区分 Daily/Agent/Manual
  - titlelink 强调可点击与阅读优先
  - pill+时间属于 meta，视觉上弱化但随手可见
  - excerpt 控制长度，让列表更像阅读流而不是原始数据 dump

### 16.2 详情页：PostDetailPage（文章式头部 + 元信息）

代码位置：[PostDetailPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PostDetailPage.tsx#L62-L77)

```tsx
<div className="pf-article">
  <div className="pf-article__cover" />
  <div className="pf-article__icon">{sourceMeta(post.source).icon}</div>
  <h1 className="pf-article__title">{post.title}</h1>
  <div className="pf-meta" style={{ marginTop: 10 }}>
    <span className="pf-pill">{sourceMeta(post.source).label}</span>
    <span className="pf-meta__dot" />
    <span>{formatDateTime(post.publishedAt)}</span>
    <span className="pf-meta__dot" />
    <span>{readingTimeMinutes(post.content)} min read</span>
  </div>
  <RichText text={post.content} />
</div>
```

解释：

- cover/icon/title/meta 这套结构更像 Notion/Medium 的“文章页”，不是纯 CRUD 详情页。
- `readingTimeMinutes` 是轻量的阅读时长估算，增强“阅读产品”的感觉。

### 16.2.1 详情页互动补齐：点赞、收藏、足迹、评论

当前详情页不只是“显示正文”，还承担互动聚合：

- 文章点赞与收藏
- 阅读足迹展示
- 评论区排序（最新 / 最热）
- 评论回复、点赞、状态提示
- 点击昵称展示用户卡片

这使详情页从简单 CRUD 详情页，变成一张完整阅读工作台。

### 16.3 块级正文渲染：RichText（轻量规则，不引库）

代码位置：[RichText.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/components/RichText.tsx)

支持的块类型（当前实现）：

- `#` / `##` / `###`：标题
- `- `：无序列表
- `> `：引用块（callout 风格）
- ```：代码块（```text / ```js 等语言标记目前忽略，只做 code block 容器）
- 其他文本：段落（自动合并空行间的连续行）

关键解析逻辑（节选）：

```ts
if (t.startsWith("# ")) out.push({ kind: "h1", text: t.slice(2).trim() });
if (t.startsWith("## ")) out.push({ kind: "h2", text: t.slice(3).trim() });
if (t.startsWith(">")) out.push({ kind: "quote", text: t.replace(/^>\\s?/, "").trim() });
if (t.startsWith("- ")) listBuf.push(t.slice(2).trim());
if (line.trim().startsWith("```")) { inCode = !inCode; }
```

为什么不引入 Markdown 库：

- 这是“演示站”阶段：先把可读性做出来，避免额外依赖与安全面扩大
- 等后续需要更完整 Markdown（表格、链接、图片、脚注）时再引入，成本更可控

### 16.4 错误兜底：httpJson + ErrorState（避免前端崩溃）

你之前看到的 `Cannot read properties of null (reading 'message')`，本质是“后端返回结构不符合前端预期，前端把 `error: null` 当成了错误对象”。

修复点在 HTTP 客户端：不再盲目读取 `body.error.message`，而是先判定 envelope 结构是否真的有 `error.code/message`。

代码位置：[http.ts](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/data/http.ts#L39-L69)

```ts
if (!resp.ok) {
  if (body && isErr(body)) {
    throw new ApiError(body.error.message || `HTTP ${resp.status}`, body.error.code || "SYS_HTTP_ERROR", body.requestId || resp.headers.get("X-Request-Id") || "");
  }
  throw new ApiError(`HTTP ${resp.status}`, "SYS_HTTP_ERROR", resp.headers.get("X-Request-Id") || "");
}
```

错误 UI 展示位置：[ErrorState.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/components/ErrorState.tsx#L6-L24)

它会展示：

- 人类可读 message
- `code` 与 `requestId`（便于你去网关/后端日志定位）

### 16.5 评论体验：从“可用”到“可解释”

当前评论区重点不是堆更多按钮，而是让用户理解系统状态：

- 评论支持“最新 / 最热”排序
- 最多 5 层回复
- 回复草稿优先使用昵称，不直接暴露用户 ID
- 待审核 / 驳回状态直接可见
- 用户卡片改为点击触发，避免 hover 误触
- 点赞按钮图标化，交互更轻量

这些能力都集中在 [PostDetailPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PostDetailPage.tsx) 与 [postDetailCommentUtils.ts](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/postDetailCommentUtils.ts)。

## 样式：与 Notion/Medium 的相似点

样式位置：[global.css](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/styles/global.css)

关键是“层级与留白”，不是组件堆叠：

- `pf-hero` 给页面一个轻封面与定位
- `pf-postitem`/`pf-excerpt` 控制列表阅读节奏
- `pf-article__cover`/`pf-article__icon`/`pf-article__title` 形成文章头部
- `pf-quote` 与 `pf-code` 对应阅读中最常见的 callout/code block

## 常见坑与排查

- 列表页显示“加载失败”
  - 先用浏览器访问 `http://localhost:3151/actuator/health`（网关）
  - 再访问 `http://localhost:3151/api/v1/posts?page%5Bnumber%5D=1&page%5Bsize%5D=1`
  - 若失败，观察错误提示里的 `requestId` 去对应服务日志查
- 详情页内容“还是一坨”
  - 确认帖子正文内容是否包含块结构（`#`、`-`、`>`、```）
  - 当前 RichText 是规则解析，不支持所有 Markdown 语法
- 闲置后重新操作掉登录
  - 当前前端已接入 refresh 自动续期
  - 若仍掉登录，优先检查 refresh cookie、401 返回与网关日志

## 演进方向

- 引入结构化 blocks（后端存 JSON blocks，前端严格渲染）以替代“文本约定解析”
- 增加图片/链接/脚注/表格与更精细的 typography（此时再考虑引入 Markdown 解析库）
