alter table pf_user add column avatar_url varchar(512);
alter table pf_user add column bio varchar(500);
alter table pf_user add column phone varchar(32);
alter table pf_user add column email_verified_at timestamp with time zone;
alter table pf_user add column phone_verified_at timestamp with time zone;
alter table pf_user add column qq_open_id varchar(64);
alter table pf_user add column qq_nickname varchar(255);
alter table pf_user add column qq_bound_at timestamp with time zone;

create unique index if not exists idx_pf_user_phone_unique on pf_user(phone);
create unique index if not exists idx_pf_user_qq_open_id_unique on pf_user(qq_open_id);

create table if not exists pf_user_verification (
  id varchar(64) primary key,
  user_id varchar(64) not null,
  type varchar(32) not null,
  target varchar(255) not null,
  code_hash varchar(255) not null,
  expires_at timestamp with time zone not null,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone not null,
  constraint fk_pf_user_verification_user foreign key (user_id) references pf_user(id)
);

create index if not exists idx_pf_user_verification_user_type_created
  on pf_user_verification(user_id, type, created_at desc);

