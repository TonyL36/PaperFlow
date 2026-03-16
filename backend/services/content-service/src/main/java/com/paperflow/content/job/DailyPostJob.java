package com.paperflow.content.job;

import com.paperflow.content.domain.PostEntity;
import com.paperflow.content.repo.PostRepository;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
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
    if (posts.existsByPublishedAtBetween(start, end)) {
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
