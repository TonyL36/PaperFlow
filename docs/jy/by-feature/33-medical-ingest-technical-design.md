# 33 医疗论文去重上传技术文档

## 设计目标

- 脚本可重复运行，不依赖一次性人工记忆
- 上传链路具备双重去重防线
- 过程可审计：每轮都有输入、输出、跳过与失败记录

## 架构分层

- 数据抓取与总结层：`prepare-medical-papers-review.ps1`
- 上传与去重保护层：`upload-reviewed-papers.ps1`
- 编排层：`run-medical-ingest-pipeline.ps1`

## 关键流程

1. 登录后获取线上已有文章标题集合（`agent-medical-review`）
2. 从 arXiv 多页抓取候选论文并标准化
3. 过滤线上已存在标题，生成 review JSON/MD
4. 将可发布条目标记为 `APPROVED`
5. 上传前再次去重校验（标题 + sourceId + 批内去重）
6. 写出 ok/fail/skip CSV 与本地状态文件

## 去重实现

### 生成阶段去重

- 在抓取后按 `sourceId` 或标题去重
- 再按线上标题集合过滤
- 结果是“待审核集合”本身已尽量唯一

### 上传阶段去重

- 再次拉取线上标题集合，阻断重复标题
- 读取本地状态文件 `scripts/state/medical-ingest-state.json`
- 对 `sourceId` 做持久化去重
- 对当前批次做运行时去重（防止同批重复）

## 数据产物

- 审核输入：`medical-review-*.json`、`medical-review-*.md`
- 上传结果：`medical-upload-ok-*.csv`
- 上传失败：`medical-upload-fail-*.csv`
- 去重跳过：`medical-upload-skip-*.csv`
- 去重状态：`scripts/state/medical-ingest-state.json`

## 容错与降级

- AI 总结失败时返回占位文本，不中断整批任务
- 流水线仅自动上传 `APPROVED` 条目
- 编排脚本每轮读取最新结果文件，保证断点后可继续执行

## 可观测性

- 每轮输出：`ok`、`skip`、`total`、`dup`
- 终态输出：`FINAL count` 与 `dup`
- 通过 CSV 可回溯每条记录的处理结果

## 运维建议

- 推荐长期用 `run-medical-ingest-pipeline.ps1` 作为唯一入口
- 每次任务后抽检最新 `ok_csv` 的 3~5 条（乱码 + PDF 可访问）
- 若历史已有重复，先做清理，再继续流水线
