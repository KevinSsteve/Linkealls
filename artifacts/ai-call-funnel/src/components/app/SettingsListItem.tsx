import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { IconContainer } from "./IconContainer";
import { ListItem } from "./ListItem";

export function SettingsListItem({
  icon,
  title,
  description,
  href,
  onClick,
  trailing,
  loading = false,
  last = false,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  href?: string;
  onClick?: () => void;
  trailing?: ReactNode;
  loading?: boolean;
  last?: boolean;
}) {
  const content = (
    <ListItem
      title={title}
      description={description}
      leading={<IconContainer>{icon}</IconContainer>}
      trailing={trailing ?? <ChevronRight size={18} strokeWidth={1.6} />}
      onClick={onClick}
      className={`app-settings-list-item${last ? " is-last" : ""}${loading ? " is-loading" : ""}`}
    />
  );

  return href ? <Link href={href}>{content}</Link> : content;
}