create table if not exists pf_paper_asset (
  id varchar(64) primary key,
  source_url text not null,
  storage_path text not null,
  content_type varchar(128) not null,
  size_bytes bigint not null,
  file_sha256 varchar(64),
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create unique index if not exists uk_pf_paper_asset_source_url on pf_paper_asset(source_url);
