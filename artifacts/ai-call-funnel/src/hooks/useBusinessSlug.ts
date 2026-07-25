import { useParams } from "wouter";

/**
 * Reads the current business slug from the URL (/e/:businessSlug/...).
 * Falls back to "electropanga" for legacy routes that predate multi-tenancy.
 */
export function useBusinessSlug(): string {
  const params = useParams<{ businessSlug?: string }>();
  return params.businessSlug ?? "electropanga";
}
