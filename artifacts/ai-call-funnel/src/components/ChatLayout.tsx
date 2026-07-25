import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Phone, MoreVertical, LogIn, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { userLogout } from "@/lib/api";

interface ChatLayoutProps {
  children: ReactNode;
  onBack?: () => void;
  onCall?: () => void;
  /** Display name shown in the chat header. Defaults to "Assistente IA". */
  businessName?: string;
}

function UserAvatar({ name }: { name: string }) {
  const initials = name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
      style={{
        background: "linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)",
        color: "#fff",
      }}
    >
      {initials}
    </div>
  );
}

export function ChatLayout({ children, onBack, onCall, businessName }: ChatLayoutProps) {
  const { user, token, logout, isLoggedIn } = useAuth();
  const [, nav] = useLocation();

  async function handleLogout() {
    if (token) userLogout(token).catch(() => {});
    logout();
  }

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

        {/* AI Avatar */}
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
          <span
            className="absolute bottom-0 right-0 w-[11px] h-[11px] rounded-full border-2"
            style={{ backgroundColor: "#34D399", borderColor: "#060C14" }}
          />
        </div>

        {/* Name + status */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[15px] leading-tight truncate" style={{ color: "#EAF0F7" }}>
            {businessName ?? "Assistente IA"}
          </p>
          <p className="text-[11px] leading-tight" style={{ color: "#34D399" }}>
            online
          </p>
        </div>

        {/* Icons */}
        <div className="flex items-center gap-3" style={{ color: "#7B96B2" }}>
          {/* Call */}
          <button
            onClick={onCall}
            disabled={!onCall}
            className="hover:text-[#EAF0F7] transition-colors active:scale-90 disabled:opacity-30 disabled:pointer-events-none"
            aria-label="Iniciar chamada"
          >
            <Phone size={20} />
          </button>

          {/* User auth button */}
          {isLoggedIn ? (
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors active:scale-90"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}
              title={`Sair (${user!.name})`}
            >
              <UserAvatar name={user!.name} />
              <LogOut size={13} style={{ color: "#7B96B2" }} />
            </button>
          ) : (
            <button
              onClick={() => nav("/login")}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors active:scale-90"
              style={{ background: "rgba(0,191,165,0.08)", border: "1px solid rgba(0,191,165,0.18)" }}
              aria-label="Entrar"
            >
              <LogIn size={14} style={{ color: "#00BFA5" }} />
              <span className="text-[12px] font-semibold" style={{ color: "#00BFA5" }}>Entrar</span>
            </button>
          )}

          {/* Owner area */}
          <Link
            href={`/dono`}
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
