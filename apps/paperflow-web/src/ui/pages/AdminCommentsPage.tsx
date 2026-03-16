import { useMemo, useState } from "react";
import { apiAdminListComments, apiAdminUpdateCommentStatus } from "../data/api";
import type { Comment } from "../data/types";
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
  const [actionError, setActionError] = useState<unknown | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

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

  const { state, reload } = useAsyncData((signal) => apiAdminListComments(accessToken, status, 1, 50, signal), [accessToken, status]);
  const items: Comment[] = state.data?.items ?? [];

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
          <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="pf-select" style={{ width: 160 }}>
            <option value="PENDING">PENDING</option>
            <option value="APPROVED">APPROVED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
          <span className="pf-pill">{title}</span>
        </div>
      }
    >
      {state.status === "loading" ? <Spinner label="加载中..." /> : null}
      {state.status === "error" ? <ErrorState error={state.error} onRetry={reload} /> : null}
      {actionError ? <ErrorState error={actionError} title="操作失败" /> : null}

      <div className="pf-grid" style={{ gap: 10 }}>
        {items.length === 0 && state.status === "success" ? <EmptyState>暂无数据</EmptyState> : null}
        {items.map((c) => (
          <Card key={c.commentId}>
            <div className="pf-row pf-row--baseline" style={{ flexWrap: "wrap" }}>
              <span style={{ fontWeight: 800 }}>{c.commentId}</span>
              <span className="pf-muted2">post={c.postId}</span>
              <span className="pf-muted2">user={c.userId}</span>
              <span className="pf-muted2">{new Date(c.createdAt).toLocaleString()}</span>
              <span className="pf-muted2">status={c.status}</span>
            </div>
            <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{c.content}</div>
            <div className="pf-row" style={{ marginTop: 10 }}>
              <Button
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
                disabled={c.status !== "PENDING" || actionLoadingId === c.commentId}
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
                disabled={c.status !== "PENDING" || actionLoadingId === c.commentId}
              >
                驳回
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </Page>
  );
}
