# 29 后端：统一 AI 对话接口（/api/v1/ai/chat）

## 29.1 背景

在本次改造前，前端阅读页与帖子详情页把“问答/翻译”复用了 Pathfinder 的规划接口 `/api/v1/pathfinder/sessions/plan`。  
该接口语义是“生成学习路径”，在某些场景会返回“阶段闯关路径”文案，从而造成：

- 聊天结果与用户意图不一致
- 提示词被回显到消息区
- 翻译结果稳定性差

因此新增统一聊天接口，专门承接问答与翻译请求。

## 29.2 新接口定义

- 路径：`POST /api/v1/ai/chat`
- 鉴权：需要登录（网关透传 `X-User-Id`、`X-User-Email`）
- 请求体：
  - `model`
  - `systemPrompt`
  - `userPrompt`
- 响应体：
  - `model`
  - `assistantMessage`

相关代码：

- 控制器：`backend/services/content-service/src/main/java/com/paperflow/content/api/AiChatController.java`
- DTO：
  - `backend/services/content-service/src/main/java/com/paperflow/content/api/dto/AiChatRequest.java`
  - `backend/services/content-service/src/main/java/com/paperflow/content/api/dto/AiChatResponse.java`

## 29.3 服务实现策略

服务层新增 `AiChatService`，核心策略：

- 复用 `PathfinderAiProperties` 的 endpoint、超时与密钥配置
- 复用邮箱映射密钥逻辑（`apiKey` 优先，`apiKeyPairs` 次之）
- 直接调用大模型 chat completions，返回 `choices[0].message.content`
- 无密钥或远端失败时，返回稳定兜底文案（不抛给前端实现细节）

代码：

- `backend/services/content-service/src/main/java/com/paperflow/content/service/AiChatService.java`

## 29.4 网关路由新增

为保证前端仍统一走 `/api/v1/**`，网关新增 `content-ai` 路由：

- `Path=/api/v1/ai,/api/v1/ai/**`
- 转发到 `content-service`

代码：

- `backend/services/api-gateway/src/main/resources/application.yml`

## 29.5 前端接入结果

前端新增 `apiAiChat(...)` 封装后：

- `PostDetailPage` 的问答/翻译改为调用 `/api/v1/ai/chat`
- `PaperPdfReaderPage` 的问答/翻译改为调用 `/api/v1/ai/chat`
- `PathfinderPage` 保持调用 `pathfinder/sessions/plan`

实现位置：

- `apps/paperflow-web/src/ui/data/api.ts`
- `apps/paperflow-web/src/ui/pages/PostDetailPage.tsx`
- `apps/paperflow-web/src/ui/pages/PaperPdfReaderPage.tsx`

## 29.6 兼容与边界

- 本次未移除 Pathfinder 规划接口；仅校正其职责边界
- `/api/v1/ai/chat` 目前以“单轮请求”抽象为主，历史上下文由前端拼接
- 若后续需要统一多轮会话持久化，可在该接口之上扩展 session 语义

## 29.7 回归验证

- 前端：`npx tsc --noEmit` 通过
- 后端：
  - content-service 打包通过
  - api-gateway 打包通过
- 冒烟：登录后调用 `POST /api/v1/ai/chat`，可返回正常翻译文本
