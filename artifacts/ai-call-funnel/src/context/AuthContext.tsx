/**
 * Lightweight user auth context.
 * Token is stored in localStorage so it survives page reloads.
 * The API validates the token on every protected call.
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface AuthUser {
  id: string;
  phone: string;
  name: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
}

interface AuthContextValue extends AuthState {
  login:  (user: AuthUser, token: string) => void;
  logout: () => void;
  isLoggedIn: boolean;
}

const KEY_TOKEN = "user_token";
const KEY_USER  = "user_info";

function loadInitial(): AuthState {
  try {
    const token = localStorage.getItem(KEY_TOKEN);
    const raw   = localStorage.getItem(KEY_USER);
    if (token && raw) return { token, user: JSON.parse(raw) as AuthUser };
  } catch { /* ignore */ }
  return { token: null, user: null };
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(loadInitial);

  const login = useCallback((user: AuthUser, token: string) => {
    localStorage.setItem(KEY_TOKEN, token);
    localStorage.setItem(KEY_USER, JSON.stringify(user));
    setState({ user, token });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(KEY_TOKEN);
    localStorage.removeItem(KEY_USER);
    setState({ user: null, token: null });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, isLoggedIn: !!state.user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
