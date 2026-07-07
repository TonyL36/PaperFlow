# 前端 SPA 整体架构详解

## 1. 背景与目标

### 与前序模块的关系
前端模块是整个 PaperFlow 系统的用户界面入口，依赖网关模块提供的统一 API 接口，通过 `/api/*` 路径与后端交互。

### 为什么要做这个架构
- 实现最小闭环的内容站，支持从帖子浏览到 AI 阅读
- 支持本地 Mock 开发和真实后端两种模式，便于独立开发和演示
- 支持 `/paperflow` 子路径部署，便于与其他系统共存
- 实现统一的登录态管理，支持自动 Token 续期

### 功能目标
1. 实现完整的路由结构，区分公开/登录/管理员页面
2. 实现统一的 API 调用封装，支持自动 Token 续期
3. 实现子路径部署支持（Vite base + React Router basename）
4. 支持 Mock API 与真实后端两种开发模式

---

## 2. 架构与流程设计

### 整体架构
```
前端架构分层：
┌─────────────────────────────────────────────────────────┐
│                     UI 层（页面）                        │
│  PostsPage │ PostDetailPage │ LoginPage │ ...          │
├─────────────────────────────────────────────────────────┤
│                   业务逻辑层（API）                        │
│  api.ts：统一 API 封装、Token 管理、错误处理              │
├─────────────────────────────────────────────────────────┤
│                   工具层                                  │
│  http.ts：HTTP 请求底层封装                               │
├─────────────────────────────────────────────────────────┤
│                   状态管理层                              │
│  AuthContext：登录态管理、自动续期                         │
└─────────────────────────────────────────────────────────┘
```

### 关键决策点
| 问题 | 决策 | 理由 |
|------|------|------|
| 子路径部署 | Vite base + React Router basename | 避免刷新/深度链接 404，便于与其他系统共存 |
| API 调用 | 统一封装在 api.ts，只调用 `/api/*` | 开发环境通过 Vite proxy 转发，生产环境直接指向网关，便于切换 Mock/真实后端 |
| 登录态管理 | AuthContext + Token 存储 + 自动续期 | 实现无感知的 Token 刷新，提升用户体验 |
| UI 风格 | 轻量级全局 CSS + 统一布局 | 不引入重型 UI 库，保持代码简洁，类似 Notion 风格 |

---

## 3. 核心代码详解

### 3.1 子路径部署配置

#### Vite 配置 (vite.config.ts)
**文件位置**：[vite.config.ts](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/vite.config.ts)

```typescript
export default defineConfig({
  base: "/paperflow/",
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_API_BASE ?? "http://localhost:3151",
        changeOrigin: true
      }
    }
  }
});
```

| 代码 | 解释 |
|------|------|
| `base: "/paperflow/"` | 所有静态资源路径都会加上此前缀，解决子路径部署下的资源加载问题 |
| `proxy` 配置 | 开发环境下 `/api/*` 请求会被转发到网关（默认 localhost:3151） |

#### React Router 配置 (main.tsx)
**文件位置**：[main.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/main.tsx)

```typescript
const rawBaseUrl = import.meta.env.BASE_URL;
const routerBasename = rawBaseUrl.endsWith("/") ? rawBaseUrl.slice(0, -1) : rawBaseUrl;

<BrowserRouter basename={routerBasename || "/"}>
  <App />
</BrowserRouter>
```

| 代码 | 解释 |
|------|------|
| `import.meta.env.BASE_URL` | Vite 提供的环境变量，值与 vite.config.ts 中的 base 一致 |
| `basename` | React Router 的根路径，确保路由与子路径部署一致 |

### 3.2 路由与权限控制

#### 路由结构 (App.tsx)
**文件位置**：[App.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/App.tsx)

```typescript
export function App() {
  const loc = useLocation();
  const isLogin = loc.pathname === "/login";
  const isWidePage = loc.pathname.startsWith("/pathfinder") || loc.pathname.startsWith("/papers/");
  return (
    <div className="pf-app">
      {isLogin ? null : <TopNav />}
      <div className={isLogin ? undefined : ["pf-container", isWidePage ? "pf-container--wide" : null].filter(Boolean).join(" ")}>
        <AppErrorBoundary>
          <Routes>
            <Route path="/" element={<Navigate to="/posts" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/posts" element={<PostsPage />} />
            <Route path="/posts/:postId" element={<PostDetailPage />} />
            <Route
              path="/me"
              element={
                <RequireAuth>
                  <ProfilePage />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/users"
              element={
                <RequireAdmin>
                  <AdminUsersPage />
                </RequireAdmin>
              }
            />
          </Routes>
        </AppErrorBoundary>
      </div>
    </div>
  );
}

function RequireAuth(props: { children: React.ReactNode }) {
  const auth = useAuth();
  if (auth.state.status !== "authenticated") {
    return <Navigate to="/login" replace />;
  }
  return <>{props.children}</>;
}

function RequireAdmin(props: { children: React.ReactNode }) {
  const auth = useAuth();
  if (auth.state.status !== "authenticated") {
    return <Navigate to="/login" replace />;
  }
  if (!auth.state.roles.includes("ADMIN")) {
    return <Navigate to="/posts" replace />;
  }
  return <>{props.children}</>;
}
```

| 代码 | 解释 |
|------|------|
| `RequireAuth` | 路由守卫，未登录则跳转到登录页 |
| `RequireAdmin` | 路由守卫，非管理员则跳转到首页 |
| `TopNav` | 顶部导航栏，登录页不显示 |
| `pf-container` | 页面容器，支持宽页模式（Pathfinder/PDF 阅读） |

### 3.3 统一 API 封装 (api.ts)
**文件位置**：[api.ts](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/data/api.ts)

核心 API 封装模式：
```typescript
export async function apiLogin(req: LoginReq): Promise<string> {
  const data = await httpJson<AuthResp>("/api/v1/auth/login", { 
    method: "POST", 
    body: JSON.stringify(req) 
  });
  return data.accessToken;
}

export async function apiRefresh(): Promise<string> {
  const data = await httpJson<AuthResp>("/api/v1/auth/refresh", { 
    method: "POST", 
    body: JSON.stringify({}) 
  });
  return data.accessToken;
}

export async function apiListPosts(pageNumber: number, pageSize: number): Promise<Paged<Post>> {
  const data = await httpJson<Paged<Post>>(`/api/v1/posts?page[number]=${pageNumber}&page[size]=${pageSize}`, { method: "GET" });
  return {
    ...data,
    items: data.items.map((it) => normalizePostPaperProtocol(it))
  };
}
```

| 代码 | 解释 |
|------|------|
| `apiLogin` | 登录接口，返回 access token |
| `apiRefresh` | 刷新 token 接口 |
| `apiListPosts` | 获取帖子列表，包含 normalizePostPaperProtocol 用于兼容不同格式的帖子数据 |

---

## 4. 接口契约
前端与后端的接口契约统一由网关定义，详见网关和各后端服务模块文档。

---

## 5. 边界与约束
- 前端不直接调用各后端服务，只通过 `/api/*` 与网关交互
- 子路径部署要求所有静态资源路径必须以 `/paperflow/` 开头
- Token 自动续期有超时和重试限制

---

## 6. 常见问题与踩坑经验
### 6.1 刷新页面出现 404
**原因**：子路径部署下，Vite dev server 或生产环境服务器未正确配置 fallback 路由。
**解决**：确保服务器将所有非静态资源请求都返回 index.html。

---

## 7. 可演进方向
- 引入状态管理库（如 Zustand）管理更复杂的应用状态
- 添加单元测试和 E2E 测试
- 引入更完善的 UI 组件库

---

## 8. 小结
本模块介绍了前端 SPA 的整体架构，包括子路径部署配置、路由设计、权限控制和统一 API 封装。

---

## 9. 页内导航

- 所属模块：[前端模块索引](./00-index.md)
- 上一篇：当前已是本模块第一篇，建议先回看 [模块索引](./00-index.md)
- 下一篇：[前端阅读体验详解](./02-reading-experience.md)
- 关联阅读：
  - [网关模块索引](../gateway/00-index.md)
  - [内容服务索引](../content-service/00-index.md)
  - [Python Agent 模块索引](../python-agent/00-index.md)
