# 网关模块功能拆解文档索引

## 1. 模块定位

网关是 PaperFlow 各后端服务的统一入口，负责把前端请求先接住，再完成以下几件事：
- 生成并透传请求链路 ID
- 校验 JWT 并向下游传递用户身份
- 对匿名与登录用户实施分层限流
- 统一异常输出格式
- 把 `/api/v1/**` 请求转发到用户服务和内容服务

如果你想先理解“整个系统请求是怎么进来的”，这个模块应该最先读。

---

## 2. 子文档清单

| 编号 | 文档 | 核心内容 |
|------|------|----------|
| 01 | [RequestId 链路追踪](./01-request-id.md) | RequestId 的生成、透传、回传与全链路串联 |
| 02 | [JWT 鉴权与身份透传](./02-jwt-auth.md) | JWT 验证、用户身份识别与下游透传机制 |
| 03 | [分层限流](./03-rate-limit.md) | 基于身份与接口类型的限流策略实现 |
| 04 | [统一错误格式](./04-error-envelope.md) | 错误信封的统一封装与处理 |
| 05 | [路由配置与重写](./05-routing-rewrite.md) | 网关路由规则与路径重写策略 |

---

## 3. 阅读顺序建议

推荐按下面顺序阅读：

1. 先看 [01-request-id.md](./01-request-id.md)
   - 先搞清楚链路追踪，后面读鉴权和异常时更容易理解整个过滤器链

2. 再看 [02-jwt-auth.md](./02-jwt-auth.md)
   - 这是用户身份进入后端体系的入口，和用户服务、内容服务都直接相关

3. 再看 [03-rate-limit.md](./03-rate-limit.md)
   - 此时你已经知道“是谁在请求”，再看限流策略最自然

4. 接着看 [04-error-envelope.md](./04-error-envelope.md)
   - 这篇负责解释为什么前端拿到的错误格式是统一的

5. 最后看 [05-routing-rewrite.md](./05-routing-rewrite.md)
   - 放在最后读，更容易把整个网关配置串起来

---

## 4. 交叉引用

### 前置阅读
- [模块总索引](../00-index.md)

### 强关联模块
- [用户服务索引](../user-service/00-index.md)
  - 推荐连着看 [JWT 鉴权与身份透传](./02-jwt-auth.md) 和 [注册与登录](../user-service/01-auth-register-login.md)
- [内容服务索引](../content-service/00-index.md)
  - 推荐连着看 [JWT 鉴权与身份透传](./02-jwt-auth.md) 和 [帖子 API](../content-service/02-posts-api.md)
- [前端索引](../frontend/00-index.md)
  - 推荐连着看 [统一错误格式](./04-error-envelope.md) 和 [SPA 整体架构](../frontend/01-spa-architecture.md)
- [部署索引](../deploy/00-index.md)
  - 如果你想知道这些上游地址和端口最终怎么落到 Compose 与 Nginx，可以继续看部署模块

### 下一步推荐
- 想继续顺着“登录态”读：去看 [用户服务索引](../user-service/00-index.md)
- 想继续顺着“帖子请求链路”读：去看 [内容服务索引](../content-service/00-index.md)
