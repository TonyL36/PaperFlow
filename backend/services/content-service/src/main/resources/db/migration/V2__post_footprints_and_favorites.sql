create table if not exists pf_post_footprint (
  user_id varchar(64) not null,
  post_id varchar(64) not null,
  last_viewed_at timestamp with time zone not null,
  primary key (user_id, post_id),
  constraint fk_pf_post_footprint_post foreign key (post_id) references pf_post(id)
);

create index if not exists idx_pf_post_footprint_user_last_viewed
  on pf_post_footprint(user_id, last_viewed_at desc);

create table if not exists pf_post_favorite (
  user_id varchar(64) not null,
  post_id varchar(64) not null,
  created_at timestamp with time zone not null,
  primary key (user_id, post_id),
  constraint fk_pf_post_favorite_post foreign key (post_id) references pf_post(id)
);

create index if not exists idx_pf_post_favorite_user_created
  on pf_post_favorite(user_id, created_at desc);

