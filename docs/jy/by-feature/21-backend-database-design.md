# 21 后端数据库设计说明（User / Content）

## 21.1 设计目标

- 支持账号体系、会话体系、内容互动体系的长期可维护演进
- 保证“可追踪、可回滚、可迁移”：统一通过 Flyway 版本化变更
- 在本地开发环境默认持久化，避免重启后账号丢失导致联调混乱

## 21.2 当前数据域划分

### 用户域（user-service）

- `pf_user`
  - 用户主表：邮箱、密码哈希、昵称、角色、状态、头像、简介、绑定信息
- `pf_refresh_token`
  - 刷新令牌表：按 `token_hash` 唯一存储，可批量吊销
- `pf_user_verification`
  - 已登录用户绑定验证（邮箱/手机）验证码记录
- `pf_verification`
  - 公共验证码记录（注册邮箱验证码、找回密码验证码）

### 内容域（content-service）

- `pf_post`
  - 帖子主表（新增 `author_user_id`，用于对齐 Agent 侧用户 ID）
- `pf_comment`
  - 评论表（含审核状态）
- `pf_post_favorite`
  - 收藏关系表（`user_id + post_id` 复合主键）
- `pf_post_footprint`
  - 足迹关系表（`user_id + post_id` 复合主键）

## 21.3 关键设计决策

- 用户与内容分库分服务，避免单库耦合
- 刷新令牌只存哈希，不存明文，降低泄露风险
- 验证码只存哈希，避免验证码明文落库
- 收藏/足迹使用复合主键，天然防重复写
- 审核状态放在评论表内，便于管理端过滤与状态流转

## 21.4 迁移策略（Flyway）

用户服务迁移：
- `V1__init.sql`：创建用户与 refresh token 基础表
- `V2__user_status.sql`：增加用户状态字段
- `V3__user_profile_and_bindings.sql`：增加头像/简介/手机/QQ 绑定与用户验证表
- `V4__auth_public_verification.sql`：新增公共验证码表
- `V5__user_wechat_binding.sql`：增加微信绑定字段

内容服务迁移：
- `V1__init.sql`：帖子/评论主链路
- `V2__post_footprints_and_favorites.sql`：收藏与足迹

原则：
- 仅追加迁移，不修改历史迁移文件
- 每个迁移文件只做一类可审阅的结构变更

## 21.5 本地持久化策略

为解决“注册账号重启后无法登录”的问题，默认数据库已调整为文件型 H2：

- user-service 默认：`jdbc:h2:file:./.dev/h2/userdb;MODE=PostgreSQL;AUTO_SERVER=TRUE`
- content-service 默认：`jdbc:h2:file:./.dev/h2/contentdb;MODE=PostgreSQL;AUTO_SERVER=TRUE`

可通过环境变量覆盖：
- `USER_DB_URL / USER_DB_USER / USER_DB_PASS`
- `CONTENT_DB_URL / CONTENT_DB_USER / CONTENT_DB_PASS`

示例脚本参考：
- `scripts/env/30-databases.sample.bat`
- `scripts/env/local.env.bat`（本机私有配置）

## 21.6 数据一致性与约束建议

- 唯一约束：邮箱、手机号、第三方 openId 必须保持唯一
- 业务约束：禁用账号不允许登录与 refresh
- 生命周期：验证码必须有过期时间与消费时间
- 审计能力：后续建议新增管理员操作审计表

## 21.7 Agent 对齐策略（用户 ID / 文章 ID）

- 文章 ID 统一：`/internal/agent/posts` 的 `postId` 会直接写入 `pf_post.id`，实现 Agent 与本地共用文章 ID
- 用户 ID 对齐：`/internal/agent/posts` 新增 `userId`，落库到 `pf_post.author_user_id`，用于后续关联行为数据
- 幂等保证：相同 `postId` 重复推送不会重复建帖

## 21.8 数据迁移与防丢策略

- 原则：迁移只做追加，不做破坏性重建
- 迁移前先备份本地数据库目录（`.dev/h2`）
- 使用脚本：`scripts/backup-local-db.bat`
- 备份后再执行升级启动，若异常可回退到备份目录恢复

## 21.9 后续优化建议

- 引入 PostgreSQL 专用索引优化高频查询
- 为 `pf_verification` 增加定时清理任务（按过期时间清理）
- 为评论审核与用户管理操作引入审计日志表
- 为热点列表与互动数据引入缓存层，降低数据库压力
