import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { apiLogin, apiLogout } from "../data/api";
import { decodeJwtPayload } from "../utils/jwt";

type AuthState =
  | { status: "anonymous" }
  | { status: "authenticated"; accessToken: string; userId: string; roles: string[] };

type AuthContextValue = {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "paperflow.accessToken";

export function AuthProvider(props: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const t = localStorage.getItem(STORAGE_KEY);
    if (t && t.trim()) {
      const payload = decodeJwtPayload(t);
      if (payload?.sub) {
        return { status: "authenticated", accessToken: t, userId: payload.sub, roles: payload.roles ?? [] };
      }
    }
    return { status: "anonymous" };
  });

  const login = useCallback(async (email: string, password: string) => {
    const accessToken = await apiLogin({ email, password });
    const payload = decodeJwtPayload(accessToken);
    if (!payload?.sub) {
      throw new Error("invalid_access_token");
    }
    localStorage.setItem(STORAGE_KEY, accessToken);
    setState({ status: "authenticated", accessToken, userId: payload.sub, roles: payload.roles ?? [] });
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

  const value = useMemo<AuthContextValue>(() => ({ state, login, logout }), [state, login, logout]);
  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
}

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) {
    throw new Error("AuthContext missing");
  }
  return v;
}
