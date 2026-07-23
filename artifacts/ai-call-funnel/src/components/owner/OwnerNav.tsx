import { useLocation } from "wouter";
import { Link } from "wouter";
import { Store, MessageSquare, Zap, Megaphone } from "lucide-react";

const TABS = [
  { path: "/dono",            icon: Store,          label: "Perfil",    exact: true  },
  { path: "/dono/conversas",  icon: MessageSquare,  label: "Conversas", exact: false },
  { path: "/dono/assistente", icon: Zap,            label: "Assistente",exact: false },
  { path: "/dono/campanhas",  icon: Megaphone,      label: "Campanhas", exact: false },
] as const;

export function OwnerNav() {
  const [location] = useLocation();

  return (
    <nav
      className="flex-shrink-0 flex items-stretch border-t border-white/[0.07]"
      style={{ background: "#0A1420", paddingBottom: "env(safe-area-inset-bottom, 0)" }}
    >
      {TABS.map(({ path, icon: Icon, label, exact }) => {
        const active = exact
          ? location === path
          : location === path || location.startsWith(path + "/");
        return (
          <Link
            key={path}
            href={path}
            className={`flex-1 flex flex-col items-center justify-center gap-[3px] py-2.5 transition-colors select-none ${
              active ? "text-[#00BFA5]" : "text-[#3E576F] hover:text-[#7A9BB5]"
            }`}
          >
            <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
            <span className="text-[10px] font-medium tracking-wide leading-none">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
