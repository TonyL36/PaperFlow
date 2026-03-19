alter table pf_post add column author_user_id varchar(64);
create index if not exists idx_pf_post_author_user_id on pf_post(author_user_id);

