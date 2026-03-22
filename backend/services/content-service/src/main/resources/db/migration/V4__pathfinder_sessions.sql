create table if not exists pf_pathfinder_session (
  session_id varchar(64) primary key,
  user_id varchar(64) not null,
  goal text not null,
  focus_json text not null,
  stages_json text not null,
  messages_json text not null,
  active_stage_id varchar(64),
  favorited boolean not null default false,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create index if not exists idx_pf_pathfinder_session_user_updated
  on pf_pathfinder_session(user_id, updated_at desc);

create index if not exists idx_pf_pathfinder_session_user_favorited_updated
  on pf_pathfinder_session(user_id, favorited, updated_at desc);
