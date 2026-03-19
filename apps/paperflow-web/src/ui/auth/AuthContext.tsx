import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiGetMyProfile, apiLogin, apiLogout } from "../data/api";
import { decodeJwtPayload } from "../utils/jwt";

type AuthState =
  | { status: "anonymous" }
  | { status: "authenticated"; accessToken: string; userId: string; roles: string[]; displayName: string; avatarUrl?: string | null };

type AuthContextValue = {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "paperflow.accessToken";

export function AuthProvider(props: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const t = localStorage.getItem(STORAGE_KEY);
    if (t && t.trim()) {
      const payload = decodeJwtPayload(t);
      const nowSec = Math.floor(Date.now() / 1000);
      if (payload?.sub && (!payload.exp || payload.exp > nowSec)) {
        return { status: "authenticated", accessToken: t, userId: payload.sub, roles: payload.roles ?? [], displayName: "用户", avatarUrl: null };
      }
    }
    return { status: "anonymous" };
  });

  const refreshMe = useCallback(async () => {
    const current = state;
    if (current.status !== "authenticated") {
      return;
    }
    try {
      const me = await apiGetMyProfile(current.accessToken);
      setState((prev) => {
        if (prev.status !== "authenticated") {
          return prev;
        }
        return {
          ...prev,
          userId: me.userId,
          roles: me.roles ?? [],
          displayName: me.displayName,
          avatarUrl: me.avatarUrl ?? null
        };
      });
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      setState({ status: "anonymous" });
    }
  }, [state]);

  const accessToken = state.status === "authenticated" ? state.accessToken : "";

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    void (async () => {
      try {
        const me = await apiGetMyProfile(accessToken);
        setState((prev) => {
          if (prev.status !== "authenticated") {
            return prev;
          }
          return {
            ...prev,
            userId: me.userId,
            roles: me.roles ?? [],
            displayName: me.displayName,
            avatarUrl: me.avatarUrl ?? null
          };
        });
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        setState({ status: "anonymous" });
      }
    })();
  }, [accessToken]);

  const login = useCallback(async (email: string, password: string) => {
    const accessToken = await apiLogin({ email, password });
    const payload = decodeJwtPayload(accessToken);
    if (!payload?.sub) {
      throw new Error("invalid_access_token");
    }
    const me = await apiGetMyProfile(accessToken);
    localStorage.setItem(STORAGE_KEY, accessToken);
    setState({
      status: "authenticated",
      accessToken,
      userId: me.userId || payload.sub,
      roles: me.roles ?? payload.roles ?? [],
      displayName: me.displayName,
      avatarUrl: me.avatarUrl ?? null
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      if (state.status === "authenticated") {
        await apiLogout(state.accessToken);
      }
    } finally {
      localStorage.removeItem(STORAGE_KEY);
      setState({ status: "anonymous" });
    }
  }, [state]);

  const value = useMemo<AuthContextValue>(() => ({ state, login, logout, refreshMe }), [state, login, logout, refreshMe]);
  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
}

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) {
    throw new Error("AuthContext missing");
  }
  return v;
}
