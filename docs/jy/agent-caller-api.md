# PaperFlow Agent 调用接口文档（云端版）

## 1. 目标与范围

本文用于支持“自研 Agent 替换现有 GLM 调用链路”。  
重点覆盖两类接口：

- PaperFlow 对外业务接口（前端/调用方可直接用）
- PaperFlow 后端调用模型端的兼容协议（你们自研 Agent 需要实现）

## 2. 云端访问基址

- 业务入口（推荐）：`http://47.109.193.180:9628`
- 网关内部监听：`http://47.109.193.180:3151`（通常不直接对外）

说明：

- 前端站点在 `:9628/paperflow/`
- 业务 API 统一走 `:9628/api/v1/**`

## 3. 鉴权与通用约定

### 3.1 鉴权

- 受保护接口需 `Authorization: Bearer <accessToken>`
- 网关会向下游注入：
  - `X-User-Id`
  - `X-User-Email`
  - `X-User-Roles`

### 3.2 请求追踪

- 可传 `X-Request-Id`
- 不传时网关自动生成并回写响应头

### 3.3 Java 服务统一响应信封

成功：

```json
{
  "requestId": "xxx",
  "data": {},
  "links": []
}
```

失败：

```json
{
  "requestId": "xxx",
  "error": {
    "code": "REQ_INVALID",
    "message": "..."
  }
}
```

---

## 4. 对外 Agent 相关业务接口（云端可直接调用）

## 4.1 AI 对话

- 方法：`POST`
- 路径：`/api/v1/ai/chat`
- 鉴权：需要登录

请求体：

```json
{
  "model": "glm-4-flash",
  "systemPrompt": "你是 PaperFlow AI 助手",
  "userPrompt": "帮我总结这篇文章"
}
```

返回体（`data`）：

```json
{
  "model": "glm-4-flash",
  "assistantMessage": "..."
}
```

调用示例：

```bash
curl -X POST "http://47.109.193.180:9628/api/v1/ai/chat" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: req-ai-chat-001" \
  -d '{
    "model":"glm-4-flash",
    "systemPrompt":"你是 PaperFlow AI 助手",
    "userPrompt":"请给出 3 条学习建议"
  }'
```

---

## 4.2 Pathfinder 生成学习计划

- 方法：`POST`
- 路径：`/api/v1/pathfinder/sessions/plan`
- 鉴权：需要登录

请求体：

```json
{
  "goal": "两周内掌握 RAG 系统设计",
  "model": "glm-z1-flash"
}
```

返回体（`data`）：

```json
{
  "goal": "两周内掌握 RAG 系统设计",
  "model": "glm-z1-flash",
  "focus": ["RAG", "检索", "重排", "评测"],
  "stages": [
    {
      "id": "s1",
      "title": "第 1 关 · 问题拆解",
      "objective": "...",
      "etaDays": 2,
      "status": "in_progress",
      "readings": [
        { "id": "s1_r1", "title": "...", "done": false }
      ]
    }
  ],
  "assistantMessage": "..."
}
```

调用示例：

```bash
curl -X POST "http://47.109.193.180:9628/api/v1/pathfinder/sessions/plan" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "goal":"两周内掌握 RAG 系统设计",
    "model":"glm-z1-flash"
  }'
```

---

## 4.3 Pathfinder 会话管理（常用）

- 列表：`GET /api/v1/pathfinder/sessions`
- 更新：`PUT /api/v1/pathfinder/sessions/{sessionId}`
- 收藏：`POST /api/v1/pathfinder/sessions/{sessionId}/favorite`
- 取消收藏：`DELETE /api/v1/pathfinder/sessions/{sessionId}/favorite`

---

## 4.4 Agent 入库接口（内部）

用于你们 Agent 把生成内容回写到 PaperFlow。

### A) 写入帖子

- 方法：`POST`
- 路径：`/api/v1/internal/agent/posts`
- 开关：`paperflow.demo-ingest.enabled=true`
- 可选安全头：`X-Demo-Ingest-Token`

请求体：

```json
{
  "id": "post_agent_001",
  "title": "Agent 生成标题",
  "content": "Agent 生成正文",
  "source": "agent",
  "publishedAt": "2026-04-08T12:00:00Z",
  "commentModerationEnabled": true
}
```

### B) 写入论文

- 方法：`POST`
- 路径：`/api/v1/internal/agent/papers`
- 开关与 token 规则同上

---

## 5. 自研 Agent 替换 GLM：必须实现的兼容协议

当前 content-service 通过 `PF_PATHFINDER_AI_ENDPOINT` 调模型端。  
要“无侵入替换 GLM”，你们自研 Agent 需要提供一个**OpenAI Chat Completions 兼容接口**。

## 5.1 上游（PaperFlow）请求格式

请求：

- 方法：`POST`
- Header：
  - `Content-Type: application/json`
  - `Authorization: Bearer <PF_PATHFINDER_AI_API_KEY>`
- Body（两类调用都用这个结构）：

```json
{
  "model": "glm-4-flash",
  "temperature": 0.3,
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "response_format": { "type": "json_object" }
}
```

说明：

- `response_format` 主要用于 Pathfinder 计划生成
- 普通聊天可不关心该字段，但建议兼容

## 5.2 你们 Agent 必须返回的最小响应

PaperFlow 只读取：`/choices/0/message/content`

因此最小可用响应：

```json
{
  "choices": [
    {
      "message": {
        "content": "你的输出内容"
      }
    }
  ]
}
```

## 5.3 两种内容要求（关键）

- `POST /api/v1/ai/chat`：`content` 返回普通文本即可
- `POST /api/v1/pathfinder/sessions/plan`：`content` 必须是 **JSON 字符串**，可被解析为对象，结构至少包含：
  - `focus`（数组）
  - `stages`（数组）
  - `assistantMessage`（字符串，可选）

示例（`message.content` 内部字符串）：

```json
{
  "focus": ["RAG", "检索", "评测", "工程化"],
  "assistantMessage": "已生成学习路径",
  "stages": [
    {
      "id": "s1",
      "title": "第1阶段",
      "objective": "完成基础认知",
      "etaDays": 2,
      "status": "locked",
      "readings": [
        { "id": "s1_r1", "title": "RAG 概览", "done": false },
        { "id": "s1_r2", "title": "向量检索", "done": false },
        { "id": "s1_r3", "title": "评测指标", "done": false }
      ]
    }
  ]
}
```

---

## 6. 环境变量与切换方式

把下面变量指向你们自研 Agent：

- `PF_PATHFINDER_AI_ENDPOINT`
- `PF_PATHFINDER_AI_API_KEY`
- `PF_PATHFINDER_AI_TIMEOUT_MS`

示例（仅示意）：

```bash
PF_PATHFINDER_AI_ENDPOINT=http://agent.internal/v1/chat/completions
PF_PATHFINDER_AI_API_KEY=your-agent-key
PF_PATHFINDER_AI_TIMEOUT_MS=25000
```

部署后重启 `content-service` 生效。

---

## 7. 联调最小用例（推荐顺序）

1) 用真实 token 调通 `POST /api/v1/ai/chat`  
2) 调通 `POST /api/v1/pathfinder/sessions/plan`，确认 `stages` 正常落库与返回  
3) 再验证 `GET /api/v1/pathfinder/sessions` 能拿到已生成会话  

---

## 8. 常见错误与排查

- `401 AUTH_REQUIRED`
  - 未带或带错 `Authorization` 业务 token
- `REQ_INVALID: goal is required / userPrompt is required`
  - 入参缺失
- AI 结果总是“服务不可用”
  - `PF_PATHFINDER_AI_API_KEY` 未配置或 Agent 端返回结构不含 `choices[0].message.content`
- Pathfinder 计划生成失败但接口仍 200 且内容较模板化
  - 说明远端异常，已走服务端 fallback 计划逻辑

---

## 9. 安全建议

- 不在仓库文档中写真实 API Key
- `internal/agent/*` 建议始终启用 token 校验与来源 IP 限制
- 保留 `X-Request-Id`，方便云端全链路排障
