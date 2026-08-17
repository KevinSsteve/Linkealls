import type { ReactNode } from "react";

/**
 * Read-only profile information. Empty values are rendered as an empty state
 * with an action, never as a fake input or placeholder.
 */
export function ViewField({
  label,
  value,
  onAdd,
  icon,
  href,
  emptyActionLabel = "Adicionar",
  className = "",
}: {
  label: string;
  value?: string | null;
  onAdd?: () => void;
  icon?: ReactNode;
  href?: string;
  emptyActionLabel?: string;
  className?: string;
}) {
  const hasValue = Boolean(value?.trim());
  return (
    <div className={`app-view-field ${className}`}>
      <div className="app-view-field-label">
        {icon}
        <span>{label}</span>
      </div>
      {hasValue ? (
        href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="app-view-field-value is-link">
            {value}
          </a>
        ) : (
          <p className="app-view-field-value">{value}</p>
        )
      ) : (
        <div className="app-view-field-empty">
          <span>Não adicionado</span>
          {onAdd && (
            <button type="button" onClick={onAdd} className="app-view-field-action">
              {emptyActionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}