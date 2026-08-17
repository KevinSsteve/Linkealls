import { ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { AIBadge } from "./AIBadge";
import { BusinessAvatar } from "./ImagePlaceholder";

export function BusinessListItem({
  name,
  description,
  hasActiveAI,
  href,
}: {
  name: string;
  description: string;
  hasActiveAI: boolean;
  href: string;
}) {
  return (
    <Link href={href} className="app-business-list-item">
      <BusinessAvatar name={name} size="md" />
      <div className="app-business-list-content">
        <div className="app-business-list-title-row">
          <p className="app-business-list-name">{name}</p>
          {hasActiveAI && <AIBadge />}
        </div>
        <p className="app-business-list-description">{description}</p>
      </div>
      <ChevronRight className="app-business-list-chevron" size={18} strokeWidth={1.6} />
    </Link>
  );
}