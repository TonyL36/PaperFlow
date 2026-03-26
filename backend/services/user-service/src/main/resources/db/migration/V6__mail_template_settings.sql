create table if not exists pf_mail_template (
  template_type varchar(64) primary key,
  subject_template varchar(255) not null,
  body_template varchar(4000) not null,
  updated_at timestamp with time zone not null
);

insert into pf_mail_template(template_type, subject_template, body_template, updated_at)
select
  'EMAIL_VERIFICATION',
  'PaperFlow 验证码 - {{purpose}}',
  '你的验证码是：{{code}}\n\n{{minutes}} 分钟内有效。\n\n如果不是你本人操作，请忽略本邮件。',
  now()
where not exists (
  select 1 from pf_mail_template where template_type = 'EMAIL_VERIFICATION'
);

