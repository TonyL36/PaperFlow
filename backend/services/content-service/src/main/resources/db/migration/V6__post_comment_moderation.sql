alter table pf_post
  add column if not exists comment_moderation_enabled boolean not null default true;
