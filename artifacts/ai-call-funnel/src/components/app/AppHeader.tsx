import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  actions?: ReactNode;
  onBack?: () => void;
  className?: string;
  variant?: "light" | "dark";
}

/**
 * Shared page header for mobile app surfaces.
 * The header is edge-to-edge; its content always follows the app gutter.
 */
export function AppHeader({
  title,
  subtitle,
  leading,
  actions,
  onBack,
  className = "",
  variant = "light",
}: AppHeaderProps) {
  const dark = variant === "dark";
  return (
    <header
      className={`app-header shrink-0 ${dark ? "app-header-dark" : ""} ${className}`}
      style={{ background: dark ? "var(--header-bg, #0A2540)" : "var(--surface)" }}
    >
      <div className="app-header-inner">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="app-icon-button"
            aria-label="Voltar"
            data-testid="button-header-back"
          >
            <ArrowLeft size={19} strokeWidth={1.8} />
          </button>
        )}
        {leading}
        <div className="min-w-0 flex-1">
          <h1 className="app-header-title truncate">{title}</h1>
          {subtitle && <p className="app-header-subtitle truncate">{subtitle}</p>}
        </div>
        {actions && <div className="app-header-actions">{actions}</div>}
      </div>
    </header>
  );
}

export function AppIconButton({
  label,
  children,
  onClick,
  disabled = false,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="app-icon-button"
      aria-label={label}
      data-testid={`button-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {children}
    </button>
  );
}