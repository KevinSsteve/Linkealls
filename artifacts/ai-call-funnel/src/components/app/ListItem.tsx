import type { ReactNode } from "react";

interface ListItemProps {
  title: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
  ariaLabel?: string;
}

export function ListItem({
  title,
  description,
  leading,
  trailing,
  href,
  onClick,
  className = "",
  ariaLabel,
}: ListItemProps) {
  const content = (
    <>
      {leading && <div className="app-list-item-leading">{leading}</div>}
      <div className="app-list-item-content">
        <div className="app-list-item-title">{title}</div>
        {description && <div className="app-list-item-description">{description}</div>}
      </div>
      {trailing && <div className="app-list-item-trailing">{trailing}</div>}
    </>
  );

  if (href) {
    return <a href={href} className={`app-list-item ${className}`} aria-label={ariaLabel}>{content}</a>;
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`app-list-item ${className}`} aria-label={ariaLabel}>
        {content}
      </button>
    );
  }
  return <div className={`app-list-item ${className}`}>{content}</div>;
}