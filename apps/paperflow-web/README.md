# PaperFlow React SPA（本地跑通业务层 + 可视化）

## 1) Mock 模式（推荐先跑通）

```powershell
cd .\apps\paperflow-web
npm i
npm run dev:mock
```

- 前端：`http://localhost:9628/paperflow/`
- Mock API：`http://localhost:3151`

登录账号：

- 普通用户：`alice@example.com / password123`
- 管理员：`admin@example.com / admin12345`

## 2) 对接真实后端网关

先启动后端网关（`http://localhost:3151`），再启动前端：

```powershell
cd .\apps\paperflow-web
npm i
npm run dev
```

默认会把 `/api/*` 代理到 `http://localhost:3151`。
注：SPA 以 `/paperflow` 作为 base path 部署/访问。
