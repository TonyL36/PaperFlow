# 36 医疗论文每日定时更新使用说明（昨晚脚本链路）

## 目标

- 基于昨晚验证通过的脚本链路每日自动更新论文
- 保持去重：标题去重 + sourceId 状态去重
- 自动输出成功/失败/跳过清单

## 脚本链路

- 生成审核清单：`scripts/prepare-medical-papers-review.ps1`
- 上传审核通过：`scripts/upload-reviewed-papers.ps1`
- 每日调度入口：`scripts/run-medical-daily.ps1`
- 远程部署脚本：`scripts/deploy-medical-daily-remote.ps1`

## 本地测试

```powershell
cd F:\Gitee\PaperFlow\PaperFlow
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-medical-daily.ps1 `
  -BaseUrl "http://47.109.193.180:9628" `
  -Email "alice@example.com" `
  -Password "password123" `
  -DailyCount 2 `
  -Model "glm-4-flash"
```

## 服务器部署（不 clone）

```powershell
cd F:\Gitee\PaperFlow\PaperFlow
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy-medical-daily-remote.ps1 `
  -RemoteHost "47.109.193.180" `
  -User "root" `
  -RepoDir "/opt/paperflow" `
  -BaseUrl "http://47.109.193.180:9628" `
  -Email "alice@example.com" `
  -Password "password123" `
  -Cron "0 2 * * *" `
  -DailyCount 10 `
  -Model "glm-4-flash"
```

- 若 `RepoDir` 不存在脚本会直接退出，不会 clone
- `RepoDir` 可以是非 git 目录，只要存在 `scripts/run-medical-daily.ps1`

## 结果文件

- `paperflow/scripts/out/medical-upload-ok-*.csv`
- `paperflow/scripts/out/medical-upload-fail-*.csv`
- `paperflow/scripts/out/medical-upload-skip-*.csv`
