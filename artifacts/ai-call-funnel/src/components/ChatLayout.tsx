import { ReactNode } from "react";
import { useLocation } from "wouter";
import { Phone, MoreVertical } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { AppHeader, AppIconButton } from "./app/AppHeader";

interface ChatLayoutProps {
  children: ReactNode;
  onBack?: () => void;
  onCall?: () => void;
  businessName?: string;
  businessSlug?: string;
}

// Avatar palette derived from business name
const PALETTES = [
  { bg: "#EEECFF", text: "#635BFF" },
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
  const pal = businessName ? palFor(businessName) : { bg: "#635BFF", text: "#FFFFFF" };

  function handleMoreVertical() {
    if (isLoggedIn && businessSlug) {
      nav(`/e/${businessSlug}/dono/assistente`);
    } else {
      const next = businessSlug ? `/e/${businessSlug}/dono/assistente` : "/";
      nav(`/login?next=${encodeURIComponent(next)}`);
    }
  }

  function goToCatalog() {
    if (businessSlug) nav(`/${businessSlug}`);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader
        variant="dark"
        title={businessName ?? "Assistente IA"}
        subtitle={businessName ? "toca para ver o catálogo" : "online"}
        onBack={onBack ?? (() => window.history.back())}
        leading={
          <button
            type="button"
            onClick={goToCatalog}
            className="relative shrink-0 active:opacity-75 transition-opacity"
            aria-label="Ver catálogo do negócio"
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-[15px]"
              style={{ background: pal.bg, color: pal.text }}
            >
              {initials}
            </div>
            <span
              className="absolute bottom-0 right-0 w-[10px] h-[10px] rounded-full border-2"
              style={{ backgroundColor: "#2E8B72", borderColor: "#0A2540" }}
            />
          </button>
        }
        actions={
          <>
            <AppIconButton label="Iniciar chamada" onClick={onCall} disabled={!onCall}>
              <Phone size={18} />
            </AppIconButton>
            <AppIconButton label="Área do dono" onClick={handleMoreVertical}>
              <MoreVertical size={19} />
            </AppIconButton>
          </>
        }
      />

      {/* ── Content ── */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {children}
      </div>
    </div>
  );
}
