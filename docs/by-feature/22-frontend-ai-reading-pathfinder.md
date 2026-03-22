# 22 前端：AI 阅读 + Pathfinder（论文阅读 + 学习路径闯关）

本文聚焦两条前端 AI 体验链路：

- 论文阅读页（左侧 PDF + 右侧 AI 对话）
- Pathfinder 学习路径页（目标输入 → 阶段化闯关）

目标是让“看论文”和“做学习计划”都从单页 CRUD 升级为可持续交互流程。

## 22.1 功能目标与边界

目标：

- 在文章详情页提供论文阅读入口，进入后可并排查看 PDF 与 AI 对话
- 提供类 GPT 的目标输入体验，输出可执行的阶段路线（节点、阅读项、进度）
- 前端状态在失败场景可恢复：生成失败有提示、同步失败不丢本地操作
- 与后端接口契约保持一致，支持历史会话加载与收藏/取消收藏

边界：

- 论文阅读页当前 AI 对话为前端演示态，不直接调用模型接口
- Pathfinder 仅支持两种模型枚举（`glm-4-flash` / `glm-z1-flash`）
- 当前不做多会话并发编辑冲突治理（以最后一次保存为准）

## 22.2 页面入口与路由编排

代码入口：

- 路由注册： [App.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/App.tsx#L27-L34)
- 顶部导航： [TopNav.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/layout/TopNav.tsx#L14-L23)

关键点：

- `/papers/:postId` 对应论文阅读页（`PaperPdfReaderPage`）
- `/pathfinder` 对应学习路径页（`PathfinderPage`）
- Pathfinder 入口在主导航常驻，方便从 Feed/Viz 快速切换到学习规划

## 22.3 论文阅读页：PDF + AI 双栏

代码位置： [PaperPdfReaderPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PaperPdfReaderPage.tsx)

核心结构（节选）：

```tsx
<div className="pf-pdf-layout">
  <Card className="pf-pdf-main">
    <iframe title={paperMeta.title} src={paperMeta.pdfUrl} className="pf-pdf-frame" />
  </Card>
  <Card className="pf-ai-panel">
    <div className="pf-ai-chatlog">{/* 对话历史 */}</div>
    <div className="pf-ai-composer">{/* 输入框 + 发送按钮 */}</div>
  </Card>
</div>
```

实现说明：

- `apiGetPost` 只用于补充“来源文章”信息，不阻塞 PDF 渲染主链路
- `resolvePaperPdf(postId)` 通过 `postId` 稳定映射论文库，保证同一文章重复进入时目标 PDF 一致  
  参考 [paper.ts](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/utils/paper.ts#L3-L16)
- 对话发送逻辑当前在前端本地生成“结构化回应文案”，用于演示交互节奏

## 22.4 Pathfinder：目标生成、进度推进、历史回放

代码位置： [PathfinderPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PathfinderPage.tsx)

### 1) 生成链路

- 用户输入目标并选择模型后，调用 `apiGeneratePathfinderPlan`
- 成功后生成 `nextPlan`、选中当前关卡、追加 assistant 消息并持久化
- 失败时清理当前 plan，写入失败提示消息，避免界面卡死

对应代码： [PathfinderPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PathfinderPage.tsx#L179-L224)

### 2) 关卡状态机

- 前端统一用 `recalculateStageStatus` 重算阶段状态
- 规则：前置未完成则后续 `locked`；当前未全完成阶段为 `in_progress`
- 通过 `pickCurrentStageId` 保证刷新/切换后有稳定焦点关卡

对应代码： [PathfinderPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PathfinderPage.tsx#L521-L550)

### 3) 会话持久化与历史

- 初次进入读取 `apiListPathfinderSessions`，默认回填最近会话
- 任意关卡切换、阅读项打勾、收藏状态变更都会触发持久化
- `saveError` 只提示“同步失败”，不回滚本地状态，优先保证使用连续性

对应代码：

- 历史加载： [PathfinderPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PathfinderPage.tsx#L91-L124)
- 持久化： [PathfinderPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PathfinderPage.tsx#L155-L177)
- 收藏切换： [PathfinderPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PathfinderPage.tsx#L278-L293)

## 22.5 前后端契约（前端视角）

接口封装： [api.ts](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/data/api.ts#L136-L207)  
类型定义： [types.ts](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/data/types.ts#L62-L98)

关键契约：

- 生成路径：`POST /api/v1/pathfinder/sessions/plan`
- 会话保存：`PUT /api/v1/pathfinder/sessions/{sessionId}`
- 会话列表：`GET /api/v1/pathfinder/sessions`
- 收藏切换：`POST/DELETE /api/v1/pathfinder/sessions/{sessionId}/favorite`

## 22.6 常见坑与排查

- 现象：Pathfinder 一直提示“请先登录”  
  排查：确认 `AuthContext` 状态为 authenticated，且请求头携带 Bearer Token
- 现象：刷新后 stage 定位错乱  
  排查：检查 URL 查询参数 `sid/stage` 是否存在且在当前会话内有效
- 现象：历史会话加载失败  
  排查：优先看错误面板中的 `requestId`，再到网关/内容服务日志关联定位

## 22.7 演进方向

- 论文阅读页 AI 对话改为真实后端代理调用（统一鉴权、审计与限流）
- Pathfinder 增加“重生成当前关卡”“插入自定义阅读项”“阶段备注”能力
- 在历史会话区增加筛选维度（收藏优先、最近模型、目标关键词）
