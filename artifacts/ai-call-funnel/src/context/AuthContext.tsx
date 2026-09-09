/**
 * Lightweight user auth context.
 * Token + user info are stored in localStorage so they survive page reloads.
 *
 * Model: every user IS a business — their handle is their business slug.
 * No separate "ownedSlug" field is needed.
 */
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import {
  beginReplitLogin,
  beginReplitLogout,
  createLocalSessionFromReplit,
  getReplitAuth,
  type AuthUser,
  type ReplitAuthUser,
} from "@/lib/api";

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  replitUser: ReplitAuthUser | null;
  isLoading: boolean;
  needsLink: boolean;
}

interface AuthContextValue extends AuthState {
  login: (user: AuthUser, token: string) => void;
  logout: () => void;
  setHandle: (handle: string) => void;
  loginWithReplit: (returnTo?: string) => void;
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
        replitUser: null,
        isLoading: false,
        needsLink: false,
      };
    }
  } catch { /* ignore */ }
  return { token: null, user: null, replitUser: null, isLoading: true, needsLink: false };
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(loadInitial);

  useEffect(() => {
    if (state.token) {
      setState((current) => ({ ...current, isLoading: false }));
      return;
    }

    let active = true;
    void (async () => {
      try {
        const auth = await getReplitAuth();
        if (!active || !auth.user) {
          if (active) setState((current) => ({ ...current, isLoading: false }));
          return;
        }

        try {
          const local = await createLocalSessionFromReplit();
          if (!active) return;
          localStorage.setItem(KEY_TOKEN, local.token);
          localStorage.setItem(KEY_USER, JSON.stringify(local.user));
          setState({
            user: local.user,
            token: local.token,
            replitUser: auth.user,
            isLoading: false,
            needsLink: false,
          });
        } catch (error) {
          if (!active) return;
          const needsLink = error instanceof Error
            && (error as Error & { code?: string }).code === "needs_link";
          setState((current) => ({
            ...current,
            replitUser: auth.user,
            isLoading: false,
            needsLink,
          }));
        }
      } catch {
        if (active) setState((current) => ({ ...current, isLoading: false }));
      }
    })();

    return () => { active = false; };
  }, [state.token]);

  const login = useCallback((user: AuthUser, token: string) => {
    localStorage.setItem(KEY_TOKEN, token);
    localStorage.setItem(KEY_USER, JSON.stringify(user));
    setState((current) => ({
      user,
      token,
      replitUser: current.replitUser,
      isLoading: false,
      needsLink: false,
    }));
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(KEY_TOKEN);
    localStorage.removeItem(KEY_USER);
    const hadReplitSession = state.replitUser !== null;
    setState({ user: null, token: null, replitUser: null, isLoading: false, needsLink: false });
    if (hadReplitSession) beginReplitLogout("/");
  }, [state.replitUser]);

  const loginWithReplit = useCallback((returnTo?: string) => {
    beginReplitLogin(returnTo);
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
      loginWithReplit,
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
