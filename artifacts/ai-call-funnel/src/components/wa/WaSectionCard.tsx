/**
 * WaSectionCard — white card with a light border.
 * Wraps any content that needs the ProfileEditor / settings-page card look.
 */
import type { ReactNode } from "react";

interface WaSectionCardProps {
  children: ReactNode;
  className?: string;
  /** Additional inline styles */
  style?: React.CSSProperties;
}

export function WaSectionCard({ children, className = "", style }: WaSectionCardProps) {
  return (
    <div
      className={`bg-white rounded-2xl p-4 space-y-4 ${className}`}
      style={{ border: "1px solid var(--border)", ...style }}
    >
      {children}
    </div>
  );
}

/** Section title inside a WaSectionCard */
export function WaSectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[16px] font-bold" style={{ color: "var(--ink)" }}>
      {children}
    </h3>
  );
}

/** Muted label above an input */
export function WaFieldLabel({ children }: { children: ReactNode }) {
  return (
    <label
      className="block text-[12px] font-semibold uppercase tracking-wide mb-1.5"
      style={{ color: "var(--ink-faint)" }}
    >
      {children}
    </label>
  );
}
