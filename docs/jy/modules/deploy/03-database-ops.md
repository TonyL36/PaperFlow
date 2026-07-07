# Deploy 模块详解：数据库初始化与运维操作

## 1. 背景与目标

### 与前序模块的关系
数据库层是前面所有模块真正落地的数据基础：
- 用户服务依赖 `userdb`
- 内容服务依赖 `contentdb`
- Python Agent 和知识库能力依赖 `paperflowdb`

所以这一篇虽然放在 `deploy` 模块下，本质上是在解释“这些模块的数据底座怎么初始化、怎么补齐、怎么备份、怎么避免误操作”。

### 为什么必须把数据库操作单独拿出来
项目当前不是一个单数据库系统，而是至少有三类数据存储职责：

1. 账号、令牌、绑定等用户域数据
2. 帖子、评论、收藏、Pathfinder 会话等内容域数据
3. 论文、chunk、embedding、学习计划、Agent 运行记录等知识库数据

如果不把这三层分清楚，就会很容易在部署和排障时混淆：
- 以为 PostgreSQL 初始化完成，就等于知识库 schema 也已经可用了
- 以为业务库和知识库是同一套迁移机制
- 以为备份任意一个目录就能覆盖全部数据

---

## 2. 数据库拓扑总览

## 2.1 PostgreSQL 初始化时会先创建三套数据库

`docker/postgres/init/01-init.sql` 内容很短，但它决定了整个容器化部署的数据库基础：

```sql
create user paperflow with password 'paperflow';
create database userdb owner paperflow;
create database contentdb owner paperflow;
create database paperflowdb owner paperflow;
```

这四行已经把 PaperFlow 的数据库边界定死了：
- 统一数据库用户：`paperflow`
- 统一数据库容器：`postgres`
- 但逻辑上仍然保持三库分离

这个设计和前面的模块拆分是一致的。项目没有把所有表硬塞进一个库里，而是按职责拆开：
- `userdb` 服务于用户服务
- `contentdb` 服务于内容服务
- `paperflowdb` 服务于知识库与 Agent 侧数据

## 2.2 Compose 环境里的业务库连接方式是显式声明的

以 `docker/compose.dev.yml` 为例：

```yaml
user-service:
  environment:
    USER_DB_URL: jdbc:postgresql://postgres:5432/userdb
    USER_DB_USER: paperflow
    USER_DB_PASS: ${POSTGRES_PASSWORD}

content-service:
  environment:
    CONTENT_DB_URL: jdbc:postgresql://postgres:5432/contentdb
    CONTENT_DB_USER: paperflow
    CONTENT_DB_PASS: ${POSTGRES_PASSWORD}
```

这说明在容器模式下，两个业务服务各自连自己的库，不共享一个业务 schema。

同时，`docker/env/dev.env` 还额外提供了知识库连接信息：

```env
PAPERFLOW_DB_HOST=postgres
PAPERFLOW_DB_PORT=5432
PAPERFLOW_DB_NAME=paperflowdb
PAPERFLOW_DB_USER=paperflow
PAPERFLOW_DB_PASSWORD=paperflow
```

所以从部署视角看，PaperFlow 实际上维护的是：
- 两个 Flyway 驱动的业务数据库
- 一个额外的知识库数据库

---

## 3. 知识库 schema 的初始化逻辑

## 3.1 `paperflowdb` 不是靠 Spring Boot 自动迁移，而是靠初始化 SQL

知识库 schema 的入口是 `docker/postgres/init/02-paperflowdb.sql`，以及辅助脚本 `scripts/init-paperflow-db.ps1`。

PowerShell 脚本内容非常直白：

```powershell
Write-Host "Applying PaperFlow knowledge database schema using $ComposeFile ..."
docker compose -f $ComposeFile exec -T postgres psql -U postgres -d postgres -f /docker-entrypoint-initdb.d/02-paperflowdb.sql
Write-Host "PaperFlow knowledge database schema applied."
```

这里要注意一个关键点：
- `userdb` 和 `contentdb` 的表结构更多依赖各自服务启动时的 Flyway
- `paperflowdb` 的知识库 schema 则由这份初始化 SQL 直接落地

也就是说，这三套数据库虽然都在同一个 PostgreSQL 容器里，但结构管理方式并不完全相同。

## 3.2 `02-paperflowdb.sql` 先创建扩展和通用触发器

文件开头先做了三件基础设施工作：

```sql
\connect paperflowdb

create extension if not exists vector;
create extension if not exists pg_trgm;
create extension if not exists unaccent;
```

这三项分别对应：
- `vector`
  - 支持 embedding 向量检索
- `pg_trgm`
  - 支持相似文本匹配
- `unaccent`
  - 方便做更宽松的文本处理

随后又定义了统一的更新时间触发器函数：

```sql
create or replace function pf_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
```

这让后续多张表都可以共用同一套 `updated_at` 自动维护机制，而不需要在应用层手工回填。

## 3.3 核心表分成四组

从 `02-paperflowdb.sql` 的内容来看，知识库侧至少可以分成四组表。

### 第一组：论文与 chunk

代表表：
- `pf_paper`
- `pf_paper_chunk`
- `pf_paper_embedding`

这组表负责解决的问题是：
- 一篇论文的基础元数据怎么存
- 论文如何切分成可检索片段
- 每个片段的向量如何存储和召回

比如 `pf_paper_embedding` 里明确用了：

```sql
embedding vector(1536) not null
```

以及 HNSW 索引：

```sql
create index if not exists idx_pf_paper_embedding_vector_cosine on pf_paper_embedding using hnsw (embedding vector_cosine_ops);
```

这说明知识库不是只把论文“存起来”，而是明显在为向量检索做准备。

### 第二组：用户阅读行为

代表表：
- `pf_user_activity`

它记录的不只是浏览，还包括：
- `paper_uploaded`
- `paper_viewed`
- `question_asked`
- `plan_started`
- `plan_completed`

这和前面前端 Pathfinder、阅读体验、Python Agent 的能力是能接上的，因为系统后续完全可以基于这些行为做推荐、计划推进或个性化反馈。

### 第三组：学习计划

代表表：
- `pf_learning_plan`
- `pf_learning_plan_stage`
- `pf_learning_plan_stage_paper`

这部分结构和 Pathfinder 的产品形态是一致的：
- 一个计划
- 多个阶段
- 每个阶段挂若干论文

也就是说，部署层已经为前面讲过的 AI 学习路径能力预留好了数据库承载。

### 第四组：Agent 运行状态

代表表：
- `pf_agent_run`
- `pf_agent_run_message`

这组表解决的是“工作流是否真的跑过、跑到哪一步、输出了什么、报了什么消息”。

它和 Python Agent 文档里的 `FiveAgentWorkflow`、检查点持久化逻辑，是同一条链路上的部署侧落点。

---

## 4. 业务库与知识库的职责分工

## 4.1 `userdb` 和 `contentdb` 仍然是业务主库

部署时不要把知识库错当成业务主库。当前系统的主业务写入仍然发生在：

- `userdb`
  - 用户、刷新令牌、验证码、绑定等
- `contentdb`
  - 帖子、评论、收藏、足迹、通知、Pathfinder 会话等

这部分结构由各自服务的迁移脚本维护，和 `paperflowdb` 的初始化 SQL 不是同一层机制。

## 4.2 `paperflowdb` 更像 AI 能力和知识检索的底座

从字段设计就能看出来，它偏向：
- 论文元数据
- chunk 化文本
- embedding
- 学习计划
- Agent 运行记录

所以在运维上要特别避免一种错误认知：
- 不是所有数据库问题都该去 `paperflowdb` 查
- 也不是所有业务能力都已经迁移到了知识库侧

---

## 5. 运维入口与标准操作

## 5.1 初始化知识库 schema 的入口

当前仓库已经给出固定入口：

```powershell
.\scripts\init-paperflow-db.ps1
```

它默认使用：

```powershell
[string]$ComposeFile = "docker/compose.dev.yml"
```

这意味着它首先服务于本地或开发态容器环境。如果你切到其他 compose 文件，也可以通过参数覆盖。

## 5.2 本地备份入口

仓库中已经提供了一个本地数据库备份脚本：

```bat
set SRC=%ROOT%\.dev\h2
set DST=%ROOT%\.dev\backup\h2-%TS%
xcopy "%SRC%\*" "%DST%\" /E /I /Y >nul
```

它的入口是：

```powershell
.\scripts\backup-local-db.bat
```

从脚本内容能看出来，这个备份针对的是：
- 本地 `.dev\h2` 目录

也就是说，它更适用于“本地非容器数据库场景”的兜底，而不是 Docker PostgreSQL 的通用备份方案。

## 5.3 Docker PostgreSQL 的运维重点

虽然项目里没有直接内置 `pg_dump` 脚本，但从当前结构可以推断出比较稳妥的做法：

1. 先确认 `postgres` 容器和三个数据库都在
2. 再按库分开备份，而不是一把梭导整个实例
3. 对知识库 schema 变更尤其要谨慎，因为它包含：
   - 向量索引
   - 多张关联表
   - Agent 历史记录

---

## 6. 边界与约束

## 6.1 `paperflowdb` 的 schema 初始化不是完全幂等的运维替代品

虽然 `02-paperflowdb.sql` 大量使用了 `if not exists`，但它本质上更像：
- 初始化脚本
- 环境补齐脚本

而不是成熟的数据库版本演进系统。所以一旦后续知识库 schema 变化越来越多，继续只靠一份初始化 SQL 管理，会越来越吃力。

## 6.2 业务库和知识库不能混着排障

例如：
- 登录失败，优先查 `userdb`
- 帖子或评论异常，优先查 `contentdb`
- Pathfinder 推荐、论文检索或 Agent 运行记录问题，再看 `paperflowdb`

如果一上来就只盯着某一个库，很容易把问题查偏。

## 6.3 备份策略目前还不完全统一

当前仓库已经有：
- H2 本地目录备份脚本
- PostgreSQL 初始化 SQL
- 知识库 schema 补齐脚本

但还没有把“容器 PostgreSQL 备份、恢复、校验”完全做成标准化脚本。这一点在真实运维中需要特别注意。

---

## 7. 常见问题与踩坑经验

### 7.1 PostgreSQL 容器起了，但知识库表不存在

这通常不是 `postgres` 容器没起来，而是：
- `01-init.sql` 只创建了数据库
- `02-paperflowdb.sql` 没有被执行或没有成功执行

换句话说，“库存在”和“表结构可用”是两件事。

### 7.2 只看业务服务启动成功，就误以为数据库全部正常

`user-service` 和 `content-service` 只要各自的 Flyway 跑通，就可能表现为“服务正常”。但这不等于：
- `paperflowdb` 也已经初始化好
- 向量扩展和知识库表也都已经就绪

如果后续接入 Python Agent、知识检索、学习计划，就会在这里踩坑。

### 7.3 误把本地 H2 备份脚本当成 PostgreSQL 备份

`backup-local-db.bat` 明确备份的是：

```bat
set SRC=%ROOT%\.dev\h2
```

所以它不能替代 Docker PostgreSQL 的备份。这个边界一定要分清。

---

## 8. 可演进方向

### 8.1 为 `paperflowdb` 引入正式迁移机制
随着知识库能力变复杂，后续更稳的方向是给 `paperflowdb` 也建立版本化迁移，而不是长期依赖一份越来越大的初始化 SQL。

### 8.2 为 PostgreSQL 增加标准备份脚本
后续可以把：
- 备份
- 恢复
- 备份后校验

都做成固定脚本，减少人工操作差异。

### 8.3 把数据库验收纳入部署后 smoke 流程
不仅检查服务 health，也检查：
- 关键表是否存在
- 扩展是否启用
- 关键查询是否能跑通

这样能更早发现“服务启动了，但数据库没准备好”的问题。

---

## 9. 小结

PaperFlow 的数据库部署层不是“一库打天下”，而是清晰地分成了三部分：

- `userdb`
  - 承载用户域
- `contentdb`
  - 承载内容域
- `paperflowdb`
  - 承载知识库与 Agent 运行域

理解这三者的边界，是后续做发布、排障、扩展 AI 能力时最重要的前提之一。否则你看到的就只是一堆 SQL 和脚本，无法真正明白它们为什么要这样组织。

---

## 9. 页内导航

- 所属模块：[Deploy 模块索引](./00-index.md)
- 上一篇：[Deploy 模块详解：云端 ECS 发布与运行约束](./02-cloud-ecs.md)
- 下一篇：当前已是本模块最后一篇，建议回看 [模块索引](./00-index.md) 或继续阅读 [总览导航文档](../01-navigation-guide.md)
- 关联阅读：
  - [网关模块索引](../gateway/00-index.md)
  - [前端模块索引](../frontend/00-index.md)
  - [Python Agent 模块索引](../python-agent/00-index.md)
