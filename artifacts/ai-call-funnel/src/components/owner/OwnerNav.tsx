import { useLocation, Link } from "wouter";
import { Store, MessageSquare, ShoppingCart, Megaphone, Target } from "lucide-react";
import { useBusinessSlug } from "../../hooks/useBusinessSlug";

const TABS = [
  { sub: "",           icon: Store,         label: "Perfil",    exact: true  },
  { sub: "/conversas", icon: MessageSquare, label: "Conversas", exact: false },
  { sub: "/vendas",     icon: ShoppingCart,  label: "Vendas",    exact: false },
  { sub: "/campanhas",  icon: Megaphone,     label: "Tráfego",   exact: false },
  { sub: "/estrategia",  icon: Target,        label: "Estratégia", exact: false },
] as const;

export function OwnerNav() {
  const [location] = useLocation();
  const slug = useBusinessSlug();
  const base = slug ? `/e/${slug}/dono` : "/";

  return (
    <nav
      className="app-bottom-nav flex-shrink-0 flex items-stretch"
      style={{
        background: "var(--surface)",
        boxShadow: "0 -6px 20px rgba(23, 19, 31, 0.06)",
      }}
      aria-label="Navegação principal"
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
            className={`app-bottom-nav-item flex-1 flex flex-col items-center justify-center gap-1 transition-colors select-none active:opacity-70${active ? " is-active" : ""}`}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            data-testid={`link-owner-nav-${label.toLowerCase()}`}
          >
            <Icon
              size={21}
              strokeWidth={active ? 2.25 : 1.75}
            />
            <span
              className="app-bottom-nav-label"
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
