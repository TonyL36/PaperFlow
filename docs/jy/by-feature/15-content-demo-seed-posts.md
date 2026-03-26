# 15 内容服务：演示 Seed 帖子 + 每日帖子内容升级（更像真实可读内容）

本章解决一个很实际的问题：如果你把 PaperFlow 当成“给用户看的站”，那帖子内容与启动后的数据可用性，必须像样。

这里把内容服务的两条策略拆开讲清楚：

- 演示 Seed：启动即生成多篇“可读”的演示帖子（用于 Demo/截图/验收）
- 每日帖子：每天保证至少有 1 篇当天更新（用于形成“连续更新”的心智）

## 功能目标与边界

目标：

- 服务启动后“立刻有内容可看”，不需要你先手动造数据
- 正文内容更接近真实阅读：有标题/列表/引用/步骤，而不是一句占位
- 保持边界：演示数据不应污染生产数据库

边界：

- 这里的 Seed 仅用于演示环境；生产环境建议通过真实内容生产链路落库（或通过受控后台导入）
- 本章不讨论复杂的富文本安全与渲染（只提供块级文本结构）

## 端到端行为

### 15.1 演示 Seed（DemoSeedPostsJob）

1) 内容服务启动完成
2) 若发现当前使用的是“内存 H2”（`jdbc:h2:mem:`）
3) 且未检测到演示 seed 已执行（`post_demo_001` 不存在）
4) 则批量插入多篇演示帖子（source=`agent-demo`）
5) 前端通过 `GET /api/v1/posts` 立刻能看到多篇内容

### 15.2 每日帖子（DailyPostJob）

1) 内容服务启动完成时，会先触发一次 `ensureDailyPost()`（保证“启动就有当天帖子”）
2) 每天固定时间（cron）再触发一次，确保跨天仍有当日内容
3) 若当天已有帖子，则跳过（避免重复生成）

## 关键代码原文 + 解读

### 15.3 演示 Seed：DemoSeedPostsJob

代码位置：[DemoSeedPostsJob.java](file:///f:/Gitee/PaperFlow/paperflow/backend/services/content-service/src/main/java/com/paperflow/content/job/DemoSeedPostsJob.java)

核心逻辑（节选）：

```java
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
      post("post_demo_001", "...", "...", "agent-demo", now.minusDays(4)),
      post("post_demo_002", "...", "...", "agent-demo", now.minusDays(3)),
      post("post_demo_003", "...", "...", "agent-demo", now.minusDays(2)),
      post("post_demo_004", "...", "...", "agent-demo", now.minusDays(1))
  );
  posts.saveAll(seed);
}
```

逐段解释：

- “仅对内存 H2 生效”：
  - `url.contains("jdbc:h2:mem:")` 是一个非常硬的边界
  - 含义：你切到 PostgreSQL（docker/生产）时不会触发 seed，避免污染真实库
- “幂等”：
  - `posts.existsById("post_demo_001")` 作为“seed 已执行”的哨兵
  - 你重启服务不会重复插入
- “为什么发布时间用 now.minusDays(...)”：
  - 让列表页看起来像一个连续的 feed，而不是所有帖子都在同一秒生成

### 15.4 每日帖子：DailyPostJob（内容升级）

代码位置：[DailyPostJob.java](file:///f:/Gitee/PaperFlow/paperflow/backend/services/content-service/src/main/java/com/paperflow/content/job/DailyPostJob.java)

关键变化点：把原本的占位字符串升级成可读的“块级文本结构”：

```java
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
```

解释：

- 这段内容并不追求“写得多”，但追求“读起来像一篇东西”
- 结构上刻意包含：
  - `#`/`##` 标题（用于块级渲染）
  - `-` 列表
  - `>` 引用块
  - `1)` 步骤（作为正文的一部分）

### 15.5 为什么默认 datasource 会触发演示 Seed

内容服务默认使用内存 H2（用于本地开发与测试），因此会触发 seed：

代码位置：[application.yml](file:///f:/Gitee/PaperFlow/paperflow/backend/services/content-service/src/main/resources/application.yml#L8-L21)

```yaml
spring:
  datasource:
    url: ${CONTENT_DB_URL:jdbc:h2:mem:contentdb;MODE=PostgreSQL;DB_CLOSE_DELAY=-1}
```

解释：

- 默认（未设置 `CONTENT_DB_URL`）就是 `jdbc:h2:mem:...`
- 当你切到 docker/postgres（设置 `CONTENT_DB_URL`）后，seed 会自动停止

## 常见坑与排查

- 启动后没有演示帖子
  - 排查：内容服务是否仍是 `jdbc:h2:mem:`（看启动日志或打印配置）
  - 排查：是否已经存在 `post_demo_001`（seed 幂等会跳过）
- 只看到 Daily Update，看不到 demo_001~004
  - 排查：是否请求的是网关 `3151`，并且网关路由到 content-service 正常
  - 排查：分页 size 是否太小

## 演进方向

- 把 seed 从“启动自动注入”改为“显式 admin 操作/脚本触发”，更贴近生产治理
- 把正文从“块级文本约定”升级为“结构化 blocks”（后端存 JSON，前端严格渲染）

## API 文档如何更新

本章涉及的变化不一定新增 API，但建议在演示闭环时一起检查 content-service 的生成文档：

- `docs/generated/content-service-api.md`

生成方式：在仓库根目录执行 `mvn verify`（Windows 可用脚本包装），注意生成时不要占用正在运行的 jar 文件（否则 repackage 可能无法重命名）。

