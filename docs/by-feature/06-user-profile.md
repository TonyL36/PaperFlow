# 06 用户服务：个人资料与头像上传（/users/me）

## 功能目标

- 已登录用户可读取完整个人资料
- 已登录用户可更新昵称、头像 URL、简介
- 支持本地图片上传头像并通过公共地址访问

## 接口总览

- `GET /api/v1/users/me`
- `PATCH /api/v1/users/me`
- `POST /api/v1/users/me/avatar`（multipart `file`）
- `GET /api/v1/public/users/avatars/{userId}`（公开读取头像文件）

## 返回字段（当前）

`/users/me` 当前返回：

- `id / email / displayName / roles`
- `status`
- `avatarUrl / bio / phone`
- `emailVerified / phoneVerified / qqBound`

说明：

- 用户身份仍由网关注入 `X-User-Id`
- `PATCH /users/me` 目前允许更新 `displayName/avatarUrl/bio`
- 头像上传接口会校验大小与类型（png/jpg/webp），落盘到 `.dev/uploads/avatars`

## 前后端交互要点

- 前端 Profile 页面支持本地文件上传头像，不再依赖“手填 URL”为主
- 上传成功后会刷新 `me`，确保顶部头像与个人页状态一致
- 头像公开访问通过 `GET /api/v1/public/users/avatars/{userId}`

## 常见坑

- 若头像地址 404，先确认网关路由放行 `/api/v1/public/users/**`
- 若上传失败，优先检查文件大小和格式是否命中限制
- 若页面头像不刷新，确认前端是否调用了 `refreshMe/reload`
