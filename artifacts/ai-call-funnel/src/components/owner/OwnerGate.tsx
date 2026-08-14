/**
 * OwnerGate — protects the owner panel (/e/:slug/dono/*).
 *
 * User = business model: the authenticated user's handle must equal the
 * business slug of the panel being visited.
 *   · not logged in            → /login?next=<current path>
 *   · logged in, no handle     → /escolher-handle
 *   · handle ≠ slug            → own profile /u/:handle
 *
 * The backend independently enforces the same rule (bearer token on all
 * owner routes) — this gate is UX, not the security boundary.
 */
import type { ReactNode } from "react";
import { Redirect, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useBusinessSlug } from "@/hooks/useBusinessSlug";

export function OwnerGate({ children }: { children: ReactNode }) {
  const { isLoggedIn, user } = useAuth();
  const slug = useBusinessSlug();
  const [location] = useLocation();

  if (!isLoggedIn) return <Redirect to={`/login?next=${encodeURIComponent(location)}`} />;
  if (!user?.handle) return <Redirect to="/escolher-handle" />;
  if (slug && user.handle !== slug) return <Redirect to={`/e/${user.handle}/dono`} />;

  return <>{children}</>;
}
