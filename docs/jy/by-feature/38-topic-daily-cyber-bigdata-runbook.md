# 38 网络安全/大数据每日更新使用说明

## 目标

- 在同一网站下扩展两个新板块：`cybersecurity`、`bigdata`
- 复用当前稳定上传链路，保持去重与可追踪

## 脚本

- 候选生成：`scripts/prepare-topic-papers-review.ps1`
- 每日执行：`scripts/run-topic-daily.ps1`
- 上传执行：`scripts/upload-reviewed-papers.ps1`

## 本地测试

### 网络安全

```powershell
cd F:\Gitee\PaperFlow\PaperFlow
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-topic-daily.ps1 `
  -Topic "cybersecurity" `
  -BaseUrl "http://47.109.193.180:9628" `
  -Email "alice@example.com" `
  -Password "password123" `
  -DailyCount 2 `
  -Model "glm-4-flash"
```

### 大数据

```powershell
cd F:\Gitee\PaperFlow\PaperFlow
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-topic-daily.ps1 `
  -Topic "bigdata" `
  -BaseUrl "http://47.109.193.180:9628" `
  -Email "alice@example.com" `
  -Password "password123" `
  -DailyCount 2 `
  -Model "glm-4-flash"
```

## source 映射

- `medical` -> `agent-medical-review`
- `cybersecurity` -> `agent-cybersecurity-review`
- `bigdata` -> `agent-bigdata-review`

## 定时建议

- 医疗：`0 2 * * *`
- 网络安全：`0 3 * * *`
- 大数据：`0 4 * * *`
