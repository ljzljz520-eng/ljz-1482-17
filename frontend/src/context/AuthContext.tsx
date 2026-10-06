import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, getApiErrorMessage } from "@/api/client";
import type { AuthUser } from "@/types/domain";

interface LoginInput {
  email: string;
  password: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  authError: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem("user-center:token");
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get<{ user: AuthUser }>("/auth/me");
      setUser(data.user);
    } catch (error) {
      setUser(null);
      setAuthError(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = useCallback(async (input: LoginInput) => {
    setAuthError(null);
    const { data } = await api.post<{ token: string; user: AuthUser }>("/auth/login", input);
    localStorage.setItem("user-center:token", data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("user-center:token");
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout, refreshUser, authError }),
    [user, loading, login, logout, refreshUser, authError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
