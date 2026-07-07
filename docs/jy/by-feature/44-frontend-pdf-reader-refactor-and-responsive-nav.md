# 44 PDF 阅读页重构、响应式收口与导航修复开发总结

这篇文档记录近两天 `PaperFlow` 前端阅读链路的集中改造。它不只是一次“页面样式微调”，而是围绕 `PDF` 阅读体验做了一次从结构到运行态的系统收口，主要包含 5 条线：

- `PaperPdfReaderPage` 从大组件拆成“页面装配层 + Hook + 子组件”
- `PDF` 主视图、缩略图、文字层、划词浮层、`AI` 对话的职责重新分层
- 阅读页在高倍率和窄宽度下的响应式布局重新定义
- 顶部导航在登录态/高倍率场景下改成三态布局与 `More` 收纳
- 本地联调、白屏排查、云端运行态验证和测试合同一起补齐

如果只看结果，这轮工作的目标很直接：

- 阅读页后续还能继续改，但不能再回到“一个文件堆满副作用”的状态
- 页面缩放到 `150% / 175% / 200% / 300%` 时，阅读链路要尽量保持可用
- 顶部导航在演示和日常使用里都不能再挤爆
- 本地和云端都要有稳定的验证路径，而不是只靠“感觉这次应该没问题”

## 功能目标与边界

目标：

- 降低 `PaperPdfReaderPage` 的维护成本和回归风险
- 稳定 `PDF` 页面渲染、缩略图联动、文字层划词和 `AI` 对话链路
- 收口阅读页在高倍率/窄宽度下的布局异常
- 解决顶部导航在登录态入口较多时的挤压问题
- 建立围绕阅读页与导航的结构合同测试、响应式测试和运行态验证路径

边界：

- 不重做整套 `PDF` 渲染技术栈，仍然基于现有 `pdfjs-dist`
- 不把阅读页做成移动端优先页面，本轮重点是桌面浏览器高倍率和窄宽度可用性
- 不在这轮里重写全站布局系统，只修阅读页和顶部导航的关键断点
- 云端部分以“稳定联调、谨慎热修、避免误发布”为原则，不把不相关改动混进上线包

## 改造前的问题基线

这轮问题并不是单点故障，而是多类问题堆在一起：

1. `PaperPdfReaderPage` 同时承担文档加载、主视图与缩略图同步、文字层选区、`AI` 对话和布局判断，状态、`ref`、`effect` 混在一个文件里。
2. 阅读页在高倍率下会出现左栏隐藏后空一大片、主阅读区不居中、右侧面板抢空间、头部按钮挤压等问题。
3. 文字层在边缘位置划词时，会出现高亮和选区向右溢出的老问题。
4. 顶部导航在登录态入口增多后，高倍率下很容易撑爆一行，影响演示。
5. 本地运行时一度出现“`vite connected` 但页面白板”的情况，导致运行态验证成本很高。

所以这次不是“修一个 `CSS` 就完”，而是需要把结构、布局、渲染、测试和联调一起补齐。

## 第一阶段：阅读页从巨型组件改成装配层

这轮重构最核心的一步，是把 `PaperPdfReaderPage` 从“大组件”拆成真正的装配层。

原来的问题是：页面内部同时维护了 `PDF` 生命周期、可见页状态、缩略图同步、选区浮层、消息列表、引用片段、发送请求和大量 DOM 副作用。这样做的直接后果就是：

- 改一个阅读交互，很容易碰坏 `AI` 对话
- 改一个布局逻辑，很容易影响 `PDF` 渲染
- 测试只能靠“整页大而全”去兜，结构边界不清楚

重构后的职责拆分如下：

### 1. `usePdfDocument()`

负责：

- 加载 `PDF` 文档
- 管理文档生命周期
- 维护 `loading / error / doc`

意义：

- 页面本体不再直接操作 `pdfjs` 的加载和销毁逻辑

### 2. `usePdfViewport()`

负责：

- 当前页、可见页、缩放值
- 主阅读区与缩略图的联动
- 页面级布局缓存与滚动同步
- 高倍率下的主视图可用宽度适配

意义：

- 主阅读区、缩略栏和缩放策略终于从页面本体里剥离出来

### 3. `usePdfSelectionController()`

负责：

- 选区浮层显隐
- 选中文本提取
- 点击外部关闭
- 滚动、缩放、窗口变化时隐藏浮层

意义：

- `window.getSelection()`、全局事件监听和浮层定位不再散落在页面里

### 4. `usePaperReaderChat()`

负责：

- 阅读页右侧 `AI` 对话状态
- 引用片段添加/移除
- 翻译片段到对话
- 发送问题并更新消息流

意义：

- 阅读页本体不再维护一整套聊天状态机

### 5. `PdfThumbnailRail` / `PdfMainViewport`

负责：

- 左侧缩略栏展示与跳页
- 主阅读视口展示、渲染入口和选区回调挂接

意义：

- 页面真正变成“装配和接线”，而不是“自己实现全部功能”

这一阶段完成后，阅读页后续再改时，基本可以按“文档加载 / 视口 / 选区 / 对话 / 布局”分区处理，维护成本明显下降。

## 第二阶段：渲染链路与文字层稳定性修复

把结构拆开只是第一步，阅读体验真正难的是渲染和选区。

### 1. 本地白板问题收口

本地曾出现过“服务在线、控制台没红错、页面就是白的”问题。最后确认不是接口 404，而是启动链路和运行环境共同导致的：

- 阅读页依赖 `pdfjs-dist`，首页静态引入会放大启动风险
- `localhost` 在当前 IDE/WebView 环境里不够稳定

对应收口方式是：

- 阅读页在 `App` 中改为路由级懒加载
- 本地调试默认改为 `127.0.0.1`
- 新增 `npm run dev:cloud`，固定用云端 API 做联调

这样做之后，本地验证路径变成：

- 在 `apps/paperflow-web` 执行 `npm run dev:cloud`
- 打开 `http://127.0.0.1:9630/paperflow/`

这条路径后来成为整个阅读页运行态验证的稳定入口。

### 2. `zoom` 改成 `transform: scale(...)`

早期阅读页为了缩放方便，用过浏览器 `zoom`。但在实际运行里，这会导致：

- `canvas` 视觉位置和真实几何位置错开
- 用户看到的效果像“页面壳在，正文像白板”

这轮把主视图缩放策略改成：

- 固定逻辑页宽
- 用 `transform: scale(...)` 做显示缩放

这样做的好处是：

- 主阅读区几何坐标更稳定
- 后续文字层和划词可以围绕统一的逻辑宽度计算
- 高倍率下不容易出现“壳在、内容飞掉”的情况

### 3. 文字层 `scaleX` 修正与边缘过滤

这部分是阅读体验里最容易反复出问题的点。

本轮延续并加强了之前的文字层策略：

- 先固定逻辑页宽，稳定坐标系
- 文字层手写 `span`，不直接依赖浏览器自然排版
- 按 `PDF` 原始文字宽度和实际可用宽度计算 `scaleX`
- 对左右边缘疑似竖排水印/边注内容做过滤，尽量保留正文和页码

后面在高倍率场景里，针对“划词向右溢出”又补了一层约束：

- 靠近右边缘时，不再盲目按原比例继续拉伸文字层
- 会根据剩余可用宽度收紧 `scaleX`

这一步的意义不是“让所有文字都变窄”，而是尽量避免靠右文本继续顶出页面边界，导致选区和高亮错位。

## 第三阶段：阅读页响应式规则重做

结构拆好、渲染稳定后，真正折磨人的问题变成了高倍率下的布局。

这轮响应式收口，不再只靠零散 `CSS`，而是明确抽成一个布局决策函数：

- `autoHideRail`
- `stackPanels`

对应规则是：

- `1360px` 以下：自动隐藏左侧缩略栏
- `1280px` 以下：改成主阅读区和 `AI` 面板堆叠布局

### 1. 左侧缩略栏自动隐藏

高倍率下，如果还强保留左栏，阅读区会被挤得很碎。所以第一步策略是“先收左栏”。

但这一步后来暴露了两个具体问题：

- 左栏隐藏后，左边空一大片，视觉上像布局没补位
- 再缩回去时，缩略图虽然栏回来了，但内容不一定立刻恢复

后续修正包括：

- 左栏恢复时重新触发缩略图渲染接线
- 主阅读区在无左栏状态下重新计算占位，避免“空一大片”

### 2. `PDF + AI` 双栏与堆叠布局切换

在 `150% / 175%` 这种高倍率但还没到极窄宽度的场景里，最容易出现的问题是：

- 左栏没了，但 `PDF` 没居中
- 右侧 `AI` 面板仍然挤占空间
- 整个页面像“两个板块都没站好位置”

这轮最后采用的策略是：

- 宽度继续缩小时，不再硬撑双栏
- 更早切到“`PDF` 在上、`AI` 在下”的堆叠布局

这样做的目的是保证主阅读行为优先，不让 `AI` 面板把阅读区挤坏。

### 3. 单栏时继续允许缩小，不锁死缩放下限

另一个关键修正是：单栏模式下，不能把显示缩放硬锁在一个过高的最小值。

之前高倍率时 `displayZoom` 有下限，导致：

- 页面再窄也不继续缩
- 用户会看到 `PDF` 明明已经只剩一栏，视觉上却还在偏右
- 高倍率下靠右划词问题更容易复现

后面把这条限制放开后，主阅读区在超高倍率场景里的稳定性明显更好。

## 第四阶段：阅读页头部和顶部导航一起收口

阅读页主体稳定后，接下来暴露的是顶部区域问题。

### 1. 阅读页头部响应式补齐

阅读页上方这组元素：

- `论文阅读`
- `← 返回文章详情`
- `隐藏缩略栏`
- 自动隐藏提示

在高倍率下会发生标题和操作区互相挤压。

这轮通过给通用 `Page` 壳增加可扩展的头部类名入口，让阅读页可以单独控制：

- header
- title row
- actions

高倍率/窄宽度下，头部会切成纵向堆叠，而不是继续死撑一行。

### 2. 顶部导航改成三态布局

全局 `TopNav` 是这两天另一条重点线。之前的问题是：

- 登录态入口多时，一行很容易撑爆
- 高频入口和低频入口混在一起，没有收纳策略
- 演示场景下，顶栏一乱，整体质感会直接下降

这轮改造把导航拆成三态：

- `full`：完整图标 + 文字
- `compact`：核心入口保留，更紧凑展示
- `collapsed`：次级入口收进 `More`

同时做了入口分层：

- 高频常驻：`Feed`、`Viz`、`Pathfinder`
- 登录态高频入口尽量保留：`Favorites`、`Messages`
- 低频或管理入口：收进 `More`

这样做后，演示和日常使用时，顶栏不再靠“硬挤一行”维持完整信息。

## 第五阶段：测试与运行态验证补齐

这轮不是先改完再看运气，而是边拆边补合同测试。

### 1. 结构合同测试

重点验证：

- 阅读页是否已经改成装配层
- `usePdfDocument()`、`usePdfViewport()`、`usePdfSelectionController()`、`usePaperReaderChat()` 是否都真正接入
- 原来页面里不该再出现的状态和副作用是否已经移走

对应测试包括：

- `paperPdfReaderRefactorIntegration.test.ts`
- `paperPdfReaderSelectionRefactorIntegration.test.ts`
- `paperPdfReaderChatRefactorIntegration.test.ts`

### 2. 响应式与布局合同测试

重点验证：

- 阅读页断点规则是否还在
- 左栏自动隐藏逻辑是否还在
- 阅读页头部响应式是否还在
- 不再回退到不稳定的 `zoom` 布局

对应测试包括：

- `pdfReaderResponsiveLayout.test.ts`
- `paperPdfReaderHeaderResponsive.test.ts`
- `paperPdfReaderResponsiveRailIntegration.test.ts`
- `paperPdfReaderLayoutContract.test.ts`

### 3. 文字层算法测试

重点验证：

- 文字层宽度修正是否仍然生效
- 边缘过滤是否不会误伤正文
- 划词相关基础逻辑是否没有被响应式改动带坏

对应测试包括：

- `paperPdfTextLayer.test.ts`
- `paperPdfTextLayerIntegration.test.ts`

### 4. 本地联调与类型检查

这轮实际稳定使用的命令是：

```bash
cd F:\Gitee\PaperFlow\PaperFlow\apps\paperflow-web
npm run dev:cloud
npm run test -- src/ui/layout/topNavResponsive.test.ts src/ui/pages/pdfReader/pdfReaderResponsiveLayout.test.ts src/ui/pages/paperPdfReaderHeaderResponsive.test.ts src/ui/pages/paperPdfReaderLayoutContract.test.ts src/ui/pages/paperPdfReaderResponsiveRailIntegration.test.ts src/ui/pages/paperPdfReaderRefactorIntegration.test.ts src/ui/pages/paperPdfReaderSelectionRefactorIntegration.test.ts src/ui/pages/paperPdfReaderChatRefactorIntegration.test.ts src/ui/pages/paperPdfReaderSmokeContract.test.ts src/ui/devServerConfigIntegration.test.ts src/ui/pages/paperPdfTextLayer.test.ts src/ui/pages/paperPdfTextLayerIntegration.test.ts
npm run typecheck
```

实际结果：

- 阅读页与导航相关的定向测试已通过
- `typecheck` 通过
- 本地运行态已能稳定打开首页、帖子流和论文阅读页

### 5. 云端运行态检查

云端部分这两天主要做的是“谨慎验证”，不是“无脑重启”。

已确认的点包括：

- 首页、帖子流、阅读页关键路径可访问
- 阅读页中左侧缩略图、主阅读区入口和右侧 `AI` 面板可见
- 顶部导航登录态正常展示
- 控制台没有阻断级红错

同时也明确避开了一类高风险操作：

- 不在工作区脏、云端配置有漂移时强行整仓发布

这一步虽然不算传统意义上的“前端重构”，但它保证了这轮改造不是停在本地，而是能在演示前真正跑起来。

## 关键文件清单

阅读页与响应式主线：

- `apps/paperflow-web/src/ui/pages/PaperPdfReaderPage.tsx`
- `apps/paperflow-web/src/ui/pages/pdfReader/usePdfDocument.ts`
- `apps/paperflow-web/src/ui/pages/pdfReader/usePdfViewport.ts`
- `apps/paperflow-web/src/ui/pages/pdfReader/usePdfSelectionController.ts`
- `apps/paperflow-web/src/ui/pages/pdfReader/usePaperReaderChat.ts`
- `apps/paperflow-web/src/ui/pages/pdfReader/PdfThumbnailRail.tsx`
- `apps/paperflow-web/src/ui/pages/pdfReader/PdfMainViewport.tsx`
- `apps/paperflow-web/src/ui/pages/pdfReader/pdfReaderResponsiveLayout.ts`
- `apps/paperflow-web/src/ui/pages/paperPdfTextLayer.ts`

页面壳与导航：

- `apps/paperflow-web/src/ui/layout/Page.tsx`
- `apps/paperflow-web/src/ui/layout/TopNav.tsx`
- `apps/paperflow-web/src/ui/styles/global.css`
- `apps/paperflow-web/src/ui/App.tsx`

联调与运行：

- `apps/paperflow-web/package.json`
- `apps/paperflow-web/vite.config.ts`
- `docs/jy/by-feature/19-local-dev-scripts.md`

测试：

- `apps/paperflow-web/src/ui/pages/paperPdfReaderRefactorIntegration.test.ts`
- `apps/paperflow-web/src/ui/pages/paperPdfReaderSelectionRefactorIntegration.test.ts`
- `apps/paperflow-web/src/ui/pages/paperPdfReaderChatRefactorIntegration.test.ts`
- `apps/paperflow-web/src/ui/pages/paperPdfReaderSmokeContract.test.ts`
- `apps/paperflow-web/src/ui/pages/paperPdfReaderLayoutContract.test.ts`
- `apps/paperflow-web/src/ui/pages/paperPdfReaderHeaderResponsive.test.ts`
- `apps/paperflow-web/src/ui/pages/paperPdfReaderResponsiveRailIntegration.test.ts`
- `apps/paperflow-web/src/ui/pages/pdfReader/pdfReaderResponsiveLayout.test.ts`
- `apps/paperflow-web/src/ui/pages/paperPdfTextLayer.test.ts`
- `apps/paperflow-web/src/ui/pages/paperPdfTextLayerIntegration.test.ts`
- `apps/paperflow-web/src/ui/layout/topNavResponsive.test.ts`
- `apps/paperflow-web/src/ui/devServerConfigIntegration.test.ts`

## 这轮最关键的工程判断

回头看，这两天最重要的不是“修了几个 bug”，而是做了几条对后续维护影响很大的判断：

1. 阅读页必须坚持“装配层 + Hook + 展示组件”，不能把逻辑再堆回页面本体。
2. `PDF` 文字层问题不能只靠 `CSS` 猜，必须围绕坐标系、逻辑页宽和文字原始宽度去修。
3. 高倍率场景下，布局优先级应当是“先保主阅读，再收左栏，再决定 `AI` 面板站位”。
4. 顶部导航需要做“核心入口常驻 + 次级入口收纳”，而不是一味压缩字号和间距。
5. 本地和云端验证要分层：先保本地联调稳定，再谨慎处理线上环境，避免把未知改动一起带上云。

## 当前状态

截至这篇文档落笔时，这轮阅读页与导航改造已经达到以下状态：

- 阅读页核心职责已完成拆分
- 选区、缩略图、`AI` 对话和主视图接线已从页面本体下沉
- 阅读页在高倍率和窄宽度下的主要布局问题已收口
- 顶部导航已具备三态布局与 `More` 收纳策略
- 本地联调和定向测试路径已建立
- 云端关键页面已完成演示前冒烟验证

但也要明确两点：

- 这轮并没有把全站所有响应式问题一次性做完，重点还是阅读链路和顶部导航
- 云端配置层仍存在历史漂移，需要后续在正式发布窗口谨慎整理，而不是在演示前强行重启或整仓替换

## 后续建议

建议下一轮继续做下面几件事：

- 增加浏览器级回归截图，重点覆盖 `150% / 175% / 200% / 300%`
- 为阅读页补一条更接近真实用户路径的页面级冒烟测试
- 把阅读页断点和导航断点抽成共享常量，减少样式和逻辑分叉
- 在正式发布前梳理工作区改动，按“阅读页 / 导航 / 配置 / 文档”拆分提交
- 单独整理一份云端配置漂移排查文档，避免以后再靠记忆判断线上状态

## 一句话结论

这两天的工作本质上是在做一件事：把 `PaperFlow` 最容易在演示和后续迭代里出问题的阅读链路，从“能跑但脆弱”收口成“结构更清楚、布局更稳、验证路径更明确”的状态。
