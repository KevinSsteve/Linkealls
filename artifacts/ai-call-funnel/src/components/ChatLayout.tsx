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

export function ChatLayout({ children, onBack, onCall, businessName, businessSlug }: ChatLayoutProps) {
  const [, nav] = useLocation();
  const { isLoggedIn } = useAuth();

  function handleMoreVertical() {
    if (isLoggedIn && businessSlug) {
      nav(`/e/${businessSlug}/dono/assistente`);
    } else {
      const next = businessSlug ? `/e/${businessSlug}/dono/assistente` : "/";
      nav(`/login?next=${encodeURIComponent(next)}`);
    }
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

        {/* AI Avatar */}
        <div className="relative flex-shrink-0">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-[17px]"
            style={{ background: "#25D366", color: "#FFFFFF" }}
          >
            A
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
            online
          </p>
        </div>

        {/* Icons */}
        <div className="flex items-center gap-4" style={{ color: "rgba(255,255,255,0.85)" }}>
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
