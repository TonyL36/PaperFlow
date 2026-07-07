# 每日帖子保底任务详解

## 1. 背景与目标

### 与前序模块的关系

DailyPostJob 是 content-service 内部的定时任务，不依赖其他外部服务，是一个独立的保底机制。

### 为什么要做这个

- 保证内容不“断更”
- 作为三主题日更脚本（medical/cybersecurity/bigdata）的兜底
- 服务启动时可以自动补偿

### 功能目标

1. 服务启动时检查并确保当天有 scheduler 帖子
2. 每天默认时区 09:00 再次检查
3. 按 source=scheduler + UTC 日窗保证幂等

---

## 2. 架构与流程设计

### 整体流程

```
触发时机：
1. 服务启动 → ApplicationReadyEvent → bootstrap() → ensureDailyPost()
2. 每天默认时区 09:00 → @Scheduled → ensureDailyPost()

执行流程：
a. 获取当前 UTC 时间
b. 截取当天 UTC 日窗（start ~ end）
c. 查询当天是否已存在 source=scheduler 的帖子
d. 若不存在则创建一条
```

### 关键决策点

| 问题 | 决策 | 理由 |
|------|------|------|
| 触发时机 | 启动补偿 + 每天 09:00 定时 | 防止服务重启断更 |
| 幂等边界 | source=scheduler + UTC 日窗 | 避免重复创建 |
| 内容来源 | 硬编码 Markdown 模板 | 保底内容，简单稳定 |
| 时区选择 | 幂等用 UTC，触发用默认时区 | 幂等条件要唯一，触发时间跟随部署环境 |
| 开关控制 | @ConditionalOnProperty | 可配置是否启用 |

---

## 3. 核心代码详解

### 3.1 DailyPostJob 完整代码

**文件位置：** [DailyPostJob.java](file:///F:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/job/DailyPostJob.java#L15-L61)

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
        ...
        """.trim());
    p.setSource("scheduler");
    p.setPublishedAt(now);
    posts.save(p);
  }
}
```

### 3.2 核心代码逐段解析

#### 3.2.1 开关控制

```java
@ConditionalOnProperty(prefix = "paperflow.daily-post", name = "enabled", havingValue = "true")
```

| 代码 | 解释 |
|------|------|
| @ConditionalOnProperty | 只有配置了 paperflow.daily-post.enabled=true 才会加载这个 Bean |
| 线上策略 | 三主题日更作为主内容，scheduler 作为兜底 |

#### 3.2.2 启动补偿

```java
@EventListener(ApplicationReadyEvent.class)
public void bootstrap() {
  ensureDailyPost();
}
```

| 代码 | 解释 |
|------|------|
| @EventListener(ApplicationReadyEvent.class) | Spring Boot 应用完全启动后执行一次 |

#### 3.2.3 定时触发

```java
@Scheduled(cron = "0 0 9 * * *")
```

| 代码 | 解释 |
|------|------|
| cron="0 0 9 * * *" | 每天 09:00 执行，跟随服务进程默认时区 |

#### 3.2.4 幂等检查

```java
OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
OffsetDateTime start = now.truncatedTo(ChronoUnit.DAYS);
OffsetDateTime end = start.plusDays(1);
if (posts.existsBySourceAndPublishedAtBetween("scheduler", start, end)) {
  return;
}
```

| 代码 | 解释 |
|------|------|
| ZoneOffset.UTC | 幂等检查用 UTC，避免时区差异导致重复创建 |
| existsBySourceAndPublishedAtBetween | 只检查 source=scheduler 的帖子，不影响其他来源 |

---

## 4. 接口契约

无外部 API，纯内部 Job。

---

## 5. 边界与约束

### 5.1 当前实现的边界

- 内容是硬编码的 Markdown 模板
- 不与三主题日更脚本（medical/cybersecurity/bigdata）冲突
- 只保证当天有一条 source=scheduler 的帖子

---

## 6. 常见问题与踩坑经验

### 6.1 为什么幂等用 UTC，触发用默认时区？

答：
- 幂等条件必须在任何部署环境下都唯一，所以用 UTC
- 触发时间希望跟随部署环境的日常作息，所以用默认时区

### 6.2 什么时候需要开启这个 Job？

答：
- 开发环境或临时演示环境：可以开启
- 线上正式环境：如果有三主题日更脚本，建议关闭或作为兜底

---

## 7. 可演进方向

### 7.1 动态内容模板

支持从配置或外部接口获取保底内容，而不是硬编码。

### 7.2 更细粒度的监控

增加日志、指标，记录是否成功创建保底帖子。

---

## 8. 小结

每日帖子保底任务模块详细介绍了：
1. 触发时机（启动补偿 + 每天 09:00 定时）
2. 幂等检查（source=scheduler + UTC 日窗）
3. 开关控制

接下来我们看帖子查询和点赞 API！

---

## 9. 页内导航

- 所属模块：[内容服务模块索引](./00-index.md)
- 上一篇：当前已是本模块第一篇，建议先回看 [模块索引](./00-index.md)
- 下一篇：[帖子查询与点赞 API 详解](./02-posts-api.md)
- 关联阅读：
  - [用户服务索引](../user-service/00-index.md)
  - [前端模块索引](../frontend/00-index.md)
  - [Python Agent 模块索引](../python-agent/00-index.md)
