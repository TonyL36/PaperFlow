# app 与 apps/paperflow-web 源码逐文件调研（不含业务改动）

## 1. 调研范围与方法

- 范围：`/app`（Python 后端 + 静态 Demo）与 `/apps/paperflow-web`（React 前端 + Mock API）。
- 目标：逐文件说明「文件作用」「主要类/函数」「核心实现逻辑」。
- 说明：本次仅新增文档，不修改任何业务源码。

---

## 2. app 目录（后端与静态 Demo）

### 2.1 包入口与导出

1) `app/__init__.py`  
- 作用：包标记文件。  
- 主要实现：空文件（无导出逻辑）。

2) `app/agents/__init__.py`  
- 作用：统一导出 Agent 层模型、工作流、checkpoint。  
- 主要类/函数：`FileCheckpointStore`、`FiveAgentWorkflow`、`tokenize` 等通过 `__all__` 暴露。  
- 代码： [__init__.py](file:///F:/Gitee/PaperFlow/PaperFlow/app/agents/__init__.py#L1-L33)

3) `app/services/__init__.py`  
- 作用：服务包标记文件。  
- 主要实现：空文件（无导出逻辑）。

### 2.2 Agent 数据模型与状态快照

4) `app/agents/models.py`  
- 作用：定义 5-Agent 工作流全部输入输出协议与运行态。  
- 主要类：`WorkflowTrigger`、`CandidatePaper`、`WorkflowState`、`WorkflowRequest/Response`、`AgentPdfQaRequest/Response`。  
- 核心逻辑：用 Pydantic 约束字段、默认值与范围（如 `requested_count`、`top_k`），保证前后端/节点间状态可验证。  
- 代码： [models.py](file:///F:/Gitee/PaperFlow/PaperFlow/app/agents/models.py#L9-L128)

5) `app/agents/checkpoint.py`  
- 作用：本地文件式 checkpoint 存储。  
- 主要类/函数：`now_iso()`、`FileCheckpointStore.save/load_latest`。  
- 核心逻辑：每个 run 写 `NN_node.json` + `latest.json`，使流程可回放与容错恢复。  
- 代码： [checkpoint.py](file:///F:/Gitee/PaperFlow/PaperFlow/app/agents/checkpoint.py#L10-L46)

### 2.3 Agent 工作流编排

6) `app/agents/workflow.py`  
- 作用：5-Agent 核心编排（Scout / Curator / Editor / Sage / Pathfinder）+ 检索与评分工具。  
- 主要类/函数：  
  - 文本工具：`tokenize`、`normalize_title`、`similarity`、`overlap_score`、`slugify`  
  - 数据源：`LocalPaperCorpus`、`ArxivClient`  
  - 节点 Agent：`ScoutAgent`、`CuratorAgent`、`EditorAgent`、`SageAgent`、`PathfinderAgent`  
  - 编排器：`FiveAgentWorkflow`（LangGraph 路由、checkpoint、DB 持久化）  
- 核心逻辑：  
  - Scout：先 arXiv 拉取，失败回退本地 PDF；基于相关性+质量得分排序。  
  - Curator：去重（标题相似度）、屏蔽主题过滤、阈值审核、补搜判定。  
  - Editor：补标签、摘要、teaser，生成知识卡片文案。  
  - Sage：按问题检索论文/块并生成答案+引用。  
  - Pathfinder：生成阶段式学习计划（stage/milestone/next_actions）。  
  - FiveAgentWorkflow：使用 `StateGraph` 做条件路由与节点推进，并将运行态/产物写库。  
- 代码：  
  - 工具函数与数据源 [workflow.py](file:///F:/Gitee/PaperFlow/PaperFlow/app/agents/workflow.py#L75-L239)  
  - 5 个 Agent 节点 [workflow.py](file:///F:/Gitee/PaperFlow/PaperFlow/app/agents/workflow.py#L241-L558)  
  - LangGraph 编排与路由 [workflow.py](file:///F:/Gitee/PaperFlow/PaperFlow/app/agents/workflow.py#L560-L830)

### 2.4 外部服务适配

7) `app/services/deepseek_client.py`  
- 作用：DeepSeek(OpenAI 兼容接口)调用封装。  
- 主要类/函数：`DeepSeekClient.translate()`。  
- 核心逻辑：校验 API Key -> 构造 chat completion -> `asyncio.to_thread` 避免阻塞事件循环。  
- 代码： [deepseek_client.py](file:///F:/Gitee/PaperFlow/PaperFlow/app/services/deepseek_client.py#L6-L30)

8) `app/services/mineru_adapter.py`  
- 作用：MinerU PDF 解析适配器（CLI 优先、Python API 兜底）。  
- 主要类/函数：`MinerUAdapter.parse_pdf`、`_parse_by_python_api`、`_read_output_json`。  
- 核心逻辑：多命令尝试（含 cuda/cpu 参数）-> 读取 JSON（优先 `_middle.json`）-> API fallback -> 汇总错误。  
- 代码： [mineru_adapter.py](file:///F:/Gitee/PaperFlow/PaperFlow/app/services/mineru_adapter.py#L9-L148)

9) `app/services/paperflow_db.py`  
- 作用：PostgreSQL 数据访问层，覆盖上传任务、解析结果、Agent 运行态与学习计划落库。  
- 主要类/函数：  
  - `PaperflowDbConfig.from_env/dsn`  
  - `PaperflowDbService` 的 `upsert_upload_task/save_parsed_paper/mark_task_failed/list_papers/get_paper/upsert_agent_run/upsert_agent_outputs`  
- 核心逻辑：  
  - 上传任务先写 `pf_paper`（pending）；解析后回填摘要、tags、chunks。  
  - Agent 运行态写 `pf_agent_run` + message 明细。  
  - 审核通过论文与 Pathfinder 学习计划写 `pf_paper/pf_learning_plan*`。  
- 代码：  
  - 配置与上传/解析落库 [paperflow_db.py](file:///F:/Gitee/PaperFlow/PaperFlow/app/services/paperflow_db.py#L13-L286)  
  - Agent 运行态与产物落库 [paperflow_db.py](file:///F:/Gitee/PaperFlow/PaperFlow/app/services/paperflow_db.py#L288-L539)  
  - 元数据抽取辅助函数 [paperflow_db.py](file:///F:/Gitee/PaperFlow/PaperFlow/app/services/paperflow_db.py#L541-L590)

### 2.5 FastAPI 主入口

10) `app/main.py`  
- 作用：统一 API 网关（上传解析、翻译、论文查询、Agent 工作流、PDF QA）。  
- 主要类/函数：  
  - 数据结构：`TaskRecord`、`TranslateRequest`  
  - 解析辅助：`extract_json_payload`、`extract_latex_from_text`、`normalize_bbox`、`flatten_blocks`  
  - 任务处理：`process_pdf_task`、`update_task`  
  - 翻译链路：`pick_candidate_blocks`、`pick_formula_latex*`、`translate`  
  - Agent API：`run_five_agent_workflow`、`get_five_agent_run`、`answer_pdf_with_sage`  
- 核心逻辑：  
  - 文件上传后异步解析（MinerU）并归一化 block，再写本地任务态与数据库。  
  - 划词翻译根据命中块自动判定 text/formula/mixed，组织 prompt 调 DeepSeek，并做 JSON/LaTeX 兜底解析。  
  - Agent 接口透出工作流运行与 PDF 局部问答。  
- 代码：  
  - 应用初始化与模型定义 [main.py](file:///F:/Gitee/PaperFlow/PaperFlow/app/main.py#L35-L105)  
  - Block 归一化与任务处理 [main.py](file:///F:/Gitee/PaperFlow/PaperFlow/app/main.py#L196-L317)  
  - 上传/任务/论文 API [main.py](file:///F:/Gitee/PaperFlow/PaperFlow/app/main.py#L320-L405)  
  - 划词命中与翻译主流程 [main.py](file:///F:/Gitee/PaperFlow/PaperFlow/app/main.py#L407-L585)  
  - Agent API [main.py](file:///F:/Gitee/PaperFlow/PaperFlow/app/main.py#L588-L630)

### 2.6 静态 Demo 前端

11) `app/static/index.html`  
- 作用：上传 PDF + 划词翻译 Demo 页面骨架。  
- 核心实现：挂载上传控件、翻译配置、PDF 容器，加载 PDF.js 与 KaTeX。  
- 代码： [index.html](file:///F:/Gitee/PaperFlow/PaperFlow/app/static/index.html#L1-L46)

12) `app/static/app.js`  
- 作用：Demo 交互逻辑（上传、轮询、PDF 渲染、划词翻译请求）。  
- 主要函数：`uploadPdf`、`pollTask`、`renderPdf`、`getSelectionInfo`、`requestTranslate`。  
- 核心逻辑：  
  - 上传后轮询任务状态，完成后渲染 PDF canvas + text-layer。  
  - 鼠标选区转成页内 bbox，调用 `/api/translate`，并渲染文本/公式结果。  
- 代码： [app.js](file:///F:/Gitee/PaperFlow/PaperFlow/app/static/app.js#L31-L240)

13) `app/static/styles.css`  
- 作用：Demo 页布局与文本层样式。  
- 核心实现：双栏工作区、PDF 画布+透明可选中文本层、结果面板固定定位。  
- 代码： [styles.css](file:///F:/Gitee/PaperFlow/PaperFlow/app/static/styles.css#L1-L118)

---

## 3. apps/paperflow-web（React 前端）

### 3.1 入口与路由壳

1) `src/main.tsx`  
- 作用：React 启动入口。  
- 核心逻辑：处理 `BASE_URL` 与路径重写，再挂载 `AuthProvider + BrowserRouter + App`。  
- 代码： [main.tsx](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/main.tsx#L8-L26)

2) `src/ui/App.tsx`  
- 作用：全站路由注册与鉴权守卫。  
- 主要函数：`App`、`RequireAuth`、`RequireAdmin`。  
- 核心逻辑：按路径渲染页面；对收藏/足迹/管理页执行登录与 ADMIN 权限拦截。  
- 代码： [App.tsx](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/App.tsx#L19-L109)

### 3.2 认证上下文

3) `src/ui/auth/AuthContext.tsx`  
- 作用：维护登录态、令牌存储、用户信息刷新。  
- 主要函数：`AuthProvider`、`useAuth`、内部 `login/logout/refreshMe`。  
- 核心逻辑：  
  - 初始化时从 localStorage 读取 token 并校验 exp。  
  - 登录后拉取 `/users/me` 合并角色与资料。  
  - token 失效自动降级为匿名态。  
- 代码： [AuthContext.tsx](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/auth/AuthContext.tsx#L20-L125)

### 3.3 API 协议与请求基础设施

4) `src/ui/data/types.ts`  
- 作用：集中定义前端领域类型（Post、Comment、AdminUser、Pathfinder*）。  
- 核心逻辑：统一 Envelope、分页、Pathfinder 会话/阶段结构，避免页面各自声明。  
- 代码： [types.ts](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/data/types.ts#L1-L106)

5) `src/ui/data/http.ts`  
- 作用：统一 HTTP 调用与错误处理。  
- 主要类/函数：`ApiError`、`httpJson`、`resolveTimeoutMs`、`mergeAbortSignals`。  
- 核心逻辑：  
  - 自动注入 `Authorization/X-Request-Id`。  
  - 请求超时中止（Pathfinder 计划接口单独 30s）。  
  - 统一解析 Envelope，并把业务错误映射到 `ApiError`。  
- 代码： [http.ts](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/data/http.ts#L3-L116)

6) `src/ui/data/api.ts`  
- 作用：后端 API 方法全集封装。  
- 主要函数：认证、帖子、评论、收藏足迹、管理员、Pathfinder 会话与收藏等。  
- 核心逻辑：只暴露 typed 方法，不在页面直接拼 fetch，保证接口变更集中管理。  
- 代码： [api.ts](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/data/api.ts#L7-L242)

### 3.4 页面级组件（pages）

7) `src/ui/pages/PostsPage.tsx`  
- 作用：帖子列表页。  
- 核心逻辑：`useAsyncData(apiListPosts)` 拉取 feed，展示来源、发布时间与摘要。  
- 代码： [PostsPage.tsx](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PostsPage.tsx#L10-L50)

8) `src/ui/pages/PostDetailPage.tsx`  
- 作用：帖子详情 + 评论 + 阅读助手对话 + 划词引用。  
- 主要函数：`updateSelectionPopover`、`appendSelectionToReferences`、`translateSelectionToChat`、`sendAiMessage`。  
- 核心逻辑：  
  - 并行加载帖子与评论；支持收藏切换。  
  - 在正文内捕获选区，弹出“加入引用/翻译”操作。  
  - AI 面板维护消息流与引用 chips（当前为前端演示回答）。  
  - 底部支持评论发布（待审核）。  
- 代码： [PostDetailPage.tsx](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PostDetailPage.tsx#L23-L400)

9) `src/ui/pages/PaperPdfReaderPage.tsx`  
- 作用：论文阅读页（左 PDF 右 AI 对话）。  
- 核心逻辑：通过 `resolvePaperPdf(postId)` 选论文 URL，iframe 内嵌 PDF，右侧做对话式阅读辅助。  
- 代码： [PaperPdfReaderPage.tsx](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PaperPdfReaderPage.tsx#L15-L117)

10) `src/ui/pages/PathfinderPage.tsx`  
- 作用：学习路径规划主页面（历史会话、生成计划、阶段闯关、进度追踪、收藏会话）。  
- 主要函数：  
  - 页面逻辑：`submitGoal`、`persistSession`、`hydrateSession`、`onToggleReading`  
  - 纯函数：`recalculateStageStatus`、`pickCurrentStageId`、`calcProgress`、`buildPlanUpdatePrompt`  
- 核心逻辑：  
  - 登录后拉历史会话，支持 sid/stage URL 恢复。  
  - 调用 `/pathfinder/sessions/plan` 生成或改写阶段计划。  
  - 阅读项打勾后自动重算关卡解锁状态并回写后端。  
  - 支持会话收藏与新建对话。  
- 代码：  
  - 页面主流程 [PathfinderPage.tsx](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PathfinderPage.tsx#L44-L538)  
  - 状态重算工具 [PathfinderPage.tsx](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PathfinderPage.tsx#L540-L599)

11) `src/ui/pages/LoginPage.tsx`  
- 作用：登录/注册/找回密码一体页。  
- 主要函数：`validateEmailInput`、`validateRegisterInput`。  
- 核心逻辑：  
  - 双面板切换登录与注册，含验证码发送。  
  - 集成密码重置弹窗流程（请求验证码 + 提交新密码）。  
- 代码： [LoginPage.tsx](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/LoginPage.tsx#L10-L394)

12) `src/ui/pages/FavoritesPage.tsx`  
- 作用：收藏列表。  
- 核心逻辑：鉴权后请求 `/favorites`，复用帖子列表渲染。  
- 代码： [FavoritesPage.tsx](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/FavoritesPage.tsx#L12-L53)

13) `src/ui/pages/FootprintsPage.tsx`  
- 作用：浏览足迹列表。  
- 核心逻辑：鉴权后请求 `/footprints`，复用帖子列表样式。  
- 代码： [FootprintsPage.tsx](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/FootprintsPage.tsx#L11-L47)

14) `src/ui/pages/ProfilePage.tsx`  
- 作用：个人资料管理（昵称/头像/简介）与个人统计。  
- 核心逻辑：  
  - 拉取 me/favorites/footprints 统计。  
  - 支持头像上传、资料 patch、并触发 `auth.refreshMe()` 同步导航态。  
- 代码： [ProfilePage.tsx](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/ProfilePage.tsx#L12-L130)

15) `src/ui/pages/VisualizationPage.tsx`  
- 作用：帖子时间轴散点可视化（D3）。  
- 核心逻辑：  
  - 时间映射 X 轴、source 映射 Y 轴。  
  - tooltip 展示节点信息，点击跳转详情。  
- 代码： [VisualizationPage.tsx](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/VisualizationPage.tsx#L21-L146)

16) `src/ui/pages/AdminCommentsPage.tsx`  
- 作用：管理员评论审核页。  
- 核心逻辑：按状态筛选评论，对 `PENDING` 执行通过/驳回。  
- 代码： [AdminCommentsPage.tsx](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/AdminCommentsPage.tsx#L13-L112)

17) `src/ui/pages/AdminUsersPage.tsx`  
- 作用：管理员用户管理。  
- 主要函数：`hasRole`、`nextRoles`。  
- 核心逻辑：支持禁用/启用、授予/移除 ADMIN、吊销登录。  
- 代码： [AdminUsersPage.tsx](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/AdminUsersPage.tsx#L13-L135)

18) `src/ui/pages/AdminMailSettingsPage.tsx`  
- 作用：邮件模板后台配置页。  
- 核心逻辑：按模板类型加载，编辑 subject/body 后保存。  
- 代码： [AdminMailSettingsPage.tsx](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/AdminMailSettingsPage.tsx#L11-L97)

### 3.5 布局组件（layout）

19) `src/ui/layout/TopNav.tsx`  
- 作用：顶部导航与用户入口。  
- 核心逻辑：按登录态与 ADMIN 角色动态显示菜单；支持退出登录。  
- 代码： [TopNav.tsx](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/layout/TopNav.tsx#L5-L84)

20) `src/ui/layout/Page.tsx`  
- 作用：统一页面头部布局（title/subtitle/actions）。  
- 代码： [Page.tsx](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/layout/Page.tsx#L3-L16)

21) `src/ui/layout/NotFoundPage.tsx`  
- 作用：404 页面。  
- 核心逻辑：引导回帖子列表。  
- 代码： [NotFoundPage.tsx](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/layout/NotFoundPage.tsx#L5-L18)

### 3.6 通用组件（components）

22) `src/ui/components/AiMarkdown.tsx`  
- 作用：轻量 Markdown 渲染（标题/引用/列表/代码/行内格式）。  
- 主要函数：`parseBlocks`、`renderInline`、`AiMarkdown`。  
- 代码： [AiMarkdown.tsx](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/components/AiMarkdown.tsx#L10-L137)

23) `src/ui/components/RichText.tsx`  
- 作用：文章正文块渲染（h1/h2/h3/段落/quote/list/code）。  
- 主要函数：`toBlocks`、`renderBlock`、`RichText`。  
- 代码： [RichText.tsx](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/components/RichText.tsx#L10-L135)

24) `src/ui/components/Alert.tsx`  
- 作用：提示框组件（default/danger/warning）。  
- 代码： [Alert.tsx](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/components/Alert.tsx#L5-L16)

25) `src/ui/components/AppErrorBoundary.tsx`  
- 作用：全局渲染异常兜底。  
- 核心逻辑：捕获异常后展示错误页，支持恢复或刷新。  
- 代码： [AppErrorBoundary.tsx](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/components/AppErrorBoundary.tsx#L6-L50)

26) `src/ui/components/Button.tsx`  
- 作用：统一按钮样式封装。  
- 核心逻辑：`variant` 映射 className。  
- 代码： [Button.tsx](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/components/Button.tsx#L5-L10)

27) `src/ui/components/Card.tsx`  
- 作用：统一卡片容器。  
- 核心逻辑：可选内边距。  
- 代码： [Card.tsx](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/components/Card.tsx#L3-L7)

28) `src/ui/components/EmptyState.tsx`  
- 作用：空状态提示。  
- 代码： [EmptyState.tsx](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/components/EmptyState.tsx#L3-L10)

29) `src/ui/components/ErrorState.tsx`  
- 作用：统一错误显示。  
- 核心逻辑：调用 `normalizeError` 萃取 message/code/requestId 并可重试。  
- 代码： [ErrorState.tsx](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/components/ErrorState.tsx#L6-L25)

30) `src/ui/components/Spinner.tsx`  
- 作用：加载态组件。  
- 代码： [Spinner.tsx](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/components/Spinner.tsx#L1-L8)

### 3.7 Hooks 与工具函数

31) `src/ui/hooks/useAsyncData.ts`  
- 作用：异步加载状态管理（idle/loading/success/error）。  
- 主要函数：`useAsyncData`。  
- 核心逻辑：支持 AbortController、依赖变化自动重拉、`reload` 手动触发。  
- 代码： [useAsyncData.ts](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/hooks/useAsyncData.ts#L14-L50)

32) `src/ui/utils/errors.ts`  
- 作用：错误对象标准化。  
- 主要函数：`normalizeError`。  
- 代码： [errors.ts](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/utils/errors.ts#L9-L24)

33) `src/ui/utils/format.ts`  
- 作用：时间格式化、阅读时长估算、摘要截断、来源图标映射。  
- 主要函数：`formatDateTime`、`readingTimeMinutes`、`excerpt`、`sourceMeta`。  
- 代码： [format.ts](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/utils/format.ts#L1-L34)

34) `src/ui/utils/jwt.ts`  
- 作用：JWT payload 解码。  
- 主要函数：`decodeJwtPayload`。  
- 核心逻辑：Base64URL 解码并容错返回 `sub/roles/exp`。  
- 代码： [jwt.ts](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/utils/jwt.ts#L3-L27)

35) `src/ui/utils/paper.ts`  
- 作用：Demo 论文库映射。  
- 主要函数：`resolvePaperPdf(postId)`。  
- 核心逻辑：通过 postId 校验和稳定映射到内置论文 URL。  
- 代码： [paper.ts](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/utils/paper.ts#L3-L16)

### 3.8 样式文件

36) `src/ui/styles/global.css`  
- 作用：全站样式体系（布局、组件、阅读区、Pathfinder、响应式）。  
- 核心逻辑：定义设计变量、通用原子类与各页面模块化 class。  
- 代码： [global.css](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/styles/global.css#L1-L739)

37) `src/ui/styles/login.css`  
- 作用：登录/注册双面板与动画样式。  
- 核心逻辑：容器位移类（`pf-is-txl/txr/z`）、过渡动画（`pf-is-gx`）与找回密码弹窗样式。  
- 代码： [login.css](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/styles/login.css#L3-L300)

### 3.9 Mock 源码

38) `apps/paperflow-web/mock/server.mjs`  
- 作用：前端联调 Mock API 服务。  
- 主要函数：`ok/err` 封装、`parseAuth`、认证/帖子/评论/审核路由。  
- 核心逻辑：  
  - 使用内存 posts/users/comments 模拟后端。  
  - 登录返回 base64url token，管理员接口校验 `ADMIN` 角色。  
  - 提供帖子列表、详情、评论创建与审核闭环。  
- 代码： [server.mjs](file:///F:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/mock/server.mjs#L5-L185)

---

## 4. 总结（开发者视角）

- `/app` 现状是「FastAPI + MinerU + DeepSeek + LangGraph + PostgreSQL」的后端聚合层，核心价值在于 PDF 解析归一化与 5-Agent 编排落库。
- `/apps/paperflow-web` 采用「typed API + `useAsyncData` + 页面分域」结构，Pathfinder 页面是最复杂交互中心（历史会话、计划生成、阶段状态机、后端持久化）。
- `mock/server.mjs` 提供了最小闭环联调能力，便于后端未全量可用时保证 UI 可演示。
