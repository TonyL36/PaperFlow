# 39 网络安全/大数据每日更新技术文档

## 设计目标

- 在同一站点扩展 `cybersecurity` 与 `bigdata` 两个板块
- 复用既有“生成审核清单 -> 审核通过上传”链路
- 按板块独立去重、独立状态文件、独立锁文件

## 脚本分层

- 候选生成：`scripts/prepare-topic-papers-review.ps1`
- 每日编排：`scripts/run-topic-daily.ps1`
- 上传执行：`scripts/upload-reviewed-papers.ps1`

## 板块映射

- `medical` -> `agent-medical-review`
- `cybersecurity` -> `agent-cybersecurity-review`
- `bigdata` -> `agent-bigdata-review`

## 去重策略

- 线上去重：按 `source + title` 拉取并过滤
- 状态去重：按板块独立 `sourceId` 状态文件
- 批内去重：同一批 title/sourceId 命中直接跳过

## 运行与互斥

- 每个板块独立锁文件，避免并发重入
- 任务异常时自动清理锁文件
- 失败/跳过/成功均落 CSV，便于补偿

## 云端定时

- `0 3 * * *`：网络安全每日更新
- `0 4 * * *`：大数据每日更新

## 运维约束

- 仅使用已存在仓库目录，不自动 clone
- 服务器需可用 `pwsh`
- 定时写入后通过 `crontab -l | grep run-topic-daily.ps1` 验证
