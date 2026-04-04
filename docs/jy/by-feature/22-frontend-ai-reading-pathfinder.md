# 22 前端：AI 阅读 + Pathfinder（论文阅读 + 学习路径对话）

## 22.1 功能概览

当前前端有两条 AI 能力链路，且职责已拆开：

- 论文阅读与帖子详情的问答/翻译：统一走 `POST /api/v1/ai/chat`
- Pathfinder 学习路径规划：走 `POST /api/v1/pathfinder/sessions/plan`

这样可避免“把规划接口当聊天接口”导致的提示词回显与语义错配。

## 22.2 论文阅读页（/papers/:postId）

页面：`PaperPdfReaderPage`

关键行为：

- `resolvePaperPdf(postId)` 映射 PDF 入口并渲染连续阅读流
- 正文划词可触发“添加到对话/翻译”
- AI 聊天与翻译统一调用 `apiAiChat(...)`
- assistant 消息统一走 `AiMarkdown` 渲染

代码锚点：

- 页面调用：`apps/paperflow-web/src/ui/pages/PaperPdfReaderPage.tsx`
- API 封装：`apps/paperflow-web/src/ui/data/api.ts`

## 22.3 帖子详情页（/posts/:postId）

页面：`PostDetailPage`

关键行为：

- 正文划词支持“添加到对话/翻译”
- 普通问答与翻译都走 `apiAiChat(...)`
- 引用片段附带到消息区，assistant 结果走 `AiMarkdown`

代码锚点：

- 页面调用：`apps/paperflow-web/src/ui/pages/PostDetailPage.tsx`
- API 封装：`apps/paperflow-web/src/ui/data/api.ts`

## 22.4 Pathfinder 页面（/pathfinder）

页面：`PathfinderPage`

布局保持三栏：

- 左栏：历史会话
- 中栏：对话过程
- 右栏：阶段计划

Pathfinder 仍是“规划型接口”：

- `POST /api/v1/pathfinder/sessions/plan`
- `PUT /api/v1/pathfinder/sessions/{sessionId}`
- `GET /api/v1/pathfinder/sessions`
- `POST/DELETE /api/v1/pathfinder/sessions/{sessionId}/favorite`

## 22.5 前后端契约（最新）

阅读/对话：

- `POST /api/v1/ai/chat`
- 请求体：`model`、`systemPrompt`、`userPrompt`
- 返回体：`assistantMessage`

Pathfinder：

- 保持原会话与规划契约，不与阅读聊天混用

## 22.6 交互与体验要点

- assistant 消息全部 Markdown 渲染，避免不同页面显示不一致
- 译文与问答都保留引用上下文，便于追溯来源
- 错误态保留对话历史，不清空用户输入与引用

## 22.7 常见排查

- 若出现“4 阶段闯关路径”文案，说明调用了 Pathfinder 接口而非 `/api/v1/ai/chat`
- 若返回模板空话，先确认 token 未过期，再切换模型重试
- 若 Markdown 显示异常，先检查返回内容是否被后端包裹为纯文本模板
