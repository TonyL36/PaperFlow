# 31 Agent 批量论文导入与质量控制

## 功能目标

- 面向真实论文来源批量导入测试数据
- 覆盖医药信息、网络安全、AI-coding、游戏开发四类主题
- 每篇文章包含结构化总结、PDF 链接与审核状态
- 支持“先审核再上传”、失败清单导出与回灌重传

## 主要脚本

- [mock-agent-paper-ingest-openalex.ps1](file:///f:/Gitee/PaperFlow/paperflow/scripts/mock-agent-paper-ingest-openalex.ps1)
- [mock-agent-paper-ingest-medical.ps1](file:///f:/Gitee/PaperFlow/paperflow/scripts/mock-agent-paper-ingest-medical.ps1)
- [mock-agent-paper-ingest-batch-safe.ps1](file:///f:/Gitee/PaperFlow/paperflow/scripts/mock-agent-paper-ingest-batch-safe.ps1)
- [prepare-medical-papers-review.ps1](file:///f:/Gitee/PaperFlow/PaperFlow/scripts/prepare-medical-papers-review.ps1)
- [upload-reviewed-papers.ps1](file:///f:/Gitee/PaperFlow/PaperFlow/scripts/upload-reviewed-papers.ps1)
- [rewrite-and-reupload-medical.ps1](file:///f:/Gitee/PaperFlow/PaperFlow/scripts/rewrite-and-reupload-medical.ps1)

## 审核链路（推荐）

### 1) 生成待审核清单

```powershell
cd F:\Gitee\PaperFlow\paperflow
powershell -ExecutionPolicy Bypass -File .\scripts\prepare-medical-papers-review.ps1 `
  -BaseUrl "http://47.109.193.180:9628" `
  -TargetCount 6 `
  -SeedJsonPath ".\scripts\data\medical-seed-20260330.json"
```

- 产物：
  - `scripts/out/medical-review-*.md`（人工阅读）
  - `scripts/out/medical-review-*.json`（可上传结构）
- 标题格式：`英文题名（中文题名）`
- 每篇含：`OneLineConclusion` + 结构化正文

### 2) 人工审核

- 在 JSON 中修改：
  - `reviewStatus: PENDING -> APPROVED/REJECTED`
  - `reviewerNote` 填写人工意见

### 3) 仅上传审核通过项

```powershell
cd F:\Gitee\PaperFlow\paperflow
powershell -ExecutionPolicy Bypass -File .\scripts\upload-reviewed-papers.ps1 `
  -BaseUrl "http://47.109.193.180:9628" `
  -ReviewJsonPath ".\scripts\out\medical-review-xxxx.json"
```

## 重写回灌链路（已上线内容修复）

```powershell
cd F:\Gitee\PaperFlow
powershell -ExecutionPolicy Bypass -File .\PaperFlow\scripts\rewrite-and-reupload-medical.ps1 `
  -ReviewJsonPath "F:\Gitee\PaperFlow\PaperFlow\paperflow\scripts\out\medical-review-1775041055.json" `
  -EnvBatPath "F:\Gitee\PaperFlow\PaperFlow\scripts\env\local.env.bat" `
  -MaxCount 6
```

- 用本地 GLM 配置重写正文，再按原 `postId` 覆盖回灌
- 用于修复线上内容质量、Markdown 结构和编码问题

## 数据与质量策略

- 数据源：OpenAlex + arXiv + 本地 seed
- 写入策略：逐篇写入，单篇失败不阻塞后续
- 输出策略：成功/失败 CSV 全量落地
- 编码策略：上传与回灌统一 UTF-8 字节 + `charset=utf-8`

## 内容结构

- `OneLineConclusion`
- `Research Problem and Background`
- `Method and Technical Route`
- `Results and Evidence`
- `Limitations and Scope`
- `Engineering and Product Implications`
- `Human Review Checklist`

## 关键参数

- `-TargetCount`：生成审核条目数
- `-SeedJsonPath`：固定种子数据输入
- `-ReviewJsonPath`：审核 JSON 输入
- `-EnvBatPath`：本地 GLM 环境变量文件
- `-MaxCount`：本次重写/回灌数量上限

## 常见问题

### 1) 页面看起来导入很少或顺序靠后

- 原因：分页、发布时间与来源混合排序
- 处理：按 `postId` 精确抽检，不只看首页前几条

### 2) 中文出现 `???`

- 原因：请求体编码不明确
- 处理：统一 UTF-8 字节提交 JSON，并设置 `application/json; charset=utf-8`

### 3) 正文出现 `##` 或 `**` 原样显示

- 原因：正文结构不规范或前端渲染能力不匹配
- 处理：
  - 生成阶段规范 Markdown 标题分行
  - 前端 `RichText` 增加 inline 解析与有序列表支持
  - 已发布内容通过重写回灌修复

## 验收建议

- 接口验收：`/api/v1/posts/{postId}` 返回 200 且内容无 `???`
- 页面验收：详情页标题、列表、粗体、代码片段均正常渲染
- 资源验收：PDF 代理可访问且命中持久缓存
