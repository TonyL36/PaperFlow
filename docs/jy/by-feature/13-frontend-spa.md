# 13. 前端 SPA：Notion 风格、/paperflow 子路径、Mock/真实后端双模式

本章把前端的工程结构、运行方式、关键代码与“为什么这么做”集中说明，便于你后续扩展成 Notion 更完整的交互体验。

## 13.1 目标与约束

目标：

- 用最小实现跑通“网关 API → 页面交互 → 可视化渲染”
- 支持 Mock（3151）与真实网关（3151）两种后端来源，前端口固定 9628
- 支持子路径部署：用户入口统一为 `/paperflow`

约束：

- 前端不直接打任何下游服务，只打 `/api/*`，由 dev proxy 转到网关
- 不引入重型 UI 框架，靠全局 CSS + 统一布局实现 Notion 风格

## 13.2 工程位置与入口

- 工程目录：[`apps/paperflow-web`](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web)
- Vite 配置：[`vite.config.ts`](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/vite.config.ts)
- React 入口：[`main.tsx`](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/main.tsx)
- 路由与页面容器：[`App.tsx`](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/App.tsx)
- API 客户端：[`api.ts`](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/data/api.ts)

## 13.3 端口与访问路径（你指定的口径）

- 前端：`http://localhost:9628/paperflow/`
- 后端网关（或 Mock API）：`http://localhost:3151`

关键点是：前端 URL 永远包含 `/paperflow`，后端 URL 永远是 `3151`。

## 13.4 为什么必须做 /paperflow 子路径（Vite base + Router basename）

### 13.4.1 Vite `base` 解决静态资源路径

当 SPA 部署在 `/paperflow` 下时，静态资源（JS/CSS）必须带前缀，否则刷新或 deep link 会出现 404。

配置位置：[`vite.config.ts`](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/vite.config.ts#L4-L6)

```ts
export default defineConfig({
  base: "/paperflow/",
  plugins: [react()],
  // ...
});
```

### 13.4.2 Router `basename` 解决深链路与刷新

路由同理：如果用户直接访问 `/paperflow/posts/<id>`，Router 必须知道“根”不是 `/` 而是 `/paperflow`。

实现方式：用 Vite 的 `import.meta.env.BASE_URL` 推导 basename：

- [`main.tsx`](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/main.tsx#L8-L16)

```tsx
const rawBaseUrl = import.meta.env.BASE_URL;
const routerBasename = rawBaseUrl.endsWith("/") ? rawBaseUrl.slice(0, -1) : rawBaseUrl;

<BrowserRouter basename={routerBasename || "/"}>
  <App />
</BrowserRouter>
```

这样 build 产物与 dev server 都会一致使用 `/paperflow/`。

## 13.5 为什么前端只打 `/api/*`（dev proxy）

前端只打 `/api/*`，开发环境通过 Vite proxy 转发到后端（默认 3151）：

- [`vite.config.ts`](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/vite.config.ts#L7-L17)

```ts
proxy: {
  "/api": {
    target: process.env.VITE_API_BASE ?? "http://localhost:3151",
    changeOrigin: true
  }
}
```

这样做的好处：

- 前端代码不需要关心 user-service/content-service 的端口与部署方式
- 生产环境只需要把 `/api/*` 指向网关即可，浏览器同源也更好处理
- 认证/限流/错误归一化只需要做在网关，前端只负责展示与交互

## 13.6 Notion 风格 UI 的实现方式（轻量）

整体采用“Shell 布局 + 统一卡片/控件样式 + 留白排版”的方式，尽量接近 Notion 的体验：

- 全局样式：[`global.css`](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/styles/global.css)
- 页面容器：[`App.tsx`](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/App.tsx)

你后续如果要更像 Notion，可以沿这个方向迭代：

- Sidebar 支持“空间/页面树”
- Page 标题区支持 icon、cover
- 内容区支持 block 渲染（markdown / blocks）
- 右键菜单与 slash menu

## 13.7 运行方式（Mock/真实后端）

### 13.7.1 Mock 模式

```powershell
cd .\apps\paperflow-web
npm i
npm run dev:mock
```

- 前端：`http://localhost:9628/paperflow/`
- Mock API：`http://localhost:3151`

### 13.7.2 真实后端模式

先启动后端：网关 `3151` + 用户服务 `8081` + 内容服务 `8082`（由网关转发）。

再启动前端：

```powershell
cd .\apps\paperflow-web
npm i
npm run dev
```

### 13.7.3 一键启动（前后端一起，用于本地查看）

在仓库根目录执行：

```powershell
.\scripts\dev.ps1 up
```

它会做的事情：

- Maven 构建 3 个后端服务 jar（跳过测试）
- 启动：content-service（8082）、user-service（8081）、api-gateway（3151）
- 启动：前端 dev server（默认 9628）
- 打开演示接收接口开关：`paperflow.demo-ingest.enabled=true`，token 默认 `demo-token`
- 日志输出到：`PaperFlow/.dev/logs/`

可选参数：

```powershell
.\scripts\dev.ps1 up -SkipBuild
.\scripts\dev.ps1 up -Force
.\scripts\dev.ps1 up -DemoIngestToken your-token
.\scripts\dev.ps1 status
.\scripts\dev.ps1 down
```

常见问题：

- `spring-boot-maven-plugin:repackage ... Unable to rename ... .jar.original`
  - 通常是之前启动的 `java -jar ...` 还在占用 jar 文件（Windows 下会锁文件）
  - 先执行 `.\scripts\dev.ps1 down`，或 `.\scripts\dev.ps1 up -Force` 再重试
- `port in use: 3151/8081/8082/9628`
  - 说明本机已有进程占用了端口；优先执行 `.\scripts\dev.ps1 down`
  - 如果不是脚本启动的进程，用 `.\scripts\dev.ps1 up -Force` 让脚本按端口杀掉占用进程
- 第一次启动弹出 Windows 防火墙提示 / 看到很多 java.exe 弹窗
  - 防火墙提示属于系统行为，允许后即可
  - 脚本已把后端与前端进程用隐藏窗口启动，日志写到 `PaperFlow/.dev/logs/`

## 13.8 可视化页面（验证“业务层 → 可视化”链路）

可视化页面：`/paperflow/viz`

- 数据来源：`GET /api/v1/posts`
- 渲染：D3 散点图（时间 × 来源）
- 交互：点击节点跳转帖子详情

代码位置：

- [`VisualizationPage.tsx`](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/VisualizationPage.tsx)

## 13.9 延伸阅读

- 阅读体验升级（Feed/Detail/块级正文/错误兜底）：[16-frontend-reading-experience.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/by-feature/16-frontend-reading-experience.md)
