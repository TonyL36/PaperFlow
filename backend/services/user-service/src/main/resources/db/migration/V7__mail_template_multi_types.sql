insert into pf_mail_template(template_type, subject_template, body_template, updated_at)
select
  'REGISTER_VERIFICATION',
  'PaperFlow 注册验证码',
  '你的验证码是：{{code}}\n\n{{minutes}} 分钟内有效。\n\n如果不是你本人操作，请忽略本邮件。',
  now()
where not exists (
  select 1 from pf_mail_template where template_type = 'REGISTER_VERIFICATION'
);

insert into pf_mail_template(template_type, subject_template, body_template, updated_at)
select
  'PASSWORD_RESET_VERIFICATION',
  'PaperFlow 找回密码验证码',
  '你的验证码是：{{code}}\n\n{{minutes}} 分钟内有效。\n\n如果不是你本人操作，请忽略本邮件。',
  now()
where not exists (
  select 1 from pf_mail_template where template_type = 'PASSWORD_RESET_VERIFICATION'
);

insert into pf_mail_template(template_type, subject_template, body_template, updated_at)
select
  'BIND_EMAIL_VERIFICATION',
  'PaperFlow 绑定邮箱验证码',
  '你的验证码是：{{code}}\n\n{{minutes}} 分钟内有效。\n\n如果不是你本人操作，请忽略本邮件。',
  now()
where not exists (
  select 1 from pf_mail_template where template_type = 'BIND_EMAIL_VERIFICATION'
);

