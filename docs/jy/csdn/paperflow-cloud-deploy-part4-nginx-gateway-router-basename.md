# 前端挂到 `/paperflow/` 子路径之后，我们是怎么一点点把路径问题排顺的

> 摘要：我们做这个前端部署时，最容易卡住的不是页面功能，而是“路径到底谁说了算”。当前端不是挂在网站根路径，而是放到 `/paperflow/` 这种子路径下面时，`Nginx`、`Vite base`、`React Router basename`、接口代理这几层只要有一层没对上，就很容易出现刷新 404、资源找不到、接口路径混乱。本文按我们真实踩坑的顺序，整理这几层路径是怎么慢慢对齐的。文中的地址、端口和代理目标只保留结构示意，不直接暴露可用于攻击的真实部署信息。
>
> 标签：Nginx｜Vite｜React Router｜前端部署｜反向代理｜子路径部署

如果前端是直接部署在域名根路径下，很多配置确实容易“默认工作”。  
但我们当时一把前端挂到子路径，问题就一下子多起来了。比如：

```text
https://your-domain.example/paperflow/
```

问题就会突然变多：

- 浏览器直接访问 `/` 时该跳去哪；
- 打包后的静态资源到底从 `/assets/...` 取，还是 `/paperflow/assets/...` 取；
- 刷新 `/paperflow/posts` 会不会变成 404；
- React Router 到底要不要配 `basename`；
- `/api/...` 是让前端直连，还是让 Nginx 代理。

先说明一下，这篇里不会放真实公网域名、服务器 IP、管理后台地址、密钥、邮箱账号之类的信息。  
像端口、上游地址这类内容，只保留“怎么接”的结构，不保留可以直接拿去扫机器的细节。

我们最后能把这套路径跑顺，不是因为哪一层特别高深，而是因为这几层终于开始说同一种路径语言了。

## 1. 我们先把前端入口统一成 `/paperflow/`

前端的 `vite.config.ts` 里，最关键的其实就是 `base` 这一层。为了公开发帖不暴露不必要的部署细节，我这里只保留结构：

```ts
export default defineConfig({
  base: "/paperflow/",
  plugins: [react()],
  server: {
    open: "/paperflow/",
    proxy: {
      "/api": {
        target: process.env.VITE_API_BASE ?? "<local-api-base>",
        changeOrigin: true
      }
    }
  }
});
```

这里的 `base: "/paperflow/"` 决定了两件事：

- 打包后的静态资源路径以 `/paperflow/` 为前缀；
- 开发态打开页面时，也优先从 `/paperflow/` 进入。

我们当时就是先把这一步钉住，因为它相当于先声明：

> 这个前端应用不是部署在网站根路径，而是部署在 `/paperflow/` 下面。

只要这件事先说清楚，后面 Nginx 和路由层才有共同的参照物。

## 2. React Router 这层不能凭感觉，必须跟 `base` 一起走

在 `apps/paperflow-web/src/main.tsx` 里，我们没有把路由前缀写死，而是直接从 `import.meta.env.BASE_URL` 派生：

```tsx
const rawBaseUrl = import.meta.env.BASE_URL;
const routerBasename = rawBaseUrl.endsWith("/") ? rawBaseUrl.slice(0, -1) : rawBaseUrl;
const normalizedBasename = routerBasename && routerBasename !== "/" ? routerBasename : "";
const currentPath = window.location.pathname;
const pathWithSlash = `${normalizedBasename}/`;
if (normalizedBasename && currentPath !== normalizedBasename && !currentPath.startsWith(pathWithSlash)) {
  const nextPath = currentPath === "/" ? pathWithSlash : `${normalizedBasename}${currentPath}`;
  window.location.replace(`${nextPath}${window.location.search}${window.location.hash}`);
}

<BrowserRouter basename={routerBasename || "/"}>
  <App />
</BrowserRouter>
```

我们后来回头看，最省心的一点就在这儿：前端路由前缀不是手工写两份，而是直接复用 `Vite base` 的结果。

这能避免一个很常见的问题：

- 打包配置是 `/paperflow/`；
- 但 `BrowserRouter` 还在按 `/` 解释路由；
- 最后跳转、刷新、资源加载全乱套。

另外，这段代码里还有一个我们自己觉得挺有用的小处理：  
如果当前地址没有落在 `basename` 下，就主动重定向过去。

这意味着用户即使从根路径或者别的裸路径进入，也能被收回到统一入口。

## 3. Nginx 这边不只是放静态文件，它还在帮我们把入口收住

`docker/nginx/paperflow.conf` 里，最关键的几个 `location` 大概是这个结构。这里同样省略了不必要的真实部署细节，只保留路径逻辑：

```nginx
location = / {
  return 302 /paperflow/posts;
}

location /api/ {
  proxy_pass http://<gateway-upstream>;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}

location /paperflow/assets/ {
  rewrite ^/paperflow/(.*)$ /$1 break;
  try_files $uri =404;
}

location /paperflow/ {
  rewrite ^/paperflow/(.*)$ /$1 break;
  try_files $uri $uri/ /index.html;
}
```

我们那时候就是靠这几段，硬把几个入口关系拉直的。它们其实分别在解决三件不同的事。

第一件，根路径跳转。  
用户访问 `/` 时，不是直接给一个空白首页，而是明确跳到 `/paperflow/posts`。

第二件，接口代理。  
所有 `/api/` 请求都先经过 Nginx，再转给网关这一层。公开文章里不需要写出真实上游地址，知道“浏览器不直接碰后端服务”这件事就够了。

第三件，子路径静态资源和 SPA 刷新。  
`/paperflow/assets/` 解决打包后资源路径问题，`/paperflow/` 下的 `try_files ... /index.html` 则保证前端路由刷新不会被 Nginx 当成真实文件查找失败。

这三层缺一层都不行。

## 4. 为什么 `/paperflow/assets/` 还要单独拎出来

我们第一次看到这段配置时其实也会疑惑：

- 既然 `/paperflow/` 已经有 `try_files`；
- 为什么 `/paperflow/assets/` 还要单独写一段。

后来真正踩到白屏问题之后，这个原因就很现实了：  
静态资源和前端路由虽然都挂在 `/paperflow/` 下，但语义完全不同。

- `/paperflow/posts`、`/paperflow/login` 这类路径，是 SPA 路由；
- `/paperflow/assets/index-xxxxx.js` 这类路径，是真实静态文件。

如果不把资源目录单独拿出来，最糟的情况就是：

- 资源请求没命中真实文件；
- 又被 fallback 到 `/index.html`；
- 浏览器收到的是 HTML，却以为自己在加载 JS；
- 页面直接白屏。

所以资源路径必须明确按真实文件处理，不能和前端页面路由混在一起。

## 5. `/api` 为什么不并到 `/paperflow/api` 下面

我们最后保留的是这种结构：

```nginx
location /api/ {
  proxy_pass http://<gateway-upstream>;
}
```

而不是：

```text
/paperflow/api/
```

我们最后保留 `/api/...` 这条独立路径，是因为这样更容易把前端入口和后端入口拆开理解：

- `/paperflow/...` 属于前端页面和静态资源入口；
- `/api/...` 属于后端接口入口；
- 两者都由同一个 Nginx 暴露给浏览器，但语义上不混在一起。

这也和前端开发态是一致的。  
`vite.config.ts` 里本地开发代理本质上也是这个结构：

```ts
proxy: {
  "/api": {
    target: process.env.VITE_API_BASE ?? "<local-api-base>",
    changeOrigin: true
  }
}
```

也就是说，无论开发态还是生产态，前端认的都是同一个接口前缀：

```text
/api/...
```

这对我们这种学生项目特别重要，因为开发态和部署态如果连接口前缀都不一样，后面排查的时候特别容易把自己绕晕。

## 6. 后端这边也得继续守住 `/api/v1` 这层边界

前端和 Nginx 路径收住了，后端也要继续保持一致。

`user-service` 和 `content-service` 的 `application.yml` 都定义了：

```yaml
server:
  servlet:
    context-path: /api/v1
```

而网关这边又按 `/api/v1/...` 这套路径做路由分发：

```yaml
- Path=/api/v1/auth/**
- Path=/api/v1/users/**,/api/v1/public/users/**
- Path=/api/v1/posts,/api/v1/posts/**
- Path=/api/v1/comments,/api/v1/comments/**
- Path=/api/v1/pathfinder/sessions,/api/v1/pathfinder/sessions/**
```

这说明整条链路的路径语义其实是一致的：

- 浏览器页面入口走 `/paperflow/...`
- 浏览器接口入口走 `/api/...`
- 网关和业务服务内部继续统一到 `/api/v1/...`

路径层级一旦这样固定下来，后面无论联调还是部署，脑子里至少不会同时打两三套路径。

## 7. 我们最后发现，最怕的不是配置多，而是只有一层记得自己在子路径下

我们最后发现，这类问题最容易出事故的地方，不是某个单独配置项写错，而是不同层对“自己到底是不是部署在子路径下”理解不一致。

典型错误一般有四种：

- Vite `base` 配了 `/paperflow/`，但 React Router 还按 `/` 解释；
- React Router 配了 `basename`，但 Nginx 没处理刷新 fallback；
- Nginx 处理了 `/paperflow/`，但静态资源还在按 `/assets/` 取；
- 前端页面走子路径，接口也被错误地改成 `/paperflow/api/...`。

这些问题单看都不复杂，但叠在一起就特别像大学生项目里最常见的那种情况:  
每一层都觉得自己差不多对了，最后整体就是跑不顺。  
因为你会看到：

- 首页能开；
- 某些页面刷新就 404；
- 某些资源偶尔又能加载；
- 接口调用路径还不统一。

我们后来最有用的方法，不是继续乱试，而是老老实实把四层边界按顺序对一遍：

- `Vite base`
- `BrowserRouter basename`
- `Nginx location /paperflow/`
- `Nginx location /api/`

## 8. 回头看，这其实不只是前端细节，而是一次完整的部署排坑

一开始我们也把它当成前端小问题，后来才发现它其实是一次完整的全链路排坑。

因为它同时要求：

- 前端构建工具理解部署位置；
- 前端路由理解部署位置；
- Nginx 理解页面和资源的区别；
- 网关理解接口前缀边界。

只要这几层没有用同一套语义，系统就会看起来“好像差不多”，但总有一处在漏水。

PaperFlow 现在这套方案其实不算复杂，但它至少有一个很朴素的优点：  
每一层都明确知道自己面对的是 `/paperflow/` 还是 `/api/`。

## 9. 最后

如果你也是类似的大学生项目，准备把 React 前端挂到一个子路径下，真的不要只改一处配置就觉得结束了。  
至少把下面这几项一起核对掉：

- `vite.config.ts` 的 `base`
- `BrowserRouter` 的 `basename`
- Nginx 的静态资源路径处理
- Nginx 的 SPA fallback
- `/api` 是否继续保持独立入口

另外，公开写这种部署帖子时，我自己会尽量守几个底线：

- 不放真实公网 IP、域名、服务器登录方式；
- 不放密钥、令牌、邮箱账号、短信配置；
- 不放可直接扫到内网结构的完整部署细节；
- 只讲路径设计、代理结构、排坑思路这些能复用的东西。

对当前这套 PaperFlow 来说，真正让它稳定下来的也不是什么“玄学技巧”，而是这四层终于不再各说各话。  
对我们这种大学生团队来说，能把这种看起来很碎的路径问题排顺，其实已经是一次挺实在的技术复盘了。
