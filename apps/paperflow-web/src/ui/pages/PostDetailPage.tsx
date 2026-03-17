import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiCreateComment, apiFavoritePost, apiGetPost, apiListComments, apiUnfavoritePost } from "../data/api";
import type { Comment, Post } from "../data/types";
import { useAuth } from "../auth/AuthContext";
import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { RichText } from "../components/RichText";
import { Spinner } from "../components/Spinner";
import { useAsyncData } from "../hooks/useAsyncData";
import { Page } from "../layout/Page";
import { formatDateTime, readingTimeMinutes, sourceMeta } from "../utils/format";

type DetailData = { post: Post | null; comments: Comment[] };

export function PostDetailPage() {
  const { postId } = useParams();
  const auth = useAuth();
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown | null>(null);

  const pid = useMemo(() => (postId ? decodeURIComponent(postId) : ""), [postId]);

  const { state, reload } = useAsyncData<DetailData>(
    async (signal) => {
      if (!pid) return { post: null, comments: [] };
      const [p, c] = await Promise.all([apiGetPost(pid, signal), apiListComments(pid, 1, 50, signal)]);
      return { post: p, comments: c.items };
    },
    [pid]
  );

  if (!pid) {
    return (
      <Page title="帖子详情" subtitle="缺少 postId。">
        <Card>
          <div>请从帖子列表进入详情页。</div>
        </Card>
      </Page>
    );
  }

  const post = state.data?.post ?? null;
  const comments = state.data?.comments ?? [];
  const canFavorite = auth.state.status === "authenticated" && !!post;
  const favorited = post?.favorited === true;

  return (
    <Page
      title="帖子详情"
      subtitle={
        <span>
          <Link to="/posts">← 返回列表</Link>
        </span>
      }
    >
      {state.status === "loading" ? <Spinner label="加载中..." /> : null}
      {state.status === "error" ? <ErrorState error={state.error} onRetry={reload} /> : null}

      {post ? (
        <Card>
          <div className="pf-article">
            <div className="pf-article__cover" />
            <div className="pf-article__icon">{sourceMeta(post.source).icon}</div>
            <h1 className="pf-article__title">{post.title}</h1>
            <div className="pf-meta" style={{ marginTop: 10 }}>
              <span className="pf-pill">{sourceMeta(post.source).label}</span>
              <span className="pf-meta__dot" />
              <span>{formatDateTime(post.publishedAt)}</span>
              <span className="pf-meta__dot" />
              <span>{readingTimeMinutes(post.content)} min read</span>
              {post.lastViewedAt ? (
                <>
                  <span className="pf-meta__dot" />
                  <span className="pf-muted2">last viewed {formatDateTime(post.lastViewedAt)}</span>
                </>
              ) : null}
            </div>
            {auth.state.status === "authenticated" ? (
              <div className="pf-row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
                <Button
                  onClick={async () => {
                    if (auth.state.status !== "authenticated" || !post) return;
                    try {
                      if (favorited) {
                        await apiUnfavoritePost(auth.state.accessToken, post.postId);
                      } else {
                        await apiFavoritePost(auth.state.accessToken, post.postId);
                      }
                      reload();
                    } catch (e) {
                      setSubmitError(e);
                    }
                  }}
                  disabled={!canFavorite}
                >
                  {favorited ? "取消收藏" : "收藏"}
                </Button>
              </div>
            ) : (
              <div className="pf-row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
                <span className="pf-muted2">登录后可收藏与记录足迹</span>
              </div>
            )}
            <RichText text={post.content} />
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="pf-row pf-row--baseline" style={{ justifyContent: "space-between" }}>
          <h3>评论</h3>
          <div className="pf-muted2">展示：APPROVED；创建：PENDING（需管理员审核）</div>
        </div>

        <div className="pf-grid" style={{ marginTop: 12 }}>
          {comments.length === 0 ? <EmptyState>暂无评论</EmptyState> : null}
          {comments.map((c) => (
            <div key={c.commentId} style={{ paddingTop: 10, borderTop: "1px solid rgba(55, 53, 47, 0.08)" }}>
              <div className="pf-row pf-row--baseline" style={{ flexWrap: "wrap" }}>
                <span className="pf-muted2">user={c.userId}</span>
                <span className="pf-muted2">{new Date(c.createdAt).toLocaleString()}</span>
                <span className="pf-muted2">status={c.status}</span>
              </div>
              <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{c.content}</div>
            </div>
          ))}
        </div>

        <div className="pf-divider" style={{ marginTop: 16, paddingTop: 12 }}>
          <div className="pf-row pf-row--baseline" style={{ justifyContent: "space-between" }}>
            <h3>发表评论</h3>
            {auth.state.status !== "authenticated" ? <span className="pf-muted2">需要登录后才能发表评论</span> : null}
          </div>

          {auth.state.status !== "authenticated" ? (
            <Alert tone="warning" title="需要登录">
              <Link to="/login">去登录</Link>
            </Alert>
          ) : (
            <div className="pf-grid" style={{ gap: 10, marginTop: 10 }}>
              {submitError ? <ErrorState error={submitError} title="提交失败" /> : null}
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                rows={4}
                className="pf-textarea"
                placeholder="写下你的评论…"
              />
              <div className="pf-row" style={{ justifyContent: "flex-end" }}>
                <Button
                  variant="primary"
                  onClick={async () => {
                    if (auth.state.status !== "authenticated") return;
                    const content = commentText.trim();
                    if (!content) return;
                    setSubmitting(true);
                    setSubmitError(null);
                    try {
                      await apiCreateComment(auth.state.accessToken, pid, content);
                      setCommentText("");
                      reload();
                    } catch (e) {
                      setSubmitError(e);
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  disabled={submitting || !commentText.trim()}
                >
                  {submitting ? "提交中..." : "提交（进入待审核）"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </Page>
  );
}
