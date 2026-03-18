create table if not exists pf_post (
  id varchar(64) primary key,
  title varchar(255) not null,
  content text not null,
  source varchar(64) not null,
  published_at timestamp with time zone not null
);

create table if not exists pf_comment (
  id varchar(64) primary key,
  post_id varchar(64) not null,
  user_id varchar(64) not null,
  content text not null,
  status varchar(32) not null,
  created_at timestamp with time zone not null,
  constraint fk_pf_comment_post foreign key (post_id) references pf_post(id)
);

