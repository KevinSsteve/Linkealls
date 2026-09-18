/**
 * OwnerGate — protects the owner panel (/e/:slug/dono/*).
 *
 * User = business model: the authenticated user's handle must equal the
 * business slug of the panel being visited.
 *   · not logged in            → /login?next=<current path>
 *   · logged in, no handle     → /escolher-handle
 *   · handle ≠ slug            → own profile /u/:handle
 *
 * The backend independently enforces the same rule (HttpOnly session cookie on all
 * owner routes) — this gate is UX, not the security boundary.
 */
import type { ReactNode } from "react";
import { Redirect, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useBusinessSlug } from "@/hooks/useBusinessSlug";
import { AuthMark } from "@/components/auth/AuthBrand";
import "@/styles/owner-ux.css";

export function OwnerGate({ children }: { children: ReactNode }) {
  const { isLoading, isLoggedIn, user } = useAuth();
  const slug = useBusinessSlug();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-3 flex-1 min-h-[100dvh] bg-[var(--app-bg)]">
        <AuthMark size={56} className="animate-pulse" />
        <p className="text-sm font-medium text-[var(--ink-soft)]">A preparar o teu painel…</p>
      </div>
    );
  }

  if (!isLoggedIn) return <Redirect to={`/login?next=${encodeURIComponent(location)}`} />;
  if (!user?.handle) return <Redirect to="/escolher-handle" />;
  if (slug && user.handle !== slug) return <Redirect to={`/e/${user.handle}/dono`} />;

  return <>{children}</>;
}
