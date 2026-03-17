create table if not exists pf_verification (
  id varchar(64) primary key,
  type varchar(32) not null,
  target varchar(255) not null,
  code_hash varchar(255) not null,
  expires_at timestamp with time zone not null,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone not null
);

create index if not exists idx_pf_verification_type_target_created
  on pf_verification(type, target, created_at desc);

