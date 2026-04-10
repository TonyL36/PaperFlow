import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiGetMyProfile, apiLogin, apiLogout, apiRefresh } from "../data/api";
import { ApiError, configureHttpAuthTransport } from "../data/http";
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
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);
  const bootRef = useRef(false);
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
  const applyAccessToken = useCallback((accessToken: string) => {
    const payload = decodeJwtPayload(accessToken);
    if (!payload?.sub) {
      throw new Error("invalid_access_token");
    }
    const userId = payload.sub;
    localStorage.setItem(STORAGE_KEY, accessToken);
    setState((prev) => ({
      status: "authenticated",
      accessToken,
      userId,
      roles: payload.roles ?? (prev.status === "authenticated" ? prev.roles : []),
      displayName: prev.status === "authenticated" ? prev.displayName : "用户",
      avatarUrl: prev.status === "authenticated" ? prev.avatarUrl ?? null : null
    }));
    return userId;
  }, []);
  const refreshAccessToken = useCallback(async () => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }
    const p = (async () => {
      try {
        const accessToken = await apiRefresh();
        applyAccessToken(accessToken);
        return accessToken;
      } catch {
        return null;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();
    refreshPromiseRef.current = p;
    return p;
  }, [applyAccessToken]);

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
    } catch (e) {
      const apiErr = e instanceof ApiError ? e : null;
      if (apiErr?.code === "AUTH_INVALID_TOKEN") {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          try {
            const me = await apiGetMyProfile(refreshed);
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
            return;
          } catch {
          }
        }
      }
      localStorage.removeItem(STORAGE_KEY);
      setState({ status: "anonymous" });
    }
  }, [state, refreshAccessToken]);

  const accessToken = state.status === "authenticated" ? state.accessToken : "";

  useEffect(() => {
    configureHttpAuthTransport({ refreshAccessToken });
    return () => configureHttpAuthTransport(null);
  }, [refreshAccessToken]);

  useEffect(() => {
    if (bootRef.current) {
      return;
    }
    bootRef.current = true;
    const localToken = localStorage.getItem(STORAGE_KEY);
    const payload = localToken ? decodeJwtPayload(localToken) : null;
    const nowSec = Math.floor(Date.now() / 1000);
    const tokenValid = !!(payload?.sub && (!payload.exp || payload.exp > nowSec));
    if (!tokenValid) {
      void refreshAccessToken();
    }
  }, [refreshAccessToken]);

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
      } catch (e) {
        const apiErr = e instanceof ApiError ? e : null;
        if (apiErr?.code === "AUTH_INVALID_TOKEN") {
          const refreshed = await refreshAccessToken();
          if (refreshed) {
            return;
          }
        }
        localStorage.removeItem(STORAGE_KEY);
        setState({ status: "anonymous" });
      }
    })();
  }, [accessToken, refreshAccessToken]);

  const login = useCallback(async (email: string, password: string) => {
    const accessToken = await apiLogin({ email, password });
    applyAccessToken(accessToken);
    const me = await apiGetMyProfile(accessToken);
    setState({
      status: "authenticated",
      accessToken,
      userId: me.userId,
      roles: me.roles ?? [],
      displayName: me.displayName,
      avatarUrl: me.avatarUrl ?? null
    });
  }, [applyAccessToken]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    const timer = window.setInterval(() => {
      void refreshAccessToken();
    }, 10 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshAccessToken();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [accessToken, refreshAccessToken]);

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
