import type { ReactNode } from "react";

export function IconContainer({
  children,
  size = "md",
}: {
  children: ReactNode;
  size?: "sm" | "md";
}) {
  return <span className={`app-icon-container is-${size}`}>{children}</span>;
}