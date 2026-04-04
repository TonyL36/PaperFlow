import { Link } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiListPosts } from "../data/api";
import type { Post } from "../data/types";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { Spinner } from "../components/Spinner";
import { Page } from "../layout/Page";
import { excerpt, formatDateTime, sourceMeta } from "../utils/format";

export function PostsPage() {
  const pageSize = 30;
  const [items, setItems] = useState<Post[]>([]);
  const [pageNumber, setPageNumber] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  const loadPage = useCallback(
    async (nextPage: number, replace: boolean) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setIsLoading(true);
      setError(null);
      try {
        const data = await apiListPosts(nextPage, pageSize);
        const incoming = data.items ?? [];
        setItems((prev) => {
          if (replace) return incoming;
          const seen = new Set(prev.map((it) => it.postId));
          return prev.concat(incoming.filter((it) => !seen.has(it.postId)));
        });
        setPageNumber(nextPage);
        const totalPages = data.page?.totalPages;
        if (typeof totalPages === "number" && totalPages > 0) {
          setHasMore(nextPage < totalPages);
        } else {
          setHasMore(incoming.length === pageSize);
        }
      } catch (e) {
        setError(e);
      } finally {
        loadingRef.current = false;
        setIsLoading(false);
      }
    },
    [pageSize]
  );

  useEffect(() => {
    void loadPage(1, true);
  }, [loadPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingRef.current) return;
    void loadPage(pageNumber + 1, false);
  }, [hasMore, loadPage, pageNumber]);

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

  const reload = useCallback(() => {
    setItems([]);
    setPageNumber(0);
    setHasMore(true);
    void loadPage(1, true);
  }, [loadPage]);

  const isFirstLoading = useMemo(() => isLoading && items.length === 0, [isLoading, items.length]);

  return (
    <Page
      title="Daily Feed"
      subtitle="每天生成一条更新；也支持接收演示推送数据。"
      actions={null}
    >
      <div className="pf-hero">
        <div className="pf-hero__title">PaperFlow</div>
        <div className="pf-hero__sub">更像 Notion/Medium 的阅读体验：清爽排版、块级正文、可审阅评论。</div>
      </div>
      {isFirstLoading ? <Spinner label="加载中..." /> : null}
      {error && items.length === 0 ? (
        <ErrorState error={error} hint="如果你还没启动后端，建议使用 Mock 模式启动。" onRetry={reload} />
      ) : null}
      <div className="pf-postlist">
        {!isFirstLoading && !error && items.length === 0 ? <EmptyState title="暂无文章">稍后再来看看，或先导入测试文章。</EmptyState> : null}
        {items.map((p) => (
          <div key={p.postId} className="pf-postitem">
            <div className="pf-row pf-row--baseline" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
              <div className="pf-row pf-row--baseline" style={{ gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 18 }}>{sourceMeta(p.source).icon}</span>
                <Link to={`/posts/${encodeURIComponent(p.postId)}`} className="pf-titlelink">
                  {p.title}
                </Link>
              </div>
              <div className="pf-meta">
                <span className="pf-pill">{sourceMeta(p.source).label}</span>
                <span className="pf-meta__dot" />
                <span>{formatDateTime(p.publishedAt)}</span>
              </div>
            </div>
            <div className="pf-excerpt">{excerpt(p.content, 180)}</div>
          </div>
        ))}
        {error && items.length > 0 ? (
          <ErrorState error={error} hint="后续分页加载失败，可点击重试继续加载。" onRetry={loadMore} />
        ) : null}
        {!isFirstLoading && hasMore ? (
          <div ref={sentinelRef} className="pf-center" style={{ padding: "16px 0" }}>
            {isLoading ? <Spinner label="加载更多中..." /> : <Button onClick={loadMore}>加载更多</Button>}
          </div>
        ) : null}
        {!isFirstLoading && !hasMore && items.length > 0 ? <div className="pf-center pf-muted" style={{ padding: "8px 0 16px" }}>已经到底啦</div> : null}
      </div>
    </Page>
  );
}
