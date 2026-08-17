import type { ReactNode } from "react";

export function Section({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`app-section ${className}`}>{children}</section>;
}

export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="app-section-header">
      <h2 className="app-section-title">{title}</h2>
      {action}
    </div>
  );
}

export function SettingsSectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="app-settings-section-header">
      <h2>{children}</h2>
    </div>
  );
}