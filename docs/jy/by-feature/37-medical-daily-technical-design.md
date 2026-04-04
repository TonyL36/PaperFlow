# 37 医疗论文每日定时更新技术文档

## 设计目标

- 每日固定更新（默认 10 篇）
- 复用昨晚正确链路，避免引入新来源
- 运行可重试、可观测、可审计

## 执行流程

1. `run-medical-daily.ps1` 获取当前统计并检查重复标题
2. 调用 `prepare-medical-papers-review.ps1` 拉取候选并生成审核 JSON
3. 自动将可用条目标记为 `APPROVED`，AI 异常条目标记 `REJECTED`
4. 调用 `upload-reviewed-papers.ps1` 上传并执行去重保护
5. 输出 `ok/fail/skip` CSV 与最终统计

## 去重策略

- 生成阶段：过滤线上同标题
- 上传阶段：再次过滤线上同标题
- 上传阶段：使用 `scripts/state/medical-ingest-state.json` 去重 `sourceId`
- 批内阶段：运行期 title/sourceId 双去重

## 安全控制

- 互斥锁：`scripts/state/medical-daily.lock`
- 线上若存在重复标题组，任务直接失败并退出
- 自动清理锁文件，避免死锁

## 运维约束

- 远程部署脚本不 clone 仓库，`RepoDir` 不存在立即退出
- 服务器需已安装 `pwsh`
- 定时任务写入后可通过 `crontab -l | grep run-medical-daily.ps1` 验证

## 后端保护项

- `DailyPostJob` 已增加开关，默认关闭：`PF_DAILY_POST_ENABLED=false`
- `scheduler` 每日帖去重条件为 `source=scheduler + 当天时间窗口`
- 历史重复模板帖清理后应保持 404，避免“同内容重复帖”再次出现
