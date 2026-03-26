import { useMemo, useState } from "react";
import { apiAdminUpdatePostCommentModeration, apiListPosts } from "../data/api";
import type { Post } from "../data/types";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { Spinner } from "../components/Spinner";
import { useAsyncData } from "../hooks/useAsyncData";
import { Page } from "../layout/Page";
import { formatDateTime } from "../utils/format";

export function AdminPostModerationPage() {
  const auth = useAuth();
  const accessToken = auth.state.status === "authenticated" ? auth.state.accessToken : "";
  const [keyword, setKeyword] = useState("");
  const [source, setSource] = useState("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const pageSize = 50;
  const [actionError, setActionError] = useState<unknown | null>(null);
  const [actionLoadingPostId, setActionLoadingPostId] = useState<string | null>(null);

  const { state, reload } = useAsyncData((signal) => apiListPosts(pageNumber, pageSize, signal), [pageNumber]);
  const posts: Post[] = state.data?.items ?? [];
  const sourceOptions = useMemo(() => {
    const set = new Set(posts.map((p) => p.source).filter(Boolean));
    return ["ALL", ...Array.from(set)];
  }, [posts]);
  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return posts.filter((p) => {
      if (q && !p.title.toLowerCase().includes(q) && !p.postId.toLowerCase().includes(q)) {
        return false;
      }
      if (source !== "ALL" && p.source !== source) {
        return false;
      }
      const time = new Date(p.publishedAt).getTime();
      if (fromDate) {
        const from = new Date(`${fromDate}T00:00:00`).getTime();
        if (time < from) {
          return false;
        }
      }
      if (toDate) {
        const to = new Date(`${toDate}T23:59:59`).getTime();
        if (time > to) {
          return false;
        }
      }
      return true;
    });
  }, [posts, keyword, source, fromDate, toDate]);
  const canNextPage = posts.length === pageSize;

  return (
    <Page
      title="文章审核策略"
      subtitle="按文章控制评论是否需要审核。关闭后，新评论将直接发布。"
      actions={
        <div className="pf-row" style={{ flexWrap: "wrap", gap: 8 }}>
          <span className="pf-muted2">筛选</span>
          <input
            className="pf-input"
            style={{ width: 220 }}
            placeholder="标题 / postId"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <select className="pf-select" style={{ width: 140 }} value={source} onChange={(e) => setSource(e.target.value)}>
            {sourceOptions.map((it) => (
              <option key={it} value={it}>
                {it === "ALL" ? "全部来源" : it}
              </option>
            ))}
          </select>
          <input className="pf-input" style={{ width: 145 }} type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <input className="pf-input" style={{ width: 145 }} type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
      }
    >
      {state.status === "loading" ? <Spinner label="加载文章中..." /> : null}
      {state.status === "error" ? <ErrorState error={state.error} onRetry={reload} /> : null}
      {actionError ? <ErrorState error={actionError} title="更新失败" /> : null}

      <div className="pf-grid" style={{ gap: 10 }}>
        {filtered.length === 0 && state.status === "success" ? <EmptyState>暂无匹配文章</EmptyState> : null}
        {filtered.map((post) => {
          const moderationEnabled = post.commentModerationEnabled !== false;
          return (
            <Card key={post.postId} className="pf-admin-post-policy-card">
              <div className="pf-admin-post-policy-card__main">
                <div className="pf-admin-post-policy-card__title">{post.title}</div>
                <div className="pf-admin-post-policy-card__meta">
                  <span>ID：{post.postId}</span>
                  <span>来源：{post.source}</span>
                  <span>发布时间：{formatDateTime(post.publishedAt)}</span>
                </div>
              </div>
              <div className="pf-admin-post-policy-card__action">
                <span className={["pf-pill", moderationEnabled ? "pf-admin-comment-card__status--pending" : "pf-admin-comment-card__status--approved"].join(" ")}>
                  {moderationEnabled ? "需要审核" : "直接发布"}
                </span>
                <Button
                  variant={moderationEnabled ? "danger" : "primary"}
                  onClick={async () => {
                    setActionError(null);
                    setActionLoadingPostId(post.postId);
                    try {
                      await apiAdminUpdatePostCommentModeration(accessToken, post.postId, !moderationEnabled);
                      reload();
                    } catch (e) {
                      setActionError(e);
                    } finally {
                      setActionLoadingPostId(null);
                    }
                  }}
                  disabled={!accessToken || actionLoadingPostId === post.postId}
                >
                  {moderationEnabled ? "改为直接发布" : "改为需要审核"}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
      <div className="pf-row" style={{ justifyContent: "space-between", marginTop: 10 }}>
        <span className="pf-muted2">第 {pageNumber} 页（每页 {pageSize} 条）</span>
        <div className="pf-row" style={{ gap: 8 }}>
          <Button onClick={() => setPageNumber((p) => Math.max(1, p - 1))} disabled={pageNumber <= 1 || state.status === "loading"}>
            上一页
          </Button>
          <Button onClick={() => setPageNumber((p) => p + 1)} disabled={!canNextPage || state.status === "loading"}>
            下一页
          </Button>
        </div>
      </div>
    </Page>
  );
}
