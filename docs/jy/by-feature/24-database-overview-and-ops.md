# 24 数据库总览与更新操作（H2 / PostgreSQL，userdb / contentdb）

## 24.1 背景与目标

- 统一说明项目当前数据库拓扑：本地默认 H2，部署默认 PostgreSQL。
- 汇总 `userdb` / `contentdb` 的职责边界与核心表，减少跨文档查找成本。
- 给出 Flyway 变更、备份、发布的标准操作顺序，降低误操作导致的数据风险。

## 24.2 数据库拓扑总览

### 本地开发（默认）

- `user-service` 默认连接：`jdbc:h2:file:./.dev/h2/userdb;MODE=PostgreSQL;AUTO_SERVER=TRUE`
- `content-service` 默认连接：`jdbc:h2:file:./.dev/h2/contentdb;MODE=PostgreSQL;AUTO_SERVER=TRUE`
- 目标：开发机重启后数据仍可保留，避免账号和联调数据丢失。

配置来源：
- [application.yml (user-service)](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/src/main/resources/application.yml#L9-L12)
- [application.yml (content-service)](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/resources/application.yml#L11-L14)
- [30-databases.sample.bat](file:///f:/Gitee/PaperFlow/PaperFlow/scripts/env/30-databases.sample.bat#L1-L8)

### Docker 部署（dev/test/prod）

- 两个服务都切到 PostgreSQL：
  - `USER_DB_URL=jdbc:postgresql://postgres:5432/userdb`
  - `CONTENT_DB_URL=jdbc:postgresql://postgres:5432/contentdb`
- PostgreSQL 初始化脚本会创建：
  - 用户：`paperflow`
  - 数据库：`userdb`、`contentdb`

配置来源：
- [compose.dev.yml](file:///f:/Gitee/PaperFlow/PaperFlow/docker/compose.dev.yml#L17-L33)
- [compose.test.yml](file:///f:/Gitee/PaperFlow/PaperFlow/docker/compose.test.yml#L17-L33)
- [compose.prod.yml](file:///f:/Gitee/PaperFlow/PaperFlow/docker/compose.prod.yml#L17-L34)
- [01-init.sql](file:///f:/Gitee/PaperFlow/PaperFlow/docker/postgres/init/01-init.sql#L1-L3)

## 24.3 分库与核心表

### 用户域（userdb，user-service）

核心表与用途：
- `pf_user`：用户主数据（账号、角色、状态、资料、第三方绑定）
- `pf_refresh_token`：刷新令牌哈希与吊销状态
- `pf_user_verification`：登录态下的绑定验证码记录
- `pf_verification`：注册/找回密码等公共验证码记录

迁移来源：
- [V1__init.sql](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/src/main/resources/db/migration/V1__init.sql#L1-L19)
- [V2__user_status.sql](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/src/main/resources/db/migration/V2__user_status.sql#L1)
- [V3__user_profile_and_bindings.sql](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/src/main/resources/db/migration/V3__user_profile_and_bindings.sql#L1-L26)
- [V4__auth_public_verification.sql](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/src/main/resources/db/migration/V4__auth_public_verification.sql#L1-L12)
- [V5__user_wechat_binding.sql](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/src/main/resources/db/migration/V5__user_wechat_binding.sql#L1-L5)

### 内容域（contentdb，content-service）

核心表与用途：
- `pf_post`：帖子主表（含 `author_user_id`）
- `pf_comment`：评论与审核状态
- `pf_post_favorite`：收藏关系（复合主键）
- `pf_post_footprint`：阅读足迹（复合主键）
- `pf_pathfinder_session`：AI Pathfinder 会话与阶段状态

迁移来源：
- [V1__init.sql](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/resources/db/migration/V1__init.sql#L1-L17)
- [V2__post_footprints_and_favorites.sql](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/resources/db/migration/V2__post_footprints_and_favorites.sql#L1-L21)
- [V3__post_author_user_id.sql](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/resources/db/migration/V3__post_author_user_id.sql#L1-L2)
- [V4__pathfinder_sessions.sql](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/resources/db/migration/V4__pathfinder_sessions.sql#L1-L18)
- [V5__pathfinder_session_model_name.sql](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/resources/db/migration/V5__pathfinder_session_model_name.sql#L1-L2)

## 24.4 Flyway 更新操作（标准流程）

当前配置：
- 两个服务都开启 `spring.flyway.enabled=true`，应用启动时自动执行迁移。
- `spring.jpa.hibernate.ddl-auto=validate`，由 Flyway 管结构，JPA 只做结构校验。

配置来源：
- [application.yml (user-service)](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/src/main/resources/application.yml#L30-L39)
- [application.yml (content-service)](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/resources/application.yml#L15-L20)

新增迁移建议步骤：
1. 在对应服务 `db/migration` 下新增 `V{N}__*.sql`，只做一类可审阅变更。
2. 先备份本地数据库（见 24.5），再启动服务触发 Flyway。
3. 检查启动日志中 Flyway 成功记录；若失败，先修复新版本迁移，不改历史文件。
4. 提交代码时同时提交迁移 SQL 与对应实体/仓储代码，避免版本漂移。

## 24.5 备份操作

### 本地 H2 备份（推荐）

仓库已提供一键备份脚本：
- [backup-local-db.bat](file:///f:/Gitee/PaperFlow/PaperFlow/scripts/backup-local-db.bat#L1-L16)

执行命令（Windows）：

```powershell
.\scripts\backup-local-db.bat
```

说明：
- 源目录：`.\.dev\h2`
- 目标目录：`.\.dev\backup\h2-时间戳`
- 建议在每次执行新 Flyway 迁移前先跑一次。

### Docker PostgreSQL 备份（发布前建议）

项目当前未内置 `pg_dump` 脚本，建议在运维流程中补充：

```bash
docker exec -t <postgres-container> pg_dump -U paperflow userdb > userdb.sql
docker exec -t <postgres-container> pg_dump -U paperflow contentdb > contentdb.sql
```

## 24.6 发布操作（数据库相关）

使用统一部署脚本：
- [deploy.ps1](file:///f:/Gitee/PaperFlow/PaperFlow/scripts/deploy.ps1#L1-L19)
- [deploy.sh](file:///f:/Gitee/PaperFlow/PaperFlow/scripts/deploy.sh#L1-L18)

Windows：

```powershell
.\scripts\deploy.ps1 -Env dev
.\scripts\deploy.ps1 -Env test
.\scripts\deploy.ps1 -Env prod
```

Linux/macOS：

```bash
./scripts/deploy.sh dev
./scripts/deploy.sh test
./scripts/deploy.sh prod
```

发布顺序建议：
1. 先备份（H2 或 PostgreSQL）。
2. 执行目标环境部署脚本。
3. 观察服务启动日志，确认 Flyway 迁移完成且健康检查通过。
4. 再进行接口冒烟验证（注册/登录、帖子列表、评论、收藏等核心路径）。

## 24.7 操作红线

- 不修改、重写已上线的历史 Flyway 迁移文件。
- 不在未备份时直接执行破坏性 SQL（删列、改类型、批量清洗）。
- 不让 `user-service` 与 `content-service` 共享同一个业务库，保持分库边界。
- 迁移失败优先“前滚修复”（新增版本修正），避免手改线上元数据。
