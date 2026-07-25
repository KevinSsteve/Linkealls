/**
 * OwnerGate — PIN lock removed per task #27.
 * Now a simple passthrough; kept for safe import compatibility.
 */
import type { ReactNode } from "react";

export function OwnerGate({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
