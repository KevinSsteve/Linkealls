/**
 * Lightweight user auth context.
 * Token + user info are stored in localStorage so they survive page reloads.
 *
 * Model: every user IS a business — their handle is their business slug.
 * No separate "ownedSlug" field is needed.
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { AuthUser } from "@/lib/api";

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (user: AuthUser, token: string) => void;
  logout: () => void;
  setHandle: (handle: string) => void;
  isLoggedIn: boolean;
}

const KEY_TOKEN = "user_token";
const KEY_USER  = "user_info";

function loadInitial(): AuthState {
  try {
    const token = localStorage.getItem(KEY_TOKEN);
    const raw   = localStorage.getItem(KEY_USER);
    if (token && raw) {
      const user = JSON.parse(raw) as AuthUser;
      // Strip stale ownedSlug field that may exist in old localStorage sessions
      const { id, phone, name, handle } = user as AuthUser & { ownedSlug?: unknown };
      return {
        token,
        user: { id, phone, name, handle: handle ?? null },
        isLoading: false,
      };
    }
  } catch { /* ignore */ }
  return { token: null, user: null, isLoading: false };
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(loadInitial);

  const login = useCallback((user: AuthUser, token: string) => {
    localStorage.setItem(KEY_TOKEN, token);
    localStorage.setItem(KEY_USER, JSON.stringify(user));
    setState((current) => ({
      user,
      token,
      isLoading: false,
    }));
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(KEY_TOKEN);
    localStorage.removeItem(KEY_USER);
    setState({ user: null, token: null, isLoading: false });
  }, []);

  const setHandle = useCallback((handle: string) => {
    setState((prev) => {
      if (!prev.user) return prev;
      const updated = { ...prev.user, handle };
      localStorage.setItem(KEY_USER, JSON.stringify(updated));
      return { ...prev, user: updated };
    });
  }, []);

  return (
    <AuthContext.Provider value={{
      ...state,
      login,
      logout,
      setHandle,
      isLoggedIn: !!state.user,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
