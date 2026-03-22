alter table pf_pathfinder_session
  add column if not exists model_name varchar(64) not null default 'glm-4-flash';
