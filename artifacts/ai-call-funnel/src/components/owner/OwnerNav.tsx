import { useLocation, Link } from "wouter";
import { Store, MessageSquare, Megaphone, ShoppingBag } from "lucide-react";
import { useBusinessSlug } from "../../hooks/useBusinessSlug";

const TABS = [
  { sub: "",           icon: Store,         label: "Perfil",    exact: true  },
  { sub: "/conversas", icon: MessageSquare, label: "Conversas", exact: false },
  { sub: "/campanhas", icon: Megaphone,     label: "Campanhas", exact: false },
  { sub: "/mercado",   icon: ShoppingBag,   label: "Mercado",   exact: false },
] as const;

// ─── Design tokens — mesma linguagem que o catálogo ──────────────────────────
const N = {
  surface:  "#FFFFFF",
  ink:      "#14171A",
  inkSoft:  "#6B7280",
  inkFaint: "#9CA3AF",
  line:     "#E7E7E3",
  // tab activo — verde Linkealls
  activeBg:   "#DCFCE7",
  activeInk:  "#15803D",
  activeText: "#14171A",
} as const;

export function OwnerNav() {
  const [location] = useLocation();
  const slug = useBusinessSlug();
  const base = slug ? `/e/${slug}/dono` : "/";

  return (
    <nav
      className="flex-shrink-0 flex items-stretch"
      style={{
        background: N.surface,
        borderTop: `1px solid ${N.line}`,
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
            {/* Pill activo */}
            <span
              className="flex items-center justify-center rounded-full transition-all"
              style={{
                width: 52,
                height: 30,
                background: active ? N.activeBg : "transparent",
              }}
            >
              <Icon
                size={20}
                strokeWidth={active ? 2.5 : 1.8}
                style={{ color: active ? N.activeInk : N.inkFaint }}
              />
            </span>
            <span
              className="text-[10.5px] leading-none"
              style={{
                color: active ? N.ink : N.inkFaint,
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
