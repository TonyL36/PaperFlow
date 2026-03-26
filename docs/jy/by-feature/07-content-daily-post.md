# 07 内容服务：每日帖子自动生成（Scheduler）

## 功能目标

- 每天自动生成一条“每日更新”帖子，作为前端 `/posts` 页面的内容来源
- 当前实现为占位版本（便于先跑通端到端闭环）
- 后续可替换为 Curator/Editor Agent 产出的内容（网关转发下游 Agent，不在本次范围）

## 端到端行为

1. 定时任务触发（默认每天 UTC 09:00）
2. 检查当天是否已有帖子
3. 若没有，写入一条新帖子（`source=scheduler`）

## 关键代码原文 + 解读

代码位置：[DailyPostJob.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/job/DailyPostJob.java)

```java
@Component
public class DailyPostJob {
  private final PostRepository posts;

  public DailyPostJob(PostRepository posts) {
    this.posts = posts;
  }

  @Scheduled(cron = "0 0 9 * * *")
  public void ensureDailyPost() {
    OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
    OffsetDateTime start = now.truncatedTo(ChronoUnit.DAYS);
    OffsetDateTime end = start.plusDays(1);
    if (posts.existsByPublishedAtBetween(start, end)) {
      return;
    }
    PostEntity p = new PostEntity();
    p.setId("post_" + UUID.randomUUID().toString().replace("-", ""));
    p.setTitle("Daily Update " + start.toLocalDate());
    p.setContent("This is an auto-generated daily post placeholder.");
    p.setSource("scheduler");
    p.setPublishedAt(now);
    posts.save(p);
  }
}
```

逐段解释：

- `@Scheduled(cron = "0 0 9 * * *")`：每天 09:00 触发一次（当前以服务端进程时间为准）。
- `OffsetDateTime.now(ZoneOffset.UTC)`：
  - 明确以 UTC 作为“每日”划分基准，避免部署到不同时区后“日界线错乱”。
- `start/end`：
  - 用“当天 00:00:00”到“次日 00:00:00”定义当天范围；
  - 配合 `existsByPublishedAtBetween` 判断当天是否已生成过帖子。
- 生成帖子：
  - `id` 外部可用稳定字符串，不暴露自增主键；
  - `source=scheduler` 方便追踪帖子来源（未来会出现 `curator_push`、`editor_digest` 等）。

## 演进方向

- 幂等增强：把“每日唯一性”改成数据库唯一约束（例如 `published_date` 唯一），更抗并发/重启
- 内容生成替换：
  - 由 Curator 选题 → Editor 生成摘要/配图 → content-service 入库
  - 调用通过网关转发到 Agent 服务
