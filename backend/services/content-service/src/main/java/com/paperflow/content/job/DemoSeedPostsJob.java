package com.paperflow.content.job;

import com.paperflow.content.domain.PostEntity;
import com.paperflow.content.repo.PostRepository;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
public class DemoSeedPostsJob {
  private final Environment env;
  private final PostRepository posts;

  public DemoSeedPostsJob(Environment env, PostRepository posts) {
    this.env = env;
    this.posts = posts;
  }

  @EventListener(ApplicationReadyEvent.class)
  public void seed() {
    String url = env.getProperty("spring.datasource.url", "");
    boolean isInMemoryH2 = url != null && url.contains("jdbc:h2:mem:");
    if (!isInMemoryH2) {
      return;
    }
    if (posts.existsById("post_demo_001")) {
      return;
    }

    OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
    List<PostEntity> seed = List.of(
        post("post_demo_001", "PaperFlow 演示：为什么要有网关", """
            # 一句话
            网关让前端只需要一个入口，同时把鉴权、限流、错误归一化都集中到一处。

            ## 你会立刻感觉到的好处
            - 前端只打 `/api/*`，不用记每个服务的端口
            - 错误都有统一的 `requestId`，定位更快
            - 公开接口与登录接口可以统一豁免策略

            ```text
            SPA -> Gateway -> (user-service / content-service)
            ```
            """, "agent-demo", now.minusDays(4)),
        post("post_demo_002", "演示：评论为什么默认 PENDING", """
            # 背景
            把评论发布拆成两步：创建（PENDING）与公开（APPROVED）。

            ## 这样做解决了什么
            - 避免公开区出现垃圾内容
            - 管理端可审阅并留痕
            - 用户侧心智稳定：发表评论≠立即公开

            > 如果想更“实时”，可以为可信用户提供更宽松策略，但不建议默认放开。
            """, "agent-demo", now.minusDays(3)),
        post("post_demo_003", "Notion 风格不是皮肤：是阅读体验", """
            # 重点
            “像 Notion”首先是排版与信息层级，其次才是组件样式。

            ## 我们优先做了什么
            - 更清晰的标题/摘要/元信息
            - 正文块级渲染：标题、列表、引用、代码块
            - 列表页减少噪音：不把 API 路径当成用户文案
            """, "agent-demo", now.minusDays(2)),
        post("post_demo_004", "小实验：5 分钟把一个任务推进", """
            # 做法
            1) 写下你今天必须推进的一件事
            2) 写下“最小交付”
            3) 只做 5 分钟

            ## 你要观察的是
            - 卡点在哪里
            - 下一个动作是什么
            - 要不要拆得更小
            """, "agent-demo", now.minusDays(1))
    );
    posts.saveAll(seed);
  }

  private PostEntity post(String id, String title, String content, String source, OffsetDateTime publishedAt) {
    PostEntity p = new PostEntity();
    p.setId(id);
    p.setTitle(title);
    p.setContent(content.trim());
    p.setSource(source);
    p.setPublishedAt(publishedAt);
    return p;
  }
}
