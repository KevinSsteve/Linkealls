import { useLocation, Link } from "wouter";
import { Store, MessageSquare, Megaphone, ShoppingBag } from "lucide-react";
import { useBusinessSlug } from "../../hooks/useBusinessSlug";
import { C } from "../../theme";

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
        background: C.white,
        borderTop: `1px solid ${C.border}`,
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
            className="flex-1 flex flex-col items-center justify-center gap-1 pt-2 pb-2 transition-colors select-none"
          >
            {/* Active indicator pill */}
            <span
              className="flex items-center justify-center rounded-full transition-all"
              style={{
                width: 56,
                height: 32,
                background: active ? C.greenLight : "transparent",
              }}
            >
              <Icon
                size={22}
                strokeWidth={active ? 2.4 : 1.8}
                style={{ color: active ? C.greenDark : C.text3 }}
              />
            </span>
            <span
              className="text-[11px] leading-none"
              style={{
                color: active ? C.text : C.text3,
                fontWeight: active ? 700 : 500,
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
