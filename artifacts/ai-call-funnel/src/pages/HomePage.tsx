/**
 * Linkealls — Landing page & business directory.
 * WhatsApp Business light theme — conversation-list style.
 */
import { useState, useEffect } from "react";
import { Link, Redirect } from "wouter";
import { Building2, Loader2, Zap, LogIn, Search, Camera, MoreVertical } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

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

const PALETTES = [
  { bg: "#DFE5E7", text: "#54656F" },
  { bg: "#D9FDD3", text: "#25D366" },
  { bg: "#FFE8CC", text: "#F97316" },
  { bg: "#E8D9FD", text: "#7C3AED" },
  { bg: "#D9F0FD", text: "#0EA5E9" },
  { bg: "#FDD9E8", text: "#EC4899" },
];
function palette(name: string) {
  let h = 0;
  for (const c of name) h = h * 31 + c.charCodeAt(0);
  return PALETTES[Math.abs(h) % PALETTES.length]!;
}

// ─── Business row (WA conversation-list style) ────────────────────────────

function BusinessRow({ b }: { b: Business }) {
  const p = palette(b.name);
  return (
    <Link href={`/e/${b.slug}`}>
      <div className="flex items-center gap-3 px-4 py-3.5 active:bg-[#F5F5F5] cursor-pointer transition-colors">
        {/* Avatar */}
        <div
          className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-[20px] font-bold shrink-0"
          style={{ background: p.bg, color: p.text }}
        >
          {b.name.charAt(0).toUpperCase()}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 border-b py-0.5" style={{ borderColor: "#E9EDEF" }}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold text-[16px] truncate" style={{ color: "#111B21" }}>{b.name}</span>
            <span
              className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{ background: "#D9FDD3", color: "#128C7E" }}
            >
              <Zap size={9} fill="currentColor" /> IA
            </span>
          </div>
          <p className="text-[14px] truncate mt-0.5" style={{ color: "#667781" }}>
            {b.sector}{b.description ? ` · ${b.description}` : ""}
          </p>
        </div>
      </div>
    </Link>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 animate-pulse">
      <div className="w-[52px] h-[52px] rounded-full shrink-0" style={{ background: "#F0F2F5" }} />
      <div className="flex-1 border-b pb-3.5" style={{ borderColor: "#E9EDEF" }}>
        <div className="h-4 rounded mb-2" style={{ background: "#F0F2F5", width: "55%" }} />
        <div className="h-3 rounded" style={{ background: "#F0F2F5", width: "75%" }} />
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function HomePage() {
  const { user, isLoggedIn } = useAuth();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  if (isLoggedIn) {
    return user?.handle ? <Redirect to={`/u/${user.handle}`} /> : <Redirect to="/escolher-handle" />;
  }

  useEffect(() => {
    fetch(`${API_BASE}/businesses`)
      .then((r) => r.json())
      .then(({ businesses }) => setBusinesses(businesses ?? []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (businesses.length === 0) return;
    const origin = window.location.origin;
    const ld = {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebSite", "@id": `${origin}/#website`, url: `${origin}/`, name: "Linkealls", inLanguage: "pt-AO" },
        {
          "@type": "ItemList", "@id": `${origin}/#businesses`,
          name: "Negócios no Linkealls", numberOfItems: businesses.length,
          itemListElement: businesses.map((b, i) => ({
            "@type": "ListItem", position: i + 1, url: `${origin}/e/${b.slug}/`, name: b.name,
          })),
        },
      ],
    };
    const script = document.createElement("script");
    script.id = "linkealls-jsonld";
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(ld);
    document.head.appendChild(script);
    return () => { document.getElementById("linkealls-jsonld")?.remove(); };
  }, [businesses]);

  const filtered = search.trim()
    ? businesses.filter((b) =>
        b.name.toLowerCase().includes(search.toLowerCase()) ||
        b.sector.toLowerCase().includes(search.toLowerCase()),
      )
    : businesses;

  return (
    <div className="flex flex-col h-full" style={{ background: "#FFFFFF", minHeight: "100dvh" }}>

      {/* ── Top App Bar ── */}
      <header style={{ background: "#075E54" }}>
        <div style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <div className="flex items-center justify-between px-4 h-14">
            <span className="font-bold text-[20px] text-white tracking-tight">Linkealls</span>
            <div className="flex items-center gap-4" style={{ color: "rgba(255,255,255,0.85)" }}>
              <button onClick={() => setShowSearch((s) => !s)} aria-label="Pesquisar">
                <Search size={21} />
              </button>
              <button aria-label="Câmara"><Camera size={21} /></button>
              <button aria-label="Menu"><MoreVertical size={21} /></button>
            </div>
          </div>

          {/* Search bar */}
          {showSearch && (
            <div className="px-3 pb-2">
              <div className="flex items-center gap-3 px-4 rounded-full bg-white" style={{ height: 40 }}>
                <Search size={16} style={{ color: "#8696A0" }} className="shrink-0" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Pesquisar negócios…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 bg-transparent outline-none text-[15px]"
                  style={{ color: "#111B21" }}
                />
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ── Filter tabs (Todas / Com IA) ── */}
      <div className="shrink-0 flex gap-2 px-4 py-2" style={{ background: "#FFFFFF", borderBottom: "1px solid #E9EDEF" }}>
        <span
          className="text-[13px] font-semibold px-3 py-1 rounded-full"
          style={{ background: "#D9FDD3", color: "#128C7E" }}
        >
          Todas
        </span>
        <span
          className="text-[13px] font-medium px-3 py-1 rounded-full"
          style={{ background: "#F0F2F5", color: "#667781" }}
        >
          Com IA
        </span>
      </div>

      {/* ── Business list ── */}
      <div className="flex-1 overflow-y-auto min-h-0" style={{ background: "#FFFFFF" }}>
        {loading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
            <Building2 size={40} style={{ color: "#8696A0" }} />
            <p style={{ color: "#667781" }}>Erro ao carregar. Tenta de novo.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
            <Building2 size={40} style={{ color: "#8696A0" }} />
            <p style={{ color: "#667781" }}>
              {search ? `Sem resultados para "${search}"` : "Nenhum negócio disponível ainda."}
            </p>
          </div>
        ) : (
          filtered.map((b) => <BusinessRow key={b.id} b={b} />)
        )}
      </div>

      {/* ── Footer / Login CTA ── */}
      <div
        className="shrink-0 flex items-center justify-between px-6 py-4"
        style={{ background: "#F0F2F5", borderTop: "1px solid #E9EDEF", paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}
      >
        <span className="text-[13px]" style={{ color: "#8696A0" }}>© {new Date().getFullYear()} Linkealls</span>
        <Link href="/login">
          <button
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-semibold"
            style={{ background: "#25D366", color: "#FFFFFF" }}
          >
            <LogIn size={14} /> Entrar
          </button>
        </Link>
      </div>
    </div>
  );
}
