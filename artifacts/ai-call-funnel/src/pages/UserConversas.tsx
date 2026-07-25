/**
 * UserConversas — página de conversas do utilizador autenticado.
 * Mostra os negócios com que o utilizador já falou neste dispositivo,
 * ordenados do mais recente para o mais antigo, estilo WhatsApp.
 */
import { useState, useEffect } from "react";
import { Link, Redirect } from "wouter";
import { MessageCircle, Building2, LogOut, ChevronRight, Search, Zap } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { userLogout } from "@/lib/api";
import { getVisited, type VisitedBusiness } from "@/lib/visitedBusinesses";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Business {
  id: number;
  slug: string;
  name: string;
  sector: string;
  description: string;
}

const API_BASE = import.meta.env.DEV
  ? `${import.meta.env.BASE_URL}api`
  : "/api";

// ─── Avatar ──────────────────────────────────────────────────────────────────

const PALETTES = [
  { bg: "#1A3828", text: "#4ADE80" },
  { bg: "#1A2B45", text: "#60A5FA" },
  { bg: "#3A1A2B", text: "#F472B6" },
  { bg: "#2B1A3A", text: "#A78BFA" },
  { bg: "#3A2B1A", text: "#FB923C" },
  { bg: "#1A3A3A", text: "#22D3EE" },
];

function palette(name: string) {
  let h = 0;
  for (const c of name) h = h * 31 + c.charCodeAt(0);
  return PALETTES[Math.abs(h) % PALETTES.length]!;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffH = (now.getTime() - d.getTime()) / 3_600_000;
  if (diffH < 24) return d.toLocaleTimeString("pt-AO", { hour: "2-digit", minute: "2-digit" });
  if (diffH < 48) return "Ontem";
  return d.toLocaleDateString("pt-AO", { day: "2-digit", month: "short" });
}

// ─── Conversation row ─────────────────────────────────────────────────────────

function ConversaRow({ business, lastAt }: { business: Business; lastAt: string }) {
  const p = palette(business.name);
  const initial = business.name.charAt(0).toUpperCase();

  return (
    <Link href={`/e/${business.slug}`}>
      <div
        className="flex items-center gap-3 px-4 py-3.5 active:bg-white/5 transition-colors cursor-pointer"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        {/* Avatar */}
        <div
          className="shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold"
          style={{ background: p.bg, color: p.text }}
        >
          {initial}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold text-[#EAF0F7] truncate text-[15px]">
              {business.name}
            </span>
            <span className="shrink-0 text-[12px] text-[#4A6B80]">
              {formatTime(lastAt)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Zap size={10} style={{ color: "#00A884" }} fill="#00A884" />
            <span className="text-[13px] text-[#7B96B2] truncate">
              {business.sector} · Assistente IA
            </span>
          </div>
        </div>

        <ChevronRight size={15} className="shrink-0 text-[#3E576F]" />
      </div>
    </Link>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function UserConversas() {
  const { user, isLoggedIn, token, logout } = useAuth();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  // Redirect if not authenticated
  if (!isLoggedIn) return <Redirect to="/login?next=/conversas" />;
  // If user has a handle, their canonical page is /u/:handle
  if (user?.handle) return <Redirect to={`/u/${user.handle}`} />;

  // Load visited businesses + cross-ref with the API
  useEffect(() => {
    const visited: VisitedBusiness[] = getVisited();
    if (visited.length === 0) { setLoading(false); return; }

    fetch(`${API_BASE}/businesses`)
      .then((r) => r.json())
      .then(({ businesses: all }: { businesses: Business[] }) => {
        // Keep order from visited (most recent first)
        const map = new Map(all.map((b) => [b.slug, b]));
        const merged = visited
          .map((v) => {
            const b = map.get(v.slug);
            return b ? { business: b, lastAt: v.lastAt } : null;
          })
          .filter((x): x is { business: Business; lastAt: string } => x !== null);
        setBusinesses(merged.map((m) => m.business));
        // store enriched for rendering
        setEnriched(merged);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const [enriched, setEnriched] = useState<{ business: Business; lastAt: string }[]>([]);

  const filtered = query.trim()
    ? enriched.filter((e) =>
        e.business.name.toLowerCase().includes(query.toLowerCase()) ||
        e.business.sector.toLowerCase().includes(query.toLowerCase()),
      )
    : enriched;

  const handleLogout = async () => {
    if (token) await userLogout(token).catch(() => {});
    logout();
  };

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: "#060C14" }}
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header
        className="shrink-0 flex items-center justify-between px-4 pt-safe-top"
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          background: "#0D1826",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          minHeight: 60,
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm text-white"
            style={{ background: "linear-gradient(135deg, #00A884 0%, #007A62 100%)" }}
          >
            L
          </div>
          <div>
            <p className="font-semibold text-[15px] text-[#EAF0F7] leading-tight">Conversas</p>
            <p className="text-[11px] text-[#4A6B80] leading-tight">{user?.name}</p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium"
          style={{ background: "#141E2E", color: "#7B96B2", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <LogOut size={13} />
          Sair
        </button>
      </header>

      {/* ── Search ─────────────────────────────────────────────────────────── */}
      {enriched.length > 0 && (
        <div className="shrink-0 px-4 py-3" style={{ background: "#0D1826" }}>
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: "#141E2E", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <Search size={14} className="text-[#4A6B80] shrink-0" />
            <input
              type="text"
              placeholder="Pesquisar..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-[14px] text-[#EAF0F7] placeholder-[#4A6B80] outline-none"
            />
          </div>
        </div>
      )}

      {/* ── List ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          /* Skeleton */
          <div className="py-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3.5 animate-pulse"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
              >
                <div className="w-12 h-12 rounded-full shrink-0" style={{ background: "#141E2E" }} />
                <div className="flex-1">
                  <div className="h-4 rounded mb-2" style={{ background: "#141E2E", width: "50%" }} />
                  <div className="h-3 rounded" style={{ background: "#141E2E", width: "70%" }} />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="py-1">
            {filtered.map((e) => (
              <ConversaRow key={e.business.slug} business={e.business} lastAt={e.lastAt} />
            ))}
          </div>
        ) : enriched.length === 0 ? (
          /* Empty — never chatted */
          <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "#00A88415", border: "1px solid #00A88430" }}
            >
              <MessageCircle size={28} style={{ color: "#00A884" }} />
            </div>
            <div>
              <p className="font-semibold text-[#EAF0F7] mb-1">Ainda sem conversas</p>
              <p className="text-[13px] text-[#4A6B80] leading-relaxed">
                Encontra um negócio e inicia uma conversa com o assistente IA.
              </p>
            </div>
            <Link href="/">
              <button
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-[14px] text-white"
                style={{ background: "linear-gradient(135deg, #00A884 0%, #007A62 100%)" }}
              >
                <Building2 size={15} />
                Explorar negócios
              </button>
            </Link>
          </div>
        ) : (
          /* Search returned nothing */
          <div className="flex flex-col items-center justify-center py-20 text-[#3E576F]">
            <Search size={32} className="mb-3 opacity-40" />
            <p className="text-[14px]">Nenhum resultado para "{query}"</p>
          </div>
        )}
      </div>

      {/* ── Browse more ────────────────────────────────────────────────────── */}
      {enriched.length > 0 && (
        <div
          className="shrink-0 px-4 py-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)", background: "#0D1826" }}
        >
          <Link href="/">
            <button
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-medium"
              style={{ background: "#141E2E", color: "#7B96B2", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <Building2 size={14} />
              Explorar mais negócios
            </button>
          </Link>
        </div>
      )}
    </div>
  );
}
