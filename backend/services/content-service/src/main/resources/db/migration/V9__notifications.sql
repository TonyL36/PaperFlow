create table if not exists pf_notification (
  id varchar(64) primary key,
  recipient_user_id varchar(64) not null,
  actor_user_id varchar(64) not null,
  type varchar(32) not null,
  title varchar(200) not null,
  content text not null,
  post_id varchar(64) not null,
  target_comment_id varchar(64) not null,
  read_at timestamp with time zone,
  created_at timestamp with time zone not null
);

create index if not exists idx_pf_notification_recipient_created on pf_notification(recipient_user_id, created_at desc);
create index if not exists idx_pf_notification_recipient_read on pf_notification(recipient_user_id, read_at);
