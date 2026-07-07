# 一个 PostgreSQL 容器里放三套库：我们这个大学生团队是怎样拆分业务库和知识库边界的

> 摘要：很多项目刚开始做部署时，数据库都会先“能用就行”，所有表塞进一个库，后面越改越痛。PaperFlow 在容器化部署时虽然只启了一个 PostgreSQL 容器，但逻辑上仍然拆成了 `userdb`、`contentdb`、`paperflowdb` 三套数据库。其中前两套服务业务主链路，后一套承接知识库、向量检索、学习计划和 Agent 运行数据。本文结合初始化 SQL 和真实 schema，整理我们为什么采用三库分离，以及这种做法对部署和运维意味着什么。
>
> 标签：PostgreSQL｜pgvector｜数据库设计｜Docker Compose｜知识库｜运维实践

很多人做大学生团队项目或者个人项目时，数据库最容易走的一条路是：

- 先起一个 PostgreSQL；
- 先建一个 database；
- 所有表先塞进去；
- 等后面复杂了再说。

这条路短期当然跑得快，但系统一旦开始分服务、分职责、分数据类型，后面的维护成本会迅速上升。

PaperFlow 在部署层没有把数据库拆成多个容器，但从一开始就尽量把逻辑边界拆开了。  
当前 PostgreSQL 容器启动后，会创建三套数据库：

```sql
create user paperflow with password 'paperflow';
create database userdb owner paperflow;
create database contentdb owner paperflow;
create database paperflowdb owner paperflow;
```

也就是说，从容器视角看，它还是一个 PostgreSQL。  
但从系统职责视角看，它已经不是“一库通吃”了。

## 1. 为什么我们宁愿多拆两套库，也不把所有表混在一起

PaperFlow 当前至少有三类明显不同的数据职责：

第一类是用户域数据。  
比如账号、刷新令牌、验证码、绑定信息，这些天然属于 `user-service`。

第二类是内容域数据。  
比如帖子、评论、收藏、足迹、通知、Pathfinder 会话，这些天然属于 `content-service`。

第三类是知识库与 Agent 数据。  
比如论文元数据、分块文本、embedding、学习计划、工作流运行记录，这些更接近知识处理和 AI 辅读侧能力。

如果把这三类数据硬塞进同一个库，短期当然省事，但后面会同时遇到几个问题：

- 迁移策略混杂；
- 责任边界不清；
- 排障时不知道该看哪个系统；
- 备份和恢复也容易一锅端。

因此我们最后采取的方案不是“每种数据单独起一个数据库容器”，而是先做一层中间收缩：

- 运行层仍然只有一个 PostgreSQL 容器；
- 逻辑层明确拆成三套数据库。

对当前阶段来说，这是成本和边界之间比较合适的平衡。

## 2. 两个业务库和一套知识库，管理方式本来就不一样

PaperFlow 的一个关键点在于：  
这三套库虽然都跑在同一个 PostgreSQL 容器里，但它们的管理方式并不完全相同。

业务库在 Compose 里是显式连的：

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

这表示两件事：

- `user-service` 只关心 `userdb`；
- `content-service` 只关心 `contentdb`。

也就是说，服务边界在部署层并没有被打散。

而知识库这边，生产环境变量又单独给出了一组连接信息：

```env
PAPERFLOW_DB_HOST=postgres
PAPERFLOW_DB_PORT=5432
PAPERFLOW_DB_NAME=paperflowdb
PAPERFLOW_DB_USER=paperflow
PAPERFLOW_DB_PASSWORD=paperflow_prod_change_me
```

这说明 `paperflowdb` 不是顺带存在的，它从一开始就被当成一套独立职责的数据底座来对待。

## 3. `paperflowdb` 不是“补充表”，而是一整套知识库 schema

很多人一看到额外数据库，第一反应是“可能就多几张表”。  
但 PaperFlow 的 `paperflowdb` 并不是补丁式存在，它本身就是一套完整 schema。

初始化脚本一上来先做的是基础设施准备：

```sql
\connect paperflowdb

create extension if not exists vector;
create extension if not exists pg_trgm;
create extension if not exists unaccent;
```

这一段其实已经把它和普通业务库区分开了。

- `vector` 表示后面要做向量检索；
- `pg_trgm` 表示要做相似文本匹配；
- `unaccent` 说明文本处理会考虑更宽松的检索语义。

也就是说，这个库天然就是在为知识处理和 AI 能力服务，而不是只做业务 CRUD。

接着它还定义了通用更新时间触发器：

```sql
create or replace function pf_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
```

这说明 schema 设计本身已经在考虑一致性的维护，而不是临时拼凑。

## 4. 知识库里真正存的是什么

从 `02-paperflowdb.sql` 的结构看，`paperflowdb` 至少可以分成四组核心数据。

### 第一组：论文与分块

代表表包括：

- `pf_paper`
- `pf_paper_chunk`
- `pf_paper_embedding`

这组表解决的是：

- 论文基础信息怎么存；
- 长文怎么切成可检索的 chunk；
- chunk 的向量怎么落库。

比如 embedding 表里直接定义了：

```sql
embedding vector(1536) not null
```

还配了向量索引：

```sql
create index if not exists idx_pf_paper_embedding_vector_cosine on pf_paper_embedding using hnsw (embedding vector_cosine_ops);
```

这说明知识库的目标不是“把论文文件保存一下”，而是明确在为语义召回做准备。

### 第二组：用户阅读行为

代表表是：

- `pf_user_activity`

里面的 `activity_type` 已经覆盖了多种行为：

```sql
'paper_uploaded',
'paper_viewed',
'paper_completed',
'paper_favorited',
'highlight_created',
'note_created',
'question_asked',
'plan_started',
'plan_completed'
```

这类数据的价值在于，它把“用户做了什么”沉淀成了可分析的结构化记录。  
后面无论做推荐、复盘还是学习计划推进，都有了数据基础。

### 第三组：学习计划

代表表包括：

- `pf_learning_plan`
- `pf_learning_plan_stage`
- `pf_learning_plan_stage_paper`

这三张表一看就知道是在服务 Pathfinder 一类能力：

- 一个目标；
- 拆成多个阶段；
- 每个阶段再挂若干论文。

这说明 AI 学习路径并不是停留在接口返回文本，而是已经被纳入数据库结构中。

### 第四组：Agent 运行记录

代表表包括：

- `pf_agent_run`
- `pf_agent_run_message`

这组表特别重要，因为它在解决一个经常被忽略的问题：

> 工作流到底有没有真正跑过，它跑到哪一步，输出了什么，中途报了什么。

如果没有这类表，很多 AI/Agent 能力最后都只能停留在“调接口看结果”，一旦线上出问题，几乎无法回放。

## 5. 三库分离之后，部署和排障都更像工程，而不是猜谜

从这次实践来看，三库分离最大的收益，不只是结构更清晰，而是后面很多事情都更容易解释和排查。

比如部署时，你至少不会混淆下面这些问题：

- 用户登录异常，先看 `userdb` 还是知识库；
- 评论和通知链路异常，先看 `contentdb` 还是 Agent 表；
- Pathfinder 计划生成问题，到底是业务服务逻辑，还是 `paperflowdb` 没初始化。

再比如做备份时，思路也更清晰：

- 业务主链路重点保护 `userdb` 和 `contentdb`；
- 知识库与 Agent 数据重点保护 `paperflowdb`；
- 恢复时可以按职责判断优先级，而不是一股脑全回滚。

这类收益平时不容易被看见，但一到排障阶段就特别明显。

## 6. 三库分离不代表复杂度失控，关键是收在一个容器里

有人可能会说：  
你都已经拆三套库了，为什么不干脆拆成三个 PostgreSQL 实例？

原因很简单：当前阶段还没必要。

PaperFlow 现在更需要的是：

- 数据职责边界清楚；
- 初始化流程稳定；
- 开发和部署成本可控。

如果一上来就把数据库实例也拆散，虽然理论上更“纯”，但会把下面这些成本一起抬高：

- Compose 编排复杂度；
- 连接配置数量；
- 备份恢复脚本数量；
- 本地联调心智负担。

因此我们更倾向于先做一层“逻辑分离、运行集中”：

- 逻辑上三库分工清楚；
- 运行上仍然由一个 PostgreSQL 容器承载。

这对当前阶段的系统是更合适的工程节奏。

## 7. 在我们这个项目里，这不是数据库技巧，而是部署边界管理

回头看，PaperFlow 这里做三库分离，核心目的并不是为了展示数据库设计技巧，而是为了守住部署和运维边界：

- 用户域别和内容域混着迁移；
- 业务主库别和知识库混着理解；
- 向量检索、学习计划、Agent 运行数据要有自己稳定的落点。

一旦这层边界明确，前面的模块设计和后面的部署落地才能真正接上。

否则你前面在代码里拆得再漂亮，到了数据库层还是一锅粥，系统最后还是会乱。

## 8. 最后

如果是类似的大学生团队项目，并且已经开始出现“业务数据 + AI/知识库数据”混合形态，建议尽早把数据库职责边界想清楚。

不一定非得一开始就上复杂架构，但至少要回答下面几个问题：

- 哪些表属于业务主链路；
- 哪些表属于知识库或 AI 辅助能力；
- 它们是不是应该继续混在一个库里；
- 初始化和备份时，能不能按职责拆开理解。

对我们这个 PaperFlow 学生项目来说，一个 PostgreSQL 容器、三套数据库、两种不同的数据管理侧重点，已经足够把系统从“能跑”推进到“可维护”。

这一步看起来不炫，但它真的很值。
