import { useParams } from "wouter";

/**
 * Reads the current business slug from the URL (/e/:businessSlug/...).
 * Returns null when no slug is present in the URL (legacy routes redirect
 * to the homepage before any component that calls this hook is rendered).
 */
export function useBusinessSlug(): string | null {
  const params = useParams<{ businessSlug?: string }>();
  return params.businessSlug ?? null;
}
