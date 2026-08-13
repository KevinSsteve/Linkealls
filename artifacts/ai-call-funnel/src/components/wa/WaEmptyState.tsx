/**
 * WaEmptyState — centred empty-state block with icon, title, subtitle and
 * an optional action button.  Drop it inside a `flex-1` container.
 */
import type { ReactNode } from "react";

interface WaEmptyStateProps {
  icon: ReactNode;
  iconBg?: string;
  iconColor?: string;
  title: string;
  subtitle?: string;
  /** Optional CTA button or link rendered below the subtitle */
  action?: ReactNode;
}

export function WaEmptyState({
  icon,
  iconBg = "#F0F2F5",
  iconColor = "#8696A0",
  title,
  subtitle,
  action,
}: WaEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 px-8 py-12 gap-3 text-center select-none">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mb-1"
        style={{ background: iconBg, color: iconColor }}
      >
        {icon}
      </div>
      <p className="text-[17px] font-bold" style={{ color: "#111B21" }}>
        {title}
      </p>
      {subtitle && (
        <p
          className="text-[14px] leading-relaxed max-w-xs"
          style={{ color: "#8696A0" }}
        >
          {subtitle}
        </p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
