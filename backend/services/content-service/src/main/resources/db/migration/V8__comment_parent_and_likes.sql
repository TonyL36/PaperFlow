alter table pf_comment
  add column if not exists parent_comment_id varchar(64);

create index if not exists idx_pf_comment_post_status_parent_created
  on pf_comment(post_id, status, parent_comment_id, created_at desc);

create table if not exists pf_post_like (
  user_id varchar(64) not null,
  post_id varchar(64) not null,
  created_at timestamp with time zone not null,
  primary key (user_id, post_id),
  constraint fk_pf_post_like_post foreign key (post_id) references pf_post(id)
);

create index if not exists idx_pf_post_like_post_created
  on pf_post_like(post_id, created_at desc);

create index if not exists idx_pf_post_like_user_created
  on pf_post_like(user_id, created_at desc);

create table if not exists pf_comment_like (
  user_id varchar(64) not null,
  comment_id varchar(64) not null,
  created_at timestamp with time zone not null,
  primary key (user_id, comment_id),
  constraint fk_pf_comment_like_comment foreign key (comment_id) references pf_comment(id)
);

create index if not exists idx_pf_comment_like_comment_created
  on pf_comment_like(comment_id, created_at desc);

create index if not exists idx_pf_comment_like_user_created
  on pf_comment_like(user_id, created_at desc);
