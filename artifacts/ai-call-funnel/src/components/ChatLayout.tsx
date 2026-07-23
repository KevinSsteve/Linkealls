import { ReactNode } from "react";
import { Link } from "wouter";
import { ArrowLeft, Phone, MoreVertical } from "lucide-react";

interface ChatLayoutProps {
  children: ReactNode;
  onBack?: () => void;
  onCall?: () => void;
}

export function ChatLayout({ children, onBack, onCall }: ChatLayoutProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ── */}
      <header
        className="flex items-center gap-3 flex-shrink-0 z-20"
        style={{
          background: "linear-gradient(180deg, #060C14 0%, #080F1C 100%)",
          borderBottom: "1px solid #111E30",
          padding: "10px 14px",
          paddingTop: "calc(10px + env(safe-area-inset-top))",
        }}
      >
        {/* Back */}
        <button
          onClick={onBack ?? (() => window.history.back())}
          className="p-1 -ml-1 rounded-full transition-colors active:bg-white/10 text-[#7B96B2]"
          aria-label="Voltar"
        >
          <ArrowLeft size={22} />
        </button>

        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg text-white shadow-lg"
            style={{
              background: "linear-gradient(135deg, #00C896 0%, #007A5C 100%)",
              boxShadow: "0 0 16px rgba(0,200,150,0.25)",
            }}
          >
            A
          </div>
          {/* Online dot */}
          <span
            className="absolute bottom-0 right-0 w-[11px] h-[11px] rounded-full border-2"
            style={{ backgroundColor: "#34D399", borderColor: "#060C14" }}
          />
        </div>

        {/* Name + status */}
        <div className="flex-1 min-w-0">
          <p
            className="font-semibold text-[15px] leading-tight truncate"
            style={{ color: "#EAF0F7" }}
          >
            Assistente IA
          </p>
          <p className="text-[11px] leading-tight" style={{ color: "#34D399" }}>
            online
          </p>
        </div>

        {/* Icons */}
        <div className="flex items-center gap-4" style={{ color: "#7B96B2" }}>
          {/* Phone — triggers a new call if handler provided */}
          <button
            onClick={onCall}
            disabled={!onCall}
            className="hover:text-[#EAF0F7] transition-colors active:scale-90 disabled:opacity-30 disabled:pointer-events-none"
            aria-label="Iniciar chamada"
          >
            <Phone size={20} />
          </button>

          {/* Owner area entry point (⋮ like WhatsApp's menu) */}
          <Link
            href="/dono"
            className="hover:text-[#EAF0F7] transition-colors active:scale-90"
            aria-label="Área do dono"
          >
            <MoreVertical size={21} />
          </Link>
        </div>
      </header>

      {/* ── Content ── */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {children}
      </div>
    </div>
  );
}
