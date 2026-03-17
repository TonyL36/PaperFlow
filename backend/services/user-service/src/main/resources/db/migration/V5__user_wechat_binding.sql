alter table pf_user add column wechat_open_id varchar(64);
alter table pf_user add column wechat_nickname varchar(255);
alter table pf_user add column wechat_bound_at timestamp with time zone;

create unique index if not exists idx_pf_user_wechat_open_id_unique on pf_user(wechat_open_id);

