create table if not exists pf_user (
  id varchar(64) primary key,
  email varchar(255) not null unique,
  password_hash varchar(255) not null,
  display_name varchar(255) not null,
  roles varchar(255) not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists pf_refresh_token (
  id varchar(64) primary key,
  user_id varchar(64) not null,
  token_hash varchar(255) not null unique,
  expires_at timestamp with time zone not null,
  revoked boolean not null,
  created_at timestamp with time zone not null,
  constraint fk_pf_refresh_token_user foreign key (user_id) references pf_user(id)
);

