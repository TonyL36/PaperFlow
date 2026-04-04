# 40 scheduler 模板帖治理技术文档

## X需求

- 解决 `scheduler` 重复模板帖问题，避免同质内容持续写入
- 新增可控开关，默认关闭自动模板帖，避免线上误触发
- 保留按日幂等保障，确保开启后同一天最多写入一条 `source=scheduler` 帖子

## 开发方法

### 1) 增加任务开关并默认关闭

- 在 [DailyPostJob.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/job/DailyPostJob.java#L15-L17) 增加条件装配：
  - `@ConditionalOnProperty(prefix = "paperflow.daily-post", name = "enabled", havingValue = "true")`
- 在 [application.yml](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/resources/application.yml#L23-L24) 增加配置映射：
  - `paperflow.daily-post.enabled: ${PF_DAILY_POST_ENABLED:false}`

### 2) 修正幂等判断范围

- 由“当天任意来源帖子存在即跳过”改为“仅判断 `source=scheduler`”
- 使用 [PostRepository.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/repo/PostRepository.java#L16) 的 `existsBySourceAndPublishedAtBetween(...)`
- 在 [DailyPostJob.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/job/DailyPostJob.java#L34-L35) 使用：
  - `posts.existsBySourceAndPublishedAtBetween("scheduler", start, end)`

### 3) 保留冷启动补偿能力

- 在 [DailyPostJob.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/job/DailyPostJob.java#L24-L27) 通过 `ApplicationReadyEvent` 触发一次 `ensureDailyPost()`
- 当开关关闭时，`DailyPostJob` 不装配，启动阶段不会写入模板帖

## 测试方法

### 本地验证

1. 设置 `PF_DAILY_POST_ENABLED=false` 启动 `content-service`
2. 检查启动日志与数据库，确认无新增 `source=scheduler` 帖子
3. 设置 `PF_DAILY_POST_ENABLED=true` 重启服务
4. 当日首次启动应新增 1 条模板帖，再次触发定时任务不重复写入

### 数据校验

- SQL 统计当日 scheduler 帖子数：
  - `select count(*) from pf_post where source='scheduler' and published_at>=:start and published_at<:end;`
- 预期结果：
  - 开关关闭：`0`
  - 开关开启：`<=1`

## 验收与回滚

### 验收标准

- 默认配置下（未显式设置环境变量）不再生成模板帖
- 开启配置后同一天内最多仅有 1 条 `source=scheduler` 模板帖
- 历史重复模板帖删除后，对应详情接口返回 404（已验证样本：`post_4745a52eda46491f8f99f57c4e2a49f5`、`post_79203f539afc4192bd338631e874aac1`）

### 回滚方案

- 紧急止血：将 `PF_DAILY_POST_ENABLED=false` 并重启服务
- 代码回滚：回退 [DailyPostJob.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/job/DailyPostJob.java) 与 [application.yml](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/resources/application.yml) 到上一稳定版本
- 数据回滚：按时间窗口删除异常新增的 `source=scheduler` 帖子，保留人工/业务来源帖子
