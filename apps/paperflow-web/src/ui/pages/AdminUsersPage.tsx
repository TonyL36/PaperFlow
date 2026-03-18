import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { Spinner } from "../components/Spinner";
import { apiAdminListUsers, apiAdminRevokeUserTokens, apiAdminUpdateUser } from "../data/api";
import type { AdminUser } from "../data/types";
import { useAsyncData } from "../hooks/useAsyncData";
import { Page } from "../layout/Page";

function hasRole(u: AdminUser, role: string): boolean {
  return (u.roles ?? []).some((r) => String(r).toUpperCase() === role.toUpperCase());
}

function nextRoles(u: AdminUser, role: string, enabled: boolean): string[] {
  const set = new Set((u.roles ?? []).map((r) => String(r).toUpperCase()).filter(Boolean));
  if (enabled) set.add(role.toUpperCase());
  else set.delete(role.toUpperCase());
  if (!set.has("USER")) set.add("USER");
  return Array.from(set);
}

export function AdminUsersPage() {
  const auth = useAuth();
  const accessToken = auth.state.status === "authenticated" ? auth.state.accessToken : "";
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const [actionError, setActionError] = useState<unknown | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const query = useMemo(() => ({ q: q.trim() || undefined, status: status || undefined, pageNumber: 1, pageSize: 50 }), [q, status]);
  const { state, reload } = useAsyncData((signal) => apiAdminListUsers(accessToken, query, signal), [accessToken, query]);
  const items: AdminUser[] = state.data?.items ?? [];

  return (
    <Page
      title="用户管理"
      subtitle="需要 ADMIN 角色；支持禁用账号、授予/移除 ADMIN、吊销 refresh token。"
      actions={
        <div className="pf-row" style={{ flexWrap: "wrap" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索 email / displayName"
            className="pf-input"
            style={{ width: 260 }}
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="pf-select" style={{ width: 160 }}>
            <option value="">全部状态</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="DISABLED">DISABLED</option>
          </select>
        </div>
      }
    >
      {state.status === "loading" ? <Spinner label="加载中..." /> : null}
      {state.status === "error" ? <ErrorState error={state.error} onRetry={reload} /> : null}
      {actionError ? <ErrorState error={actionError} title="操作失败" /> : null}

      <div className="pf-grid" style={{ gap: 10 }}>
        {items.length === 0 && state.status === "success" ? <EmptyState>暂无数据</EmptyState> : null}
        {items.map((u) => {
          const isDisabled = String(u.status).toUpperCase() === "DISABLED";
          const isAdmin = hasRole(u, "ADMIN");
          return (
            <Card key={u.userId}>
              <div className="pf-row pf-row--baseline" style={{ flexWrap: "wrap" }}>
                <span style={{ fontWeight: 800 }}>{u.displayName}</span>
                <span className="pf-muted2">{u.email}</span>
                <span className="pf-pill">{u.status}</span>
                <span className="pf-muted2">roles={u.roles.join(",")}</span>
              </div>
              <div className="pf-row" style={{ marginTop: 10, flexWrap: "wrap" }}>
                <Button
                  onClick={async () => {
                    setActionError(null);
                    setActionLoadingId(u.userId);
                    try {
                      await apiAdminUpdateUser(accessToken, u.userId, { status: isDisabled ? "ACTIVE" : "DISABLED" });
                      reload();
                    } catch (e) {
                      setActionError(e);
                    } finally {
                      setActionLoadingId(null);
                    }
                  }}
                  variant={isDisabled ? "primary" : "danger"}
                  disabled={actionLoadingId === u.userId}
                >
                  {isDisabled ? "启用" : "禁用"}
                </Button>
                <Button
                  onClick={async () => {
                    setActionError(null);
                    setActionLoadingId(u.userId);
                    try {
                      await apiAdminUpdateUser(accessToken, u.userId, { roles: nextRoles(u, "ADMIN", !isAdmin) });
                      reload();
                    } catch (e) {
                      setActionError(e);
                    } finally {
                      setActionLoadingId(null);
                    }
                  }}
                  disabled={actionLoadingId === u.userId}
                >
                  {isAdmin ? "移除 ADMIN" : "授予 ADMIN"}
                </Button>
                <Button
                  onClick={async () => {
                    setActionError(null);
                    setActionLoadingId(u.userId);
                    try {
                      await apiAdminRevokeUserTokens(accessToken, u.userId);
                      reload();
                    } catch (e) {
                      setActionError(e);
                    } finally {
                      setActionLoadingId(null);
                    }
                  }}
                  disabled={actionLoadingId === u.userId}
                >
                  吊销登录
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </Page>
  );
}

