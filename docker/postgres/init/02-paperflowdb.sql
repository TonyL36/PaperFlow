\connect paperflowdb

create extension if not exists vector;
create extension if not exists pg_trgm;
create extension if not exists unaccent;

create or replace function pf_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists pf_paper (
  id varchar(64) primary key,
  external_source varchar(32) not null default 'arxiv',
  external_id varchar(255),
  title varchar(512) not null,
  normalized_title varchar(512) not null,
  abstract text,
  authors jsonb not null default '[]'::jsonb,
  year integer,
  source varchar(32) not null,
  lifecycle_status varchar(32) not null default 'active',
  ingest_status varchar(32) not null default 'pending',
  language varchar(16) not null default 'en',
  venue varchar(255),
  doi varchar(255),
  arxiv_url text,
  code_url text,
  file_path text,
  file_name varchar(255),
  normalized_filename varchar(255),
  summary text,
  teaser text,
  tags jsonb not null default '[]'::jsonb,
  cluster_label varchar(128),
  curator_score numeric(6, 4) not null default 0,
  relevance_score numeric(6, 4) not null default 0,
  novelty_score numeric(6, 4) not null default 0,
  quality_score numeric(6, 4) not null default 0,
  duplicate_of varchar(64),
  planned_goal text,
  published_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint ck_pf_paper_source check (source in ('roaming', 'uploaded', 'planned', 'discovered', 'arxiv', 'local-corpus')),
  constraint ck_pf_paper_lifecycle_status check (lifecycle_status in ('active', 'archived', 'deleted')),
  constraint ck_pf_paper_ingest_status check (ingest_status in ('pending', 'parsed', 'embedded', 'ready', 'failed')),
  constraint uq_pf_paper_external unique (external_source, external_id),
  constraint fk_pf_paper_duplicate_of foreign key (duplicate_of) references pf_paper(id)
);

create table if not exists pf_paper_chunk (
  id bigserial primary key,
  paper_id varchar(64) not null,
  chunk_no integer not null,
  chunk_kind varchar(32) not null default 'paragraph',
  section_title varchar(255),
  page_from integer,
  page_to integer,
  token_count integer not null default 0,
  content text not null,
  content_tsv tsvector generated always as (
    to_tsvector('simple', coalesce(content, ''))
  ) stored,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint uq_pf_paper_chunk unique (paper_id, chunk_no),
  constraint ck_pf_paper_chunk_kind check (chunk_kind in ('title', 'abstract', 'paragraph', 'formula', 'caption', 'table', 'quote', 'appendix')),
  constraint fk_pf_paper_chunk_paper foreign key (paper_id) references pf_paper(id) on delete cascade
);

create table if not exists pf_paper_embedding (
  id bigserial primary key,
  paper_id varchar(64) not null,
  chunk_id bigint not null,
  embedding_provider varchar(64) not null,
  embedding_model varchar(128) not null,
  embedding_dim integer not null default 1536,
  embedding vector(1536) not null,
  created_at timestamp with time zone not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint uq_pf_paper_embedding unique (chunk_id, embedding_provider, embedding_model),
  constraint fk_pf_paper_embedding_paper foreign key (paper_id) references pf_paper(id) on delete cascade,
  constraint fk_pf_paper_embedding_chunk foreign key (chunk_id) references pf_paper_chunk(id) on delete cascade
);

create table if not exists pf_user_activity (
  id bigserial primary key,
  user_id varchar(64) not null,
  paper_id varchar(64),
  chunk_id bigint,
  activity_type varchar(32) not null,
  source_context varchar(32) not null default 'reader',
  page_no integer,
  duration_seconds integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  constraint ck_pf_user_activity_type check (
    activity_type in (
      'paper_uploaded',
      'paper_viewed',
      'paper_completed',
      'paper_favorited',
      'paper_unfavorited',
      'highlight_created',
      'note_created',
      'question_asked',
      'plan_started',
      'plan_completed',
      'recommendation_accepted',
      'recommendation_dismissed'
    )
  ),
  constraint ck_pf_user_activity_source_context check (source_context in ('reader', 'nebula', 'feed', 'plan', 'chat')),
  constraint fk_pf_user_activity_paper foreign key (paper_id) references pf_paper(id) on delete set null,
  constraint fk_pf_user_activity_chunk foreign key (chunk_id) references pf_paper_chunk(id) on delete set null
);

create table if not exists pf_visualization_coord (
  paper_id varchar(64) primary key,
  embedding_provider varchar(64) not null,
  embedding_model varchar(128) not null,
  reduction_algorithm varchar(32) not null default 'tsne',
  cluster_id integer,
  cluster_label varchar(128),
  x double precision not null,
  y double precision not null,
  z double precision,
  generated_at timestamp with time zone not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint ck_pf_visualization_algorithm check (reduction_algorithm in ('tsne', 'umap', 'pca', 'manual')),
  constraint fk_pf_visualization_coord_paper foreign key (paper_id) references pf_paper(id) on delete cascade
);

create table if not exists pf_learning_plan (
  id varchar(64) primary key,
  user_id varchar(64) not null,
  goal text not null,
  status varchar(32) not null default 'draft',
  source varchar(32) not null default 'pathfinder',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint ck_pf_learning_plan_status check (status in ('draft', 'active', 'completed', 'archived')),
  constraint ck_pf_learning_plan_source check (source in ('pathfinder', 'manual', 'sage'))
);

create table if not exists pf_learning_plan_stage (
  id varchar(64) primary key,
  plan_id varchar(64) not null,
  stage_no integer not null,
  title varchar(255) not null,
  objective text not null,
  status varchar(32) not null default 'todo',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint uq_pf_learning_plan_stage unique (plan_id, stage_no),
  constraint ck_pf_learning_plan_stage_status check (status in ('todo', 'doing', 'done', 'skipped')),
  constraint fk_pf_learning_plan_stage_plan foreign key (plan_id) references pf_learning_plan(id) on delete cascade
);

create table if not exists pf_learning_plan_stage_paper (
  id bigserial primary key,
  stage_id varchar(64) not null,
  paper_id varchar(64) not null,
  paper_order integer not null default 1,
  is_required boolean not null default true,
  created_at timestamp with time zone not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint uq_pf_learning_plan_stage_paper unique (stage_id, paper_id),
  constraint fk_pf_learning_plan_stage_paper_stage foreign key (stage_id) references pf_learning_plan_stage(id) on delete cascade,
  constraint fk_pf_learning_plan_stage_paper_paper foreign key (paper_id) references pf_paper(id) on delete cascade
);

create table if not exists pf_agent_run (
  id varchar(64) primary key,
  trigger varchar(32) not null,
  current_node varchar(64) not null,
  status varchar(32) not null default 'running',
  user_id varchar(64),
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint ck_pf_agent_run_trigger check (trigger in ('roaming', 'uploaded', 'planned', 'discovered')),
  constraint ck_pf_agent_run_status check (status in ('running', 'waiting', 'completed', 'failed'))
);

create table if not exists pf_agent_run_message (
  id bigserial primary key,
  run_id varchar(64) not null,
  node varchar(64) not null,
  level varchar(16) not null default 'info',
  message text not null,
  created_at timestamp with time zone not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint ck_pf_agent_run_message_level check (level in ('debug', 'info', 'warn', 'error')),
  constraint fk_pf_agent_run_message_run foreign key (run_id) references pf_agent_run(id) on delete cascade
);

create trigger trg_pf_paper_updated_at
before update on pf_paper
for each row execute function pf_set_updated_at();

create trigger trg_pf_paper_chunk_updated_at
before update on pf_paper_chunk
for each row execute function pf_set_updated_at();

create trigger trg_pf_learning_plan_updated_at
before update on pf_learning_plan
for each row execute function pf_set_updated_at();

create trigger trg_pf_learning_plan_stage_updated_at
before update on pf_learning_plan_stage
for each row execute function pf_set_updated_at();

create trigger trg_pf_agent_run_updated_at
before update on pf_agent_run
for each row execute function pf_set_updated_at();

create index if not exists idx_pf_paper_source on pf_paper(source);
create index if not exists idx_pf_paper_year on pf_paper(year desc);
create index if not exists idx_pf_paper_published_at on pf_paper(published_at desc nulls last);
create index if not exists idx_pf_paper_duplicate_of on pf_paper(duplicate_of);
create index if not exists idx_pf_paper_normalized_title_trgm on pf_paper using gin (normalized_title gin_trgm_ops);
create index if not exists idx_pf_paper_tags_gin on pf_paper using gin (tags);

create index if not exists idx_pf_paper_chunk_paper_id on pf_paper_chunk(paper_id);
create index if not exists idx_pf_paper_chunk_kind on pf_paper_chunk(chunk_kind);
create index if not exists idx_pf_paper_chunk_content_tsv on pf_paper_chunk using gin (content_tsv);

create index if not exists idx_pf_paper_embedding_paper_id on pf_paper_embedding(paper_id);
create index if not exists idx_pf_paper_embedding_model on pf_paper_embedding(embedding_provider, embedding_model);
create index if not exists idx_pf_paper_embedding_vector_cosine on pf_paper_embedding using hnsw (embedding vector_cosine_ops);

create index if not exists idx_pf_user_activity_user_created on pf_user_activity(user_id, created_at desc);
create index if not exists idx_pf_user_activity_paper_created on pf_user_activity(paper_id, created_at desc);
create index if not exists idx_pf_user_activity_type on pf_user_activity(activity_type);

create index if not exists idx_pf_visualization_coord_cluster on pf_visualization_coord(cluster_id);
create index if not exists idx_pf_learning_plan_user_status on pf_learning_plan(user_id, status);
create index if not exists idx_pf_learning_plan_stage_plan on pf_learning_plan_stage(plan_id, stage_no);
create index if not exists idx_pf_learning_plan_stage_paper_stage on pf_learning_plan_stage_paper(stage_id, paper_order);
create index if not exists idx_pf_agent_run_status on pf_agent_run(status, created_at desc);
create index if not exists idx_pf_agent_run_message_run on pf_agent_run_message(run_id, created_at);
