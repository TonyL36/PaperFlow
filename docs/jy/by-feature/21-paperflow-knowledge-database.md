# 21 PaperFlow 知识库数据库（PostgreSQL + pgvector）

本文定义 PaperFlow 知识库与五 Agent 工作流使用的数据库结构。该数据库独立于现有 `userdb` 和 `contentdb`，用于承载论文元数据、分块、向量、用户行为、知识星云坐标、学习路径与 Agent 运行记录。

## 1. 目标

- 使用 PostgreSQL 统一承载结构化元数据。
- 使用 `pgvector` 承载论文 chunk 的向量检索能力。
- 满足项目说明书中的核心表要求：
  - `papers`
  - `paper_embeddings`
  - `user_activities`
  - `visualization_coords`
- 同时补充学习路径和 Agent 运行审计相关表，避免后续再次拆库。

## 2. 数据库划分

当前容器初始化后会创建三个数据库：

- `userdb`
- `contentdb`
- `paperflowdb`

其中：

- `userdb` 继续服务用户系统。
- `contentdb` 继续服务帖子/评论系统。
- `paperflowdb` 专门服务 PaperFlow 智能科研知识库。

初始化位置：

- [01-init.sql](/F:/PaperFlow/docker/postgres/init/01-init.sql)
- [02-paperflowdb.sql](/F:/PaperFlow/docker/postgres/init/02-paperflowdb.sql)

## 3. 关键扩展

`paperflowdb` 启用以下扩展：

- `vector`
- `pg_trgm`
- `unaccent`

用途：

- `vector`：chunk 向量存储与相似度检索
- `pg_trgm`：标题模糊匹配与去重
- `unaccent`：文本索引预处理

## 4. 核心表定义

### 4.1 `pf_paper`

用途：

- 存储论文主记录与策展状态。

关键字段：

- `id`
- `external_source / external_id`
- `title / normalized_title`
- `abstract`
- `authors`
- `year`
- `source`
- `lifecycle_status`
- `ingest_status`
- `file_path / normalized_filename`
- `summary / teaser`
- `tags`
- `curator_score / relevance_score / novelty_score / quality_score`
- `duplicate_of`

说明：

- `source` 用于区分 `roaming / uploaded / planned / discovered / arxiv / local-corpus`
- `duplicate_of` 支持重复论文指向主记录
- `normalized_title` + trigram index 用于标题近似查重

### 4.2 `pf_paper_chunk`

用途：

- 存储论文分块，作为检索和问答的最小语义单元。

关键字段：

- `paper_id`
- `chunk_no`
- `chunk_kind`
- `section_title`
- `page_from / page_to`
- `token_count`
- `content`
- `content_tsv`

说明：

- `content_tsv` 为生成列，用于关键词检索和混合检索。
- `chunk_kind` 支持 `title / abstract / paragraph / formula / caption / table / quote / appendix`。

### 4.3 `pf_paper_embedding`

用途：

- 存储论文 chunk 的向量。

关键字段：

- `paper_id`
- `chunk_id`
- `embedding_provider`
- `embedding_model`
- `embedding_dim`
- `embedding`

说明：

- 当前 schema 固定为 `vector(1536)`，用于满足项目说明书中向量维度要求，并兼容常见可配维度 embedding 输出。
- 已建立 HNSW 余弦索引，适合后续 RAG 检索。

### 4.4 `pf_user_activity`

用途：

- 存储阅读、收藏、提问、计划执行等行为数据。

典型事件：

- `paper_uploaded`
- `paper_viewed`
- `paper_completed`
- `paper_favorited`
- `highlight_created`
- `question_asked`
- `plan_started`
- `plan_completed`
- `recommendation_accepted`

### 4.5 `pf_visualization_coord`

用途：

- 存储知识星云二维或三维坐标。

关键字段：

- `paper_id`
- `embedding_provider / embedding_model`
- `reduction_algorithm`
- `cluster_id / cluster_label`
- `x / y / z`

## 5. 辅助表定义

### 5.1 学习路径

- `pf_learning_plan`
- `pf_learning_plan_stage`
- `pf_learning_plan_stage_paper`

用途：

- 让 Pathfinder 的输出可以持久化，并与论文库关联。

### 5.2 Agent 运行审计

- `pf_agent_run`
- `pf_agent_run_message`

用途：

- 持久化 LangGraph / Agent 工作流的运行状态、消息与结果，便于调试和演示。

## 6. 索引策略

已建立的关键索引包括：

- `pf_paper.normalized_title` 的 trigram GIN 索引
- `pf_paper.tags` 的 JSONB GIN 索引
- `pf_paper_chunk.content_tsv` 的全文检索索引
- `pf_paper_embedding.embedding` 的 HNSW 余弦索引
- 用户行为和计划表的组合索引

## 7. 本地初始化方式

### 7.1 首次启动容器

如果 PostgreSQL 数据卷是新的，直接执行：

```powershell
docker compose -f docker/compose.dev.yml up -d
```

容器会自动执行：

- [01-init.sql](/F:/PaperFlow/docker/postgres/init/01-init.sql)
- [02-paperflowdb.sql](/F:/PaperFlow/docker/postgres/init/02-paperflowdb.sql)

### 7.2 对已有数据卷补应用 schema

如果你已经启动过容器，初始化脚本不会自动重跑。此时可执行：

```powershell
.\scripts\init-paperflow-db.ps1
```

或：

```bash
./scripts/init-paperflow-db.sh
```

## 8. 与项目说明书的对应关系

该数据库方案已经覆盖项目说明书中的以下要求：

- 论文元数据统一存储
- 向量知识库存储
- 用户行为采集
- 知识星云坐标存储
- 学习路径持久化
- 多 Agent 工作流运行记录

## 9. 当前边界

- 当前只完成了数据库结构和初始化脚本。
- 尚未把 Python/FastAPI 或 Java 服务完整接到 `paperflowdb`。
- 向量写入、检索 API 和学习路径 CRUD 还需要后续服务层实现。
