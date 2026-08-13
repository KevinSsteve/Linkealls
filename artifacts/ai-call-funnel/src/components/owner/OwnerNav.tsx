import { useLocation, Link } from "wouter";
import { Store, MessageSquare, Zap, Megaphone } from "lucide-react";
import { useBusinessSlug } from "../../hooks/useBusinessSlug";

const TABS = [
  { sub: "",            icon: Store,         label: "Perfil",     exact: true  },
  { sub: "/conversas",  icon: MessageSquare, label: "Conversas",  exact: false },
  { sub: "/assistente", icon: Zap,           label: "Assistente", exact: false },
  { sub: "/campanhas",  icon: Megaphone,     label: "Campanhas",  exact: false },
] as const;

export function OwnerNav() {
  const [location] = useLocation();
  const slug = useBusinessSlug();
  const base = slug ? `/e/${slug}/dono` : "/";

  return (
    <nav
      className="flex-shrink-0 flex items-stretch"
      style={{
        background: "#FFFFFF",
        borderTop: "1px solid #E9EDEF",
        boxShadow: "0 -1px 4px rgba(0,0,0,0.06)",
        paddingBottom: "env(safe-area-inset-bottom, 0)",
      }}
    >
      {TABS.map(({ sub, icon: Icon, label, exact }) => {
        const path = `${base}${sub}`;
        const active = exact
          ? location === path
          : location === path || location.startsWith(path + "/");
        return (
          <Link
            key={path}
            href={path}
            className="flex-1 flex flex-col items-center justify-center gap-[3px] py-2.5 transition-colors select-none"
            style={{ color: active ? "#00A884" : "#8696A0" }}
          >
            <Icon
              size={22}
              strokeWidth={active ? 2.5 : 1.8}
              fill={active ? "#00A88420" : "none"}
            />
            <span
              className="text-[10px] font-semibold tracking-wide leading-none"
              style={{ color: active ? "#00A884" : "#8696A0" }}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
