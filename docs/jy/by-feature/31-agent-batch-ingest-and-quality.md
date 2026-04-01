# 31 Agent 批量论文导入与质量控制

## 功能目标

- 面向真实论文来源批量导入测试数据
- 覆盖医药信息、网络安全、AI-coding、游戏开发四类主题
- 每篇文章包含可读的中英文结构化摘要与 PDF 链接
- 支持逐篇入库与失败清单导出，便于复盘

## 主要脚本

- [mock-agent-paper-ingest-openalex.ps1](file:///f:/Gitee/PaperFlow/paperflow/scripts/mock-agent-paper-ingest-openalex.ps1)
- [mock-agent-paper-ingest-medical.ps1](file:///f:/Gitee/PaperFlow/paperflow/scripts/mock-agent-paper-ingest-medical.ps1)
- [mock-agent-paper-ingest-batch-safe.ps1](file:///f:/Gitee/PaperFlow/paperflow/scripts/mock-agent-paper-ingest-batch-safe.ps1)

## 执行入口

```powershell
cd F:\Gitee\PaperFlow\paperflow
powershell -ExecutionPolicy Bypass -File .\scripts\mock-agent-paper-ingest-openalex.ps1 `
  -BaseUrl "http://47.109.193.180:9628" `
  -DemoToken "demo-token" `
  -TargetCount 100 `
  -PublishNow
```

## 导入策略

- 优先 OpenAlex 实时拉取真实论文
- 若条目不足，脚本可补充 arXiv 数据源
- 逐篇写入，单篇失败不影响后续条目
- 导入后输出成功/失败 CSV 清单

## 内容结构

- 中文部分：方向、国内外候选、问题摘录、结论摘录、风险提示
- 英文部分：Domain/Region/Problem/Findings/Abstract
- 可选 AI 增强摘要：`-UseAiSummary`

## 关键参数

- `-TargetCount`：导入目标数量
- `-PublishNow`：将 `publishedAt` 设为当前时间，便于首页可见
- `-UseAiSummary`：调用本地已配置 AI 接口增强摘要

## 常见问题

### 1) 页面看起来导入很少

- 实际原因通常是分页 + 发布时间排序导致
- 排查：
  - 查询 `GET /api/v1/posts?page[number]=1&page[size]=200`
  - 查看 `source=agent-openalex` 的计数
- 处理：使用 `-PublishNow` 再导入一批用于前台验收

### 2) internal agent 接口不可用

- 现象：`Endpoint not enabled`
- 处理：脚本会自动回退到 `/api/v1/papers/ingest`

### 3) 导入内容出现低质量摘要

- 原因：外部源字段质量波动
- 处理：
  - 开启 `-UseAiSummary` 增强
  - 通过失败 CSV 复盘并二次筛选

## 验收建议

- 数据量验收：确认 `agent-openalex` 数量达到预期
- 抽样验收：随机检查 10 篇，确认有 PDF、双语摘要、标签正确
- 回归验收：访问 `/paperflow/papers/{postId}`，确认 PDF 可加载与问答可用
