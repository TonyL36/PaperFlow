import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { Spinner } from "../components/Spinner";
import { apiGetCommentUserCard, apiListNotifications, apiReadAllNotifications, apiReadNotification } from "../data/api";
import type { NotificationItem } from "../data/types";
import { useAsyncData } from "../hooks/useAsyncData";
import { Page } from "../layout/Page";

export function NotificationsPage() {
  const auth = useAuth();
  const accessToken = auth.state.status === "authenticated" ? auth.state.accessToken : "";
  const [pageNumber, setPageNumber] = useState(1);
  const pageSize = 30;
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown | null>(null);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const { state, reload } = useAsyncData((signal) => apiListNotifications(accessToken, pageNumber, pageSize, signal), [accessToken, pageNumber]);
  const items: NotificationItem[] = state.data?.items ?? [];
  const unreadCount = state.data?.unreadCount ?? 0;
  const canNextPage = items.length === pageSize;
  useEffect(() => {
    let cancelled = false;
    const unresolved = Array.from(new Set(items.map((it) => it.actorUserId).filter((id) => id && !nameMap[id])));
    if (!unresolved.length) return;
    Promise.all(
      unresolved.map(async (id) => {
        try {
          const card = await apiGetCommentUserCard(id);
          return [id, card.displayName] as const;
        } catch {
          return [id, id] as const;
        }
      })
    ).then((rows) => {
      if (cancelled) return;
      setNameMap((prev) => {
        const next = { ...prev };
        for (const [id, name] of rows) next[id] = name;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [items, nameMap]);

  return (
    <Page
      title="消息中心"
      subtitle={`未读 ${unreadCount} 条`}
      actions={
        <Button
          onClick={async () => {
            if (!accessToken || actionLoadingId) return;
            setActionError(null);
            setActionLoadingId("all");
            try {
              await apiReadAllNotifications(accessToken);
              reload();
            } catch (e) {
              setActionError(e);
            } finally {
              setActionLoadingId(null);
            }
          }}
          disabled={!accessToken || unreadCount === 0 || actionLoadingId !== null}
        >
          全部标记已读
        </Button>
      }
    >
      {state.status === "loading" ? <Spinner label="加载中..." /> : null}
      {state.status === "error" ? <ErrorState error={state.error} onRetry={reload} /> : null}
      {actionError ? <ErrorState error={actionError} title="操作失败" /> : null}
      {state.status === "success" && items.length === 0 ? <EmptyState>暂无消息</EmptyState> : null}
      <div className="pf-grid" style={{ gap: 10 }}>
        {items.map((n) => {
          const unread = !n.readAt;
          return (
            <Card key={n.notificationId} className="pf-notification-card">
              <div className="pf-row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div className="pf-row" style={{ gap: 8, alignItems: "center" }}>
                    <strong>{n.title}</strong>
                    {unread ? <span className="pf-pill">未读</span> : <span className="pf-muted2">已读</span>}
                  </div>
                  <div className="pf-muted2" style={{ marginTop: 4 }}>{new Date(n.createdAt).toLocaleString()}</div>
                  <div style={{ marginTop: 8 }}>
                    <span style={{ fontWeight: 600 }}>{nameMap[n.actorUserId] ?? n.actorUserId}</span>
                    <span>：{n.content}</span>
                  </div>
                </div>
                <div className="pf-row" style={{ gap: 8 }}>
                  <Link to={`/posts/${n.postId}#comment-${n.targetCommentId}`} className="pf-link-btn">
                    查看上下文
                  </Link>
                  <Button
                    onClick={async () => {
                      if (!accessToken || !unread || actionLoadingId) return;
                      setActionError(null);
                      setActionLoadingId(n.notificationId);
                      try {
                        await apiReadNotification(accessToken, n.notificationId);
                        reload();
                      } catch (e) {
                        setActionError(e);
                      } finally {
                        setActionLoadingId(null);
                      }
                    }}
                    disabled={!unread || actionLoadingId !== null}
                  >
                    标记已读
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
