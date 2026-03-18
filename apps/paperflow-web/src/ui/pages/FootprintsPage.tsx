import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { Spinner } from "../components/Spinner";
import { apiListFootprints } from "../data/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { Page } from "../layout/Page";
import { excerpt, formatDateTime, sourceMeta } from "../utils/format";

export function FootprintsPage() {
  const auth = useAuth();
  if (auth.state.status !== "authenticated") {
    return <Navigate to="/login" replace />;
  }
  const { state, reload } = useAsyncData((signal) => apiListFootprints(1, 50, auth.state.accessToken, signal), [auth.state.accessToken]);
  const items = state.data?.items ?? [];

  return (
    <Page title="足迹" subtitle="最近浏览过的帖子。" actions={null}>
      {state.status === "loading" ? <Spinner label="加载中..." /> : null}
      {state.status === "error" ? <ErrorState error={state.error} onRetry={reload} /> : null}
      <div className="pf-postlist">
        {items.length === 0 && state.status === "success" ? <EmptyState>暂无浏览记录</EmptyState> : null}
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

