# 22 前端：AI 阅读 + Pathfinder（论文阅读 + 学习路径对话）

## 22.1 功能概览

当前前端已形成两条 AI 交互链路：

- 论文阅读：左侧 PDF，右侧 AI 聊天
- Pathfinder：三栏布局（左历史会话 / 中对话 / 右路径结果）

两条链路都支持“持续对话”，不再是一次请求一次静态结果。

## 22.2 论文阅读页（/papers/:postId）

页面：`PaperPdfReaderPage`

关键行为：

- 通过 `resolvePaperPdf(postId)` 稳定映射 PDF
- AI 聊天调用后端 `POST /api/v1/posts/{postId}/ai-chat`
- 回复区支持 Markdown 渲染与打字机效果

说明：

- 论文页 AI 已不是前端本地演示文案
- 登录态会携带 token，与详情页 AI 链路一致

## 22.3 Pathfinder 页面（/pathfinder）

页面：`PathfinderPage`

### 布局

- 左栏：历史会话（最近 20 条）
- 中栏：主对话区（目标输入、连续提问、修改计划）
- 右栏：路径结果与阶段节点/阅读项

### 新会话与连续修改

- 新增“新对话”按钮，点击后开始新的会话分界
- 在已有会话下再次输入目标，会基于当前计划与近期对话生成“修改版计划”
- 不再按“每次提问都新建会话”

### 历史加载策略

- 仅当 URL 携带 `sid` 时自动回填对应会话
- 无 `sid` 时保留欢迎态，避免默认抢占最近会话

## 22.4 前后端契约

Pathfinder：

- `POST /api/v1/pathfinder/sessions/plan`
- `PUT /api/v1/pathfinder/sessions/{sessionId}`
- `GET /api/v1/pathfinder/sessions`
- `POST/DELETE /api/v1/pathfinder/sessions/{sessionId}/favorite`

阅读 AI：

- `POST /api/v1/posts/{postId}/ai-chat`

## 22.5 交互与体验要点

- AI 回复支持 Markdown（标题、列表、引用、代码块、链接）
- AI 消息以逐字动画呈现，符合聊天式反馈节奏
- 错误态保留对话上下文，便于用户继续追问或重试

## 22.6 今日补充（2026-03-26）

- 帖子详情 AI 对话增加本地暂存（按 `postId` 维度）：
  - 保存输入草稿、引用片段、模型选择、最近消息
  - 刷新后可恢复上下文，避免白屏/刷新导致“对话丢失”
- 帖子详情 AI 增加“回声兜底”：
  - 若后端返回与用户输入完全一致，前端自动转为结构化要点回复，避免“问什么回什么”的空洞体验
- Pathfinder 页面按钮视觉增强：
  - “新对话”主按钮强化
  - “收藏会话”文案改为状态化（未收藏/已收藏）

## 22.7 常见排查

- Pathfinder 超时：前端 `plan` 超时已调到 30000ms，仍超时需看后端模型调用日志
- 历史会话空：确认已登录且有会话数据，再检查 `sid` 是否有效
- Markdown 显示异常：优先检查回复是否被三引号包裹且格式合法
