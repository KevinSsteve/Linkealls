import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "neutral" | "success" | "warning";
}) {
  return (
    <div className={`app-stat-card is-${tone}`}>
      <p className="app-stat-label">{label}</p>
      <p className="app-stat-value tabular-nums">{value}</p>
      {detail && <p className="app-stat-detail">{detail}</p>}
    </div>
  );
}