import { ReactNode } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Phone, MoreVertical } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface ChatLayoutProps {
  children: ReactNode;
  onBack?: () => void;
  onCall?: () => void;
  businessName?: string;
  businessSlug?: string;
}

// Avatar palette derived from business name
const PALETTES = [
  { bg: "#D9FDD3", text: "#128C7E" },
  { bg: "#E3F2FD", text: "#0D47A1" },
  { bg: "#FCE4EC", text: "#880E4F" },
  { bg: "#FFF3E0", text: "#E65100" },
  { bg: "#E0F7FA", text: "#006064" },
];
function palFor(s: string) {
  let h = 0; for (const c of s) h = h * 31 + c.charCodeAt(0);
  return PALETTES[Math.abs(h) % PALETTES.length]!;
}

export function ChatLayout({ children, onBack, onCall, businessName, businessSlug }: ChatLayoutProps) {
  const [, nav] = useLocation();
  const { isLoggedIn } = useAuth();

  const initials = businessName
    ? businessName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : "A";
  const pal = businessName ? palFor(businessName) : { bg: "#25D366", text: "#FFFFFF" };

  function handleMoreVertical() {
    if (isLoggedIn && businessSlug) {
      nav(`/e/${businessSlug}/dono/assistente`);
    } else {
      const next = businessSlug ? `/e/${businessSlug}/dono/assistente` : "/";
      nav(`/login?next=${encodeURIComponent(next)}`);
    }
  }

  function goToCatalog() {
    if (businessSlug) nav(`/e/${businessSlug}/catalogo`);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header — WhatsApp Business light style ── */}
      <header
        className="flex items-center gap-3 flex-shrink-0 z-20"
        style={{
          background: "#075E54",
          padding: "10px 14px",
          paddingTop: "calc(10px + env(safe-area-inset-top))",
        }}
      >
        {/* Back */}
        <button
          onClick={onBack ?? (() => window.history.back())}
          className="p-1 -ml-1 rounded-full transition-colors active:bg-white/10"
          aria-label="Voltar"
          style={{ color: "rgba(255,255,255,0.85)" }}
        >
          <ArrowLeft size={22} />
        </button>

        {/* Avatar + Name — tappable → catalog */}
        <button
          onClick={goToCatalog}
          className="flex items-center gap-3 flex-1 min-w-0 text-left active:opacity-75 transition-opacity"
          aria-label="Ver catálogo do negócio"
        >
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-[16px]"
              style={{ background: pal.bg, color: pal.text }}
            >
              {initials}
            </div>
            <span
              className="absolute bottom-0 right-0 w-[11px] h-[11px] rounded-full border-2"
              style={{ backgroundColor: "#25D366", borderColor: "#075E54" }}
            />
          </div>

          {/* Name + status */}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[15px] leading-tight truncate text-white">
              {businessName ?? "Assistente IA"}
            </p>
            <p className="text-[12px] leading-tight" style={{ color: "rgba(255,255,255,0.75)" }}>
              {businessName ? "toca para ver o catálogo" : "online"}
            </p>
          </div>
        </button>

        {/* Icons */}
        <div className="flex items-center gap-4 flex-shrink-0" style={{ color: "rgba(255,255,255,0.85)" }}>
          <button
            onClick={onCall}
            disabled={!onCall}
            className="transition-colors active:scale-90 disabled:opacity-30 disabled:pointer-events-none"
            aria-label="Iniciar chamada"
          >
            <Phone size={20} />
          </button>
          <button
            onClick={handleMoreVertical}
            className="transition-colors active:scale-90"
            aria-label="Área do dono"
          >
            <MoreVertical size={21} />
          </button>
        </div>
      </header>

      {/* ── Content ── */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {children}
      </div>
    </div>
  );
}
