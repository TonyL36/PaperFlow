# 07 内容服务：每日帖子自动生成（Scheduler 保底任务）

## 现状定位

- 该能力仍保留，但定位是“保底占位内容”，不是主生产链路。
- 当前主链路是三主题日更脚本（medical / cybersecurity / bigdata）。
- 本任务负责在开启开关时，确保当天至少有一条 `source=scheduler` 的帖子。

## 端到端行为（当前实现）

1. 服务启动完成后执行一次 `bootstrap()`
2. 每天服务进程默认时区 09:00 再执行一次 `ensureDailyPost()`（`@Scheduled` 未显式设置 `zone`）
3. 幂等检查按 `source=scheduler + UTC 日窗` 判断，而不是按服务本地日期判断
4. 若当天不存在 scheduler 帖子，则写入一条 Markdown 结构化“今日摘要”

## 关键代码（已对齐当前实现）

代码位置：[DailyPostJob.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/job/DailyPostJob.java)

```java
@Component
@ConditionalOnProperty(prefix = "paperflow.daily-post", name = "enabled", havingValue = "true")
public class DailyPostJob {
  private final PostRepository posts;

  public DailyPostJob(PostRepository posts) {
    this.posts = posts;
  }

  @EventListener(ApplicationReadyEvent.class)
  public void bootstrap() {
    ensureDailyPost();
  }

  @Scheduled(cron = "0 0 9 * * *")
  public void ensureDailyPost() {
    OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
    OffsetDateTime start = now.truncatedTo(ChronoUnit.DAYS);
    OffsetDateTime end = start.plusDays(1);
    if (posts.existsBySourceAndPublishedAtBetween("scheduler", start, end)) {
      return;
    }
    PostEntity p = new PostEntity();
    p.setId("post_" + UUID.randomUUID().toString().replace("-", ""));
    p.setTitle("Daily Update " + start.toLocalDate());
    p.setContent("""
        # 今日摘要
        - 1 个值得做的小改动：把“任务”拆成可验证的最小步骤
        - 1 个值得停下来的点：任何“看起来很忙”的事情，都要问一句“产出是什么？”

        ## 今日 3 个要点
        - 先把输入变少：减少切换、减少通知、减少“顺手点开”
        - 再把输出变稳：写 10 行也算输出，关键是持续
        - 最后把系统变轻：能自动化的就不要靠记忆

        > PaperFlow 的目标不是堆功能，而是把“每天更好一点”的节奏感做出来。

        ## 给你一个 5 分钟实验
        1) 选一个你今天必须推进的任务
        2) 写下它的“最小交付”是什么
        3) 只做 5 分钟，不求完美，只求开始
        """.trim());
    p.setSource("scheduler");
    p.setPublishedAt(now);
    posts.save(p);
  }
}
```

## 关键差异（相对旧文档）

- 增加了开关：`paperflow.daily-post.enabled=true` 才启用。
- 增加了启动补偿：`ApplicationReadyEvent` 触发首轮写入检查。
- 幂等条件更准确：从“当天任意帖子”改为“当天 scheduler 帖子”。
- 占位正文已从单行占位改为结构化 Markdown 模板。
- 需要注意：定时触发时间跟随服务进程默认时区，但“当天是否已生成”的判断使用 `UTC` 日窗，这两者不是同一个时区概念。

## 与主题日更链路的关系

- `07` 是服务内保底任务，目标是“不断更”。
- `36/38/39/40` 是脚本化生产链路，目标是“可控质量 + 去重 + 可审阅”。
- 推荐线上策略：
  - 三主题日更作为主内容来源；
  - scheduler 仅在开关开启时作为兜底，不与主题链路争抢主入口。

## 当前文档结论

- 这份文档现在确实应该更新，主要原因不是机制变了很多，而是示例代码和“时区语义”已经落后于当前实现。
- 当前最准确的口径是：
  - 触发时机：服务启动补偿 + 每天默认时区 09:00 定时触发
  - 幂等边界：`source=scheduler + UTC 日窗`
  - 内容模板：结构化 Markdown 摘要，而不是单行占位文本
