import { useLocation, Link } from "wouter";
import { Store, MessageSquare, Megaphone, ShoppingBag } from "lucide-react";
import { useBusinessSlug } from "../../hooks/useBusinessSlug";

const TABS = [
  { sub: "",           icon: Store,         label: "Perfil",    exact: true  },
  { sub: "/conversas", icon: MessageSquare, label: "Conversas", exact: false },
  { sub: "/campanhas", icon: Megaphone,     label: "Campanhas", exact: false },
  { sub: "/mercado",   icon: ShoppingBag,   label: "Mercado",   exact: false },
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
        borderTop: "1px solid #E5E7EB",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
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
            className="flex-1 flex flex-col items-center justify-center gap-1.5 py-2.5 transition-colors select-none active:opacity-70"
            aria-label={label}
          >
            <Icon
              size={23}
              strokeWidth={active ? 2.25 : 1.75}
              style={{ color: active ? "#16A34A" : "#9CA3AF" }}
            />
            <span
              style={{
                fontSize: 11.5,
                lineHeight: 1,
                color: active ? "#16A34A" : "#9CA3AF",
                fontWeight: active ? 600 : 400,
                letterSpacing: "0.01em",
              }}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
