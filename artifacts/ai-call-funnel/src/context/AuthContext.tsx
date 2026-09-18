/**
 * Lightweight user auth context.
 * The authenticated session is an HttpOnly cookie. Browser storage only keeps
 * display data; it never contains a bearer credential.
 *
 * Model: every user IS a business — their handle is their business slug.
 * No separate "ownedSlug" field is needed.
 */
import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import {
  AUTH_EXPIRED_EVENT,
  getCurrentUser,
  migrateLegacyBrowserSession,
  userLogout,
  type AuthUser,
} from "@/lib/api";

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (user: AuthUser) => void;
  logout: () => void;
  setHandle: (handle: string) => void;
  isLoggedIn: boolean;
}

const KEY_USER  = "user_info";
const LEGACY_TOKEN_KEY = "user_token";

function cacheUser(user: AuthUser | null) {
  try {
    if (user) localStorage.setItem(KEY_USER, JSON.stringify(user));
    else localStorage.removeItem(KEY_USER);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    // Display caching is optional; the HttpOnly session remains authoritative.
  }
}

function loadInitial(): AuthState {
  try {
    const raw   = localStorage.getItem(KEY_USER);
    if (raw) {
      const user = JSON.parse(raw) as AuthUser;
      // Strip stale ownedSlug field that may exist in old localStorage sessions
      const { id, phone, name, handle } = user as AuthUser & { ownedSlug?: unknown };
      return {
        user: { id, phone, name, handle: handle ?? null },
        isLoading: true,
      };
    }
  } catch { /* ignore */ }
  return { user: null, isLoading: true };
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(loadInitial);
  const sessionVersion = useRef(0);

  const clearStoredSession = useCallback(() => {
    sessionVersion.current += 1;
    cacheUser(null);
    setState({ user: null, isLoading: false });
  }, []);

  useEffect(() => {
    const handleExpired = () => clearStoredSession();
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);

    const version = sessionVersion.current;
    let active = true;
    let legacyToken: string | null = null;
    try {
      legacyToken = localStorage.getItem(LEGACY_TOKEN_KEY);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    } catch { /* Browser display storage may be unavailable. */ }
    // Existing deployments used localStorage. Migrate at most once, erase it
    // before state is exposed, and never send it to an owner/API endpoint.
    const currentUser = legacyToken
      ? migrateLegacyBrowserSession(legacyToken)
      : getCurrentUser();
    void currentUser
      .then(({ user }) => {
        if (!active || version !== sessionVersion.current) return;
        cacheUser(user);
        setState({ user, isLoading: false });
      })
      .catch(() => { if (active && version === sessionVersion.current) clearStoredSession(); });

    return () => {
      active = false;
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    };
  }, [clearStoredSession]);

  const login = useCallback((user: AuthUser) => {
    sessionVersion.current += 1;
    cacheUser(user);
    setState({
      user,
      isLoading: false,
    });
  }, []);

  const logout = useCallback(() => {
    void userLogout().catch(() => { /* Clear local display even when offline. */ });
    clearStoredSession();
  }, [clearStoredSession]);

  const setHandle = useCallback((handle: string) => {
    sessionVersion.current += 1;
    setState((prev) => {
      if (!prev.user) return prev;
      const updated = { ...prev.user, handle };
      cacheUser(updated);
      return { ...prev, user: updated };
    });
  }, []);

  return (
    <AuthContext.Provider value={{
      ...state,
      login,
      logout,
      setHandle,
      isLoggedIn: !state.isLoading && !!state.user,
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
