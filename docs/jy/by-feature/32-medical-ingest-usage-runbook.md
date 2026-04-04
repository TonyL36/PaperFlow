# 32 医疗论文去重上传使用说明（可重复执行）

## 目标

- 让论文导入流程可长期复用
- 默认避免重复上传同一篇文章
- 在批量执行时输出成功/失败/跳过清单，便于追踪

## 脚本清单

- 生成审核清单：`scripts/prepare-medical-papers-review.ps1`
- 上传审核通过项（含去重保护）：`scripts/upload-reviewed-papers.ps1`
- 一键批量流水线：`scripts/run-medical-ingest-pipeline.ps1`

## 推荐用法（一键流水线）

```powershell
cd F:\Gitee\PaperFlow\PaperFlow
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-medical-ingest-pipeline.ps1 `
  -BaseUrl "http://47.109.193.180:9628" `
  -Email "alice@example.com" `
  -Password "password123" `
  -TargetTotal 120 `
  -BatchSize 10 `
  -MaxRounds 20 `
  -Model "glm-4-flash"
```

## 手动三步法

### 1) 生成审核清单

```powershell
cd F:\Gitee\PaperFlow\PaperFlow
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-medical-papers-review.ps1 `
  -BaseUrl "http://47.109.193.180:9628" `
  -Email "alice@example.com" `
  -Password "password123" `
  -TargetCount 10 `
  -Model "glm-4-flash"
```

### 2) 审核 JSON

- 打开 `paperflow\scripts\out\medical-review-*.json`
- 将要发布条目的 `reviewStatus` 改为 `APPROVED`

### 3) 上传（自动去重）

```powershell
cd F:\Gitee\PaperFlow\PaperFlow
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\upload-reviewed-papers.ps1 `
  -BaseUrl "http://47.109.193.180:9628" `
  -Email "alice@example.com" `
  -Password "password123" `
  -ReviewJsonPath "F:\Gitee\PaperFlow\PaperFlow\paperflow\scripts\out\medical-review-xxxx.json"
```

## 去重规则

- 生成阶段：跳过线上已存在的同标题文章
- 上传阶段：再次检查同标题，命中则写入 `skip_csv` 不上传
- 上传阶段：基于本地状态文件 `scripts/state/medical-ingest-state.json` 避免重复 `sourceId`
- 同一批次内：标题/sourceId 也会去重，避免一次任务中重复提交

## 输出文件

- 生成审核清单：`medical-review-*.json`、`medical-review-*.md`
- 上传结果：`medical-upload-ok-*.csv`、`medical-upload-fail-*.csv`、`medical-upload-skip-*.csv`

## 常见问题

- `no papers fetched from arxiv`：稍后重试，或降低单次目标数量（如 `-TargetCount 10`）
- `AI service unavailable`：该条会在流水线中标记为 `REJECTED`，不会上传
- 线上仍有重复：先执行去重清理，再跑流水线
