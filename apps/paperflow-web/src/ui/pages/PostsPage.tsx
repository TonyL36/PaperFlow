import { Link } from "react-router-dom";
import { apiListPosts } from "../data/api";
import { Card } from "../components/Card";
import { ErrorState } from "../components/ErrorState";
import { Spinner } from "../components/Spinner";
import { useAsyncData } from "../hooks/useAsyncData";
import { Page } from "../layout/Page";
import { excerpt, formatDateTime, sourceMeta } from "../utils/format";

export function PostsPage() {
  const { state, reload } = useAsyncData((signal) => apiListPosts(1, 30, signal), []);
  const items = state.data?.items ?? [];

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
      {state.status === "loading" ? <Spinner label="加载中..." /> : null}
      {state.status === "error" ? (
        <ErrorState error={state.error} hint="如果你还没启动后端，建议使用 Mock 模式启动。" onRetry={reload} />
      ) : null}
      <div className="pf-postlist">
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
      </div>
    </Page>
  );
}
