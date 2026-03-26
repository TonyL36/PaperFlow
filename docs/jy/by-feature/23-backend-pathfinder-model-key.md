# 23 后端：Pathfinder 模型密钥配置与路由策略

本文说明 Pathfinder 生成链路中“模型密钥如何配置、如何按用户选择、失败如何兜底”。

核心结论：

- 模型调用由 `content-service` 负责，前端不直接接触密钥
- 密钥支持单一共享 `apiKey`，也兼容 `apiKeyPairs` 按登录邮箱选择
- 未配置或调用失败时，自动回退到本地 fallback 计划，保证功能可用

## 23.1 配置入口与参数

配置文件： [application.yml](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/resources/application.yml#L22-L27)  
属性类： [PathfinderAiProperties.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/config/PathfinderAiProperties.java#L7-L35)

当前参数：

- `PF_PATHFINDER_AI_ENDPOINT`：模型网关地址
- `PF_PATHFINDER_AI_API_KEY`：单一共享密钥（优先使用）
- `PF_PATHFINDER_AI_KEY_PAIRS`：邮箱到密钥的映射串
- `PF_PATHFINDER_AI_TIMEOUT_MS`：调用超时（毫秒）

示例（Windows PowerShell）：

```powershell
$env:PF_PATHFINDER_AI_ENDPOINT="https://open.bigmodel.cn/api/paas/v4/chat/completions"
$env:PF_PATHFINDER_AI_API_KEY="sk-xxx"
$env:PF_PATHFINDER_AI_KEY_PAIRS="alice@example.com=sk-xxx;bob@example.com=sk-yyy"
$env:PF_PATHFINDER_AI_TIMEOUT_MS="12000"
```

## 23.2 请求链路：JWT 邮箱透传 → 模型密钥选择

链路拆解：

1. 网关从 JWT 解析邮箱并注入 `X-User-Email`  
   代码： [JwtAuthGlobalFilter.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/java/com/paperflow/gateway/filter/JwtAuthGlobalFilter.java#L83-L91)
2. 内容服务 `PathfinderSessionsController` 在 `/plan` 接口读取该请求头  
   代码： [PathfinderSessionsController.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/api/PathfinderSessionsController.java#L117-L142)
3. `PathfinderPlanService` 优先读取 `apiKey`，为空时再依据邮箱从 `apiKeyPairs` 里取对应密钥  
   代码： [PathfinderPlanService.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/service/PathfinderPlanService.java#L206-L236)

这样做的收益：

- 单密钥可覆盖“统一 API 提供给部分用户”的场景，配置更简单
- 多账号可映射到不同模型密钥，便于灰度与成本隔离
- 密钥不落前端，不进入浏览器网络面板

## 23.3 `apiKeyPairs` 解析规则

解析实现： [PathfinderPlanService.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/service/PathfinderPlanService.java#L214-L236)

规则细节：

- 分隔符支持分号 `;` 或换行 `\n`
- 每条必须是 `email=key` 格式
- 邮箱会标准化为小写后再匹配
- 空条目、无效条目会被跳过（不抛异常）

推荐写法（可读性更高）：

```text
alice@example.com=sk-live-alice
bob@example.com=sk-live-bob
```

## 23.4 模型调用与降级策略

调用主逻辑： [PathfinderPlanService.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/service/PathfinderPlanService.java#L38-L109)

行为策略：

- `goal` 为空直接拒绝（`IllegalArgumentException`）
- `model` 仅白名单化为 `glm-4-flash` 或 `glm-z1-flash`
- 找不到密钥：直接返回 fallback 计划
- 远端请求异常/响应异常：捕获异常并 fallback

这保证了“AI 服务挂了，Pathfinder 页面仍可生成可执行路径”，不会让前端流程硬失败。

## 23.5 安全与运维建议

- 不要把真实 `PF_PATHFINDER_AI_API_KEY` 或 `PF_PATHFINDER_AI_KEY_PAIRS` 写进仓库文件
- 生产建议使用密钥管理服务或部署平台 Secret 注入
- 建议按邮箱最小授权，失效时只替换单个账号映射
- 监控 `fallback` 比例，作为外部模型可用性告警信号

## 23.6 常见问题

- 现象：总是走 fallback  
  排查：先确认 `PF_PATHFINDER_AI_API_KEY` 是否已配置；若未配置，再检查请求头 `X-User-Email` 与 `PF_PATHFINDER_AI_KEY_PAIRS` 映射
- 现象：部分账号可用、部分账号不可用  
  排查：检查邮箱大小写与空格；服务端会转小写，配置侧也应避免脏字符
- 现象：偶发超时  
  排查：适度增大 `PF_PATHFINDER_AI_TIMEOUT_MS`，并核对外部 endpoint 连通性
