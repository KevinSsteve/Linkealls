/**
 * WaHeader — reusable WhatsApp Business–style dark-green page header.
 * Use on every owner page that needs a top nav bar.
 */
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

interface WaHeaderProps {
  /** Bold white title */
  title: string;
  /** Smaller subtitle in translucent white */
  subtitle?: string;
  /** Avatar node placed left of the title */
  avatar?: ReactNode;
  /** Called when the ← back button is pressed; omit to hide the button */
  onBack?: () => void;
  /** Icon buttons on the right (already coloured white by wrapper) */
  actions?: ReactNode;
  /** Extra class names for the root element */
  className?: string;
}

export function WaHeader({
  title,
  subtitle,
  avatar,
  onBack,
  actions,
  className = "",
}: WaHeaderProps) {
  return (
    <div
      className={`flex items-center gap-3 px-3 shrink-0 ${className}`}
      style={{ background: "#075E54", height: 56 }}
    >
      {onBack && (
        <button
          onClick={onBack}
          className="p-1 -ml-1 active:scale-90 transition-transform shrink-0"
          style={{ color: "rgba(255,255,255,0.85)" }}
          aria-label="Voltar"
        >
          <ArrowLeft size={22} />
        </button>
      )}

      {avatar && <div className="shrink-0">{avatar}</div>}

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[15px] text-white leading-tight truncate">
          {title}
        </p>
        {subtitle && (
          <p
            className="text-[12px] leading-tight"
            style={{ color: "rgba(255,255,255,0.72)" }}
          >
            {subtitle}
          </p>
        )}
      </div>

      {actions && (
        <div
          className="flex items-center gap-4 shrink-0"
          style={{ color: "rgba(255,255,255,0.85)" }}
        >
          {actions}
        </div>
      )}
    </div>
  );
}
