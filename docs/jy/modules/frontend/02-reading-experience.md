# 前端阅读体验详解

## 1. 背景与目标

### 与前序模块的关系
本模块基于前端 SPA 架构，实现用户核心阅读体验，包括帖子列表、详情页、评论区和与后端 API 的交互。

### 为什么要做这个
- 提供类似 Notion/Medium 的清爽阅读体验
- 支持无限滚动加载帖子列表
- 支持层次化评论与回复
- 提供错误兜底与加载状态处理

### 功能目标
1. 帖子 Feed 列表与无限滚动加载
2. 帖子详情页与富文本渲染
3. 评论系统（创建、回复、点赞、用户卡片）
4. 错误状态与加载状态的优雅处理

---

## 2. 架构与流程设计

### 整体流程
```
用户访问帖子列表 → 加载初始页面 → 滚动到底部 → 加载更多 → 点击进入详情 → 渲染正文 → 浏览评论 → 发表评论或回复
```

### 关键决策点
| 问题 | 决策 | 理由 |
|------|------|------|
| 列表加载方式 | Intersection Observer + 无限滚动 | 更符合现代阅读习惯，避免分页跳转 |
| 评论结构 | 树形嵌套 + 展开/收起 | 层次清晰，便于讨论 |
| 错误处理 | 分场景展示（首屏/后续分页/局部操作） | 更好的用户体验 |
| 数据规范化 | normalizePostPaperProtocol | 兼容多种帖子数据格式 |

---

## 3. 核心代码详解

### 3.1 帖子列表页 (PostsPage.tsx)
**文件位置**：[PostsPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PostsPage.tsx)

关键实现：
```typescript
export function PostsPage() {
  const pageSize = 30;
  const [items, setItems] = useState<Post[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // 使用 Intersection Observer 实现无限滚动
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore();
        }
      },
      { rootMargin: "300px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);
}
```

| 代码 | 解释 |
|------|------|
| Intersection Observer | 监听哨兵元素进入视口，触发加载更多 |
| rootMargin | 提前 300px 开始加载，提升流畅度 |
| 去重逻辑 | 使用 Set 防止重复帖子 |

### 3.2 帖子详情页 (PostDetailPage.tsx)
**文件位置**：[PostDetailPage.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/pages/PostDetailPage.tsx)

关键组件：
- RichText：渲染 Markdown 正文
- AiMarkdown：渲染 AI 生成的 Markdown 内容
- 评论树形结构渲染

关键实现（评论合并）：
```typescript
const mergeCreatedComment = (rows: Comment[], created: Comment): Comment[] => {
  if (!created.parentCommentId) {
    return [created, ...rows]; // 根评论插在前面
  }
  // 递归查找父评论并插入
  const appendReply = (nodes: Comment[]): Comment[] => {
    return nodes.map((node) => {
      if (node.commentId === created.parentCommentId) {
        const replies = Array.isArray(node.replies) ? node.replies : [];
        return { ...node, replies: [...replies, created] };
      }
      // ... 递归处理子评论
    });
  };
};
```

### 3.3 API 数据规范化 (api.ts)
**文件位置**：[api.ts](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/data/api.ts)

```typescript
function normalizePostPaperProtocol(post: Post): Post {
  // ... 兼容多种格式的帖子数据
  // 提取 formats/highlights/defaultFormat
}
```

---

## 4. 接口契约
详见各后端服务模块文档。

---

## 5. 边界与约束
- 评论最多 5 层深度
- 评论内容最多 2000 字符
- 列表页默认每页 30 条

---

## 6. 常见问题与踩坑经验

### 6.1 无限滚动重复加载
**原因**：快速滚动导致多次触发加载事件。
**解决**：使用 loadingRef 防止并发请求。

---

## 7. 可演进方向
- 支持帖子排序与筛选
- 支持评论分页加载
- 添加帖子草稿保存

---

## 8. 小结
本模块详细介绍了前端阅读体验的实现，包括列表页无限滚动、详情页富文本渲染、评论系统、以及与后端 API 的交互。

---

## 9. 页内导航

- 所属模块：[前端模块索引](./00-index.md)
- 上一篇：[前端 SPA 整体架构详解](./01-spa-architecture.md)
- 下一篇：[前端 AI 阅读与 Pathfinder 详解](./03-ai-reading-pathfinder.md)
- 关联阅读：
  - [网关模块索引](../gateway/00-index.md)
  - [内容服务索引](../content-service/00-index.md)
  - [Python Agent 模块索引](../python-agent/00-index.md)
