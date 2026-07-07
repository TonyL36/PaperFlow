# 用户服务模块功能拆解文档索引

## 1. 模块定位

用户服务负责账号体系和登录态相关能力，是整个系统“谁在使用 PaperFlow”的核心来源。它主要覆盖：
- 注册、登录、密码校验
- Access Token 与 Refresh Token
- 个人资料与头像
- QQ、微信、手机号等绑定流程
- 管理员视角的用户管理

它通常应该排在网关之后阅读，因为网关负责“识别身份”，用户服务负责“生成和管理身份”。

---

## 2. 子文档清单

| 编号 | 文档 | 核心内容 |
|------|------|----------|
| 01 | [注册与登录](./01-auth-register-login.md) | 注册、登录、Token 生成与验证机制 |
| 02 | [刷新 Token 与注销](./02-refresh-logout.md) | Token 刷新机制与安全注销流程 |
| 03 | [个人资料管理](./03-profile.md) | 用户资料的获取、更新与存储结构 |
| 04 | [OAuth 绑定与回调](./04-oauth-bindings.md) | QQ/微信/手机等第三方绑定的实现 |
| 05 | [后台用户管理](./05-admin-user.md) | 管理员查看与管理用户的功能 |

---

## 3. 阅读顺序建议

推荐按下面顺序阅读：

1. 先看 [01-auth-register-login.md](./01-auth-register-login.md)
   - 先理解 Token 是怎么签发出来的，后面刷新和鉴权才有上下文

2. 再看 [02-refresh-logout.md](./02-refresh-logout.md)
   - 这一篇补全登录态生命周期

3. 接着看 [03-profile.md](./03-profile.md)
   - 说明用户实体除了账号之外还承载了哪些资料字段

4. 再看 [04-oauth-bindings.md](./04-oauth-bindings.md)
   - 这篇适合在基础登录态读完以后再看，否则第三方绑定会显得比较跳

5. 最后看 [05-admin-user.md](./05-admin-user.md)
   - 放在最后读，更容易理解为什么后台用户管理要复用前面的用户主数据

---

## 4. 交叉引用

### 前置阅读
- [网关索引](../gateway/00-index.md)
  - 推荐先读 [JWT 鉴权与身份透传](../gateway/02-jwt-auth.md)

### 强关联模块
- [前端索引](../frontend/00-index.md)
  - 推荐连着看 [注册与登录](./01-auth-register-login.md) 和 [SPA 整体架构](../frontend/01-spa-architecture.md)
- [内容服务索引](../content-service/00-index.md)
  - 收藏、足迹、评论审核等能力都依赖用户身份，推荐和内容服务一起看
- [部署索引](../deploy/00-index.md)
  - 如果你关心邮件配置、环境变量和生产发布，可以继续看部署模块

### 下一步推荐
- 想顺着“登录后能做什么”继续读：去看 [内容服务索引](../content-service/00-index.md)
- 想顺着“前端登录态如何消费 Token”继续读：去看 [前端索引](../frontend/00-index.md)
