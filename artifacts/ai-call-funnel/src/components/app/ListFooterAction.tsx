import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "wouter";

export function ListFooterAction({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className="app-list-footer-action">
      <span>{children}</span>
      <ArrowRight size={16} strokeWidth={1.8} />
    </Link>
  );
}