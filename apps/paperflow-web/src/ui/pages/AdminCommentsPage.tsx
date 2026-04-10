import { useEffect, useMemo, useState } from "react";
import { apiAdminListComments, apiAdminListUsers, apiAdminUpdateCommentStatus, apiAdminUpdatePostCommentModeration, apiListPosts } from "../data/api";
import type { AdminUser, Comment, Post } from "../data/types";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { Spinner } from "../components/Spinner";
import { useAsyncData } from "../hooks/useAsyncData";
import { Page } from "../layout/Page";

export function AdminCommentsPage() {
  const auth = useAuth();
  const accessToken = auth.state.status === "authenticated" ? auth.state.accessToken : "";
  const [status, setStatus] = useState<"PENDING" | "APPROVED" | "REJECTED">("PENDING");
  const [pageNumber, setPageNumber] = useState(1);
  const pageSize = 50;
  const [actionError, setActionError] = useState<unknown | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [policyLoadingPostId, setPolicyLoadingPostId] = useState<string | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const title = useMemo(() => {
    switch (status) {
      case "PENDING":
        return "待审核";
      case "APPROVED":
        return "已通过";
      case "REJECTED":
        return "已驳回";
    }
  }, [status]);

  const { state, reload } = useAsyncData((signal) => apiAdminListComments(accessToken, status, pageNumber, pageSize, signal), [accessToken, status, pageNumber]);
  const { state: contextState, reload: reloadContext } = useAsyncData(
    async (signal) => {
      const [posts, users] = await Promise.all([
        apiListPosts(1, 200, signal),
        apiAdminListUsers(accessToken, { pageNumber: 1, pageSize: 200 }, signal)
      ]);
      return { posts: posts.items ?? [], users: users.items ?? [] };
    },
    [accessToken]
  );
  const items: Comment[] = state.data?.items ?? [];
  const pendingIds = useMemo(() => items.filter((it) => it.status === "PENDING").map((it) => it.commentId), [items]);
  const selectedPendingIds = useMemo(() => selectedIds.filter((id) => pendingIds.includes(id)), [selectedIds, pendingIds]);
  const canNextPage = items.length === pageSize;
  const postMap = useMemo(() => {
    const map = new Map<string, Post>();
    (contextState.data?.posts ?? []).forEach((p) => map.set(p.postId, p));
    return map;
  }, [contextState.data?.posts]);
  const userMap = useMemo(() => {
    const map = new Map<string, AdminUser>();
    (contextState.data?.users ?? []).forEach((u) => map.set(u.userId, u));
    return map;
  }, [contextState.data?.users]);
  useEffect(() => {
    setSelectedIds([]);
  }, [status, pageNumber, items.length]);

  const applyBatchStatus = async (nextStatus: "APPROVED" | "REJECTED") => {
    if (!selectedPendingIds.length || batchLoading) {
      return;
    }
    setActionError(null);
    setBatchLoading(true);
    try {
      for (const commentId of selectedPendingIds) {
        await apiAdminUpdateCommentStatus(accessToken, commentId, nextStatus);
      }
      setSelectedIds([]);
      reload();
    } catch (e) {
      setActionError(e);
    } finally {
      setBatchLoading(false);
    }
  };

  return (
    <Page
      title="评论管理"
      subtitle={
        <span>
          需要 ADMIN 角色；Mock 模式使用 <span className="pf-kbd">admin@example.com</span> 登录。
        </span>
      }
      actions={
        <div className="pf-row">
          <span className="pf-muted2">状态</span>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as "PENDING" | "APPROVED" | "REJECTED");
              setPageNumber(1);
            }}
            className="pf-select"
            style={{ width: 160 }}
          >
            <option value="PENDING">PENDING</option>
            <option value="APPROVED">APPROVED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
          <span className="pf-pill">{title}</span>
          <span className="pf-muted2">已选 {selectedPendingIds.length}</span>
          <Button variant="primary" onClick={() => void applyBatchStatus("APPROVED")} disabled={status !== "PENDING" || batchLoading || selectedPendingIds.length === 0}>
            批量通过
          </Button>
          <Button variant="danger" onClick={() => void applyBatchStatus("REJECTED")} disabled={status !== "PENDING" || batchLoading || selectedPendingIds.length === 0}>
            批量驳回
          </Button>
        </div>
      }
    >
      {state.status === "loading" ? <Spinner label="加载中..." /> : null}
      {state.status === "error" ? <ErrorState error={state.error} onRetry={reload} /> : null}
      {contextState.status === "loading" ? <Spinner label="加载用户与文章信息..." /> : null}
      {contextState.status === "error" ? <ErrorState error={contextState.error} title="上下文信息加载失败" onRetry={reloadContext} /> : null}
      {actionError ? <ErrorState error={actionError} title="操作失败" /> : null}

      <div className="pf-grid" style={{ gap: 10 }}>
        {items.length === 0 && state.status === "success" ? <EmptyState>暂无数据</EmptyState> : null}
        {status === "PENDING" && items.length > 0 ? (
          <div className="pf-row" style={{ justifyContent: "space-between" }}>
            <label className="pf-muted2" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={selectedPendingIds.length > 0 && selectedPendingIds.length === pendingIds.length}
                onChange={(e) => setSelectedIds(e.target.checked ? pendingIds : [])}
              />
              全选当前页待审核
            </label>
            <span className="pf-muted2">第 {pageNumber} 页</span>
          </div>
        ) : null}
        {items.map((c) => {
          const post = postMap.get(c.postId);
          const user = userMap.get(c.userId);
          const postTitle = post?.title ?? c.postId;
          const userLabel = user?.displayName ?? c.userId;
          const userEmail = user?.email ?? c.userId;
          const moderationEnabled = post?.commentModerationEnabled !== false;
          const safeStatus = c.status === "APPROVED" || c.status === "REJECTED" || c.status === "PENDING" ? c.status : "PENDING";
          return (
            <Card key={c.commentId} className="pf-admin-comment-card">
              <div className="pf-admin-comment-card__layout">
                <div className="pf-admin-comment-card__main">
                  <div className="pf-admin-comment-card__titleRow">
                    <div className="pf-admin-comment-card__title">
                      {status === "PENDING" ? (
                        <label className="pf-row" style={{ gap: 6 }}>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(c.commentId)}
                            disabled={safeStatus !== "PENDING"}
                            onChange={(e) =>
                              setSelectedIds((prev) =>
                                e.target.checked ? [...new Set([...prev, c.commentId])] : prev.filter((id) => id !== c.commentId)
                              )
                            }
                          />
                          <span>{userLabel} 在《{postTitle}》发表评论</span>
                        </label>
                      ) : (
                        `${userLabel} 在《${postTitle}》发表评论`
                      )}
                    </div>
                    <span className={["pf-pill", "pf-admin-comment-card__status", `pf-admin-comment-card__status--${safeStatus.toLowerCase()}`].join(" ")}>
                      {safeStatus}
                    </span>
                  </div>
                  <div className="pf-admin-comment-card__meta">
                    <span>{new Date(c.createdAt).toLocaleString()}</span>
                    <span>用户：{userEmail}</span>
                    <span>策略：{moderationEnabled ? "需要审核" : "发布即通过"}</span>
                    <span>ID：{c.commentId}</span>
                  </div>
                  <div className="pf-admin-comment-card__preview">{c.content}</div>
                </div>
                <div className="pf-admin-comment-card__actions">
                  <Button
                    onClick={async () => {
                      if (!post || policyLoadingPostId) return;
                      setActionError(null);
                      setPolicyLoadingPostId(post.postId);
                      try {
                        await apiAdminUpdatePostCommentModeration(accessToken, post.postId, !moderationEnabled);
                        reloadContext();
                      } catch (e) {
                        setActionError(e);
                      } finally {
                        setPolicyLoadingPostId(null);
                      }
                    }}
                    disabled={!post || policyLoadingPostId === post?.postId}
                  >
                    {moderationEnabled ? "设为免审核" : "设为需审核"}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={async () => {
                      setActionError(null);
                      setActionLoadingId(c.commentId);
                      try {
                        await apiAdminUpdateCommentStatus(accessToken, c.commentId, "APPROVED");
                        reload();
                      } catch (e) {
                        setActionError(e);
                      } finally {
                        setActionLoadingId(null);
                      }
                    }}
                    disabled={safeStatus !== "PENDING" || actionLoadingId === c.commentId}
                  >
                    通过
                  </Button>
                  <Button
                    variant="danger"
                    onClick={async () => {
                      setActionError(null);
                      setActionLoadingId(c.commentId);
                      try {
                        await apiAdminUpdateCommentStatus(accessToken, c.commentId, "REJECTED");
                        reload();
                      } catch (e) {
                        setActionError(e);
                      } finally {
                        setActionLoadingId(null);
                      }
                    }}
                    disabled={safeStatus !== "PENDING" || actionLoadingId === c.commentId}
                  >
                    驳回
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <div className="pf-row" style={{ justifyContent: "space-between", marginTop: 10 }}>
        <span className="pf-muted2">每页 {pageSize} 条</span>
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
