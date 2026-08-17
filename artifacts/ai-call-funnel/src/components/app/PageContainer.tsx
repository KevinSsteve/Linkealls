import type { ReactNode } from "react";

export function PageContainer({
  children,
  className = "",
  as: Tag = "main",
}: {
  children: ReactNode;
  className?: string;
  as?: "main" | "div" | "section";
}) {
  return <Tag className={`app-page-content ${className}`}>{children}</Tag>;
}

export function Divider({ className = "" }: { className?: string }) {
  return <div className={`app-divider ${className}`} role="separator" />;
}