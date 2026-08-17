/**
 * Linkealls — Landing page & business directory.
 * Clean, brand-first design. Not WhatsApp-cloned.
 */
import { useState, useEffect } from "react";
import { Link, Redirect } from "wouter";
import { Building2, Loader2, Zap, LogIn, Search, MoreVertical } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { C } from "../theme";

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
  { bg: "#DCFCE7", text: "#15803D" },
  { bg: "#DBEAFE", text: "#1D4ED8" },
  { bg: "#FEF3C7", text: "#B45309" },
  { bg: "#EDE9FE", text: "#6D28D9" },
  { bg: "#CCFBF1", text: "#0F766E" },
  { bg: "#FCE7F3", text: "#9D174D" },
];
function palette(name: string) {
  let h = 0;
  for (const c of name) h = h * 31 + c.charCodeAt(0);
  return PALETTES[Math.abs(h) % PALETTES.length]!;
}

// ─── Business row ────────────────────────────────────────────────────────────
function BusinessRow({ b }: { b: Business }) {
  const p = palette(b.name);
  return (
    <Link href={`/e/${b.slug}`}>
      <div
        className="flex items-center gap-3 px-4 active:bg-gray-50 cursor-pointer transition-colors"
        style={{ borderBottom: `1px solid ${C.border}` }}
      >
        {/* Avatar */}
        <div className="shrink-0 py-3">
          <div
            className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-[20px] font-bold"
            style={{ background: p.bg, color: p.text }}
          >
            {b.name.charAt(0).toUpperCase()}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 py-3.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold text-[16px] truncate" style={{ color: C.text }}>{b.name}</span>
            <span
              className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{ background: C.greenLight, color: C.greenDark }}
            >
              <Zap size={9} fill="currentColor" /> IA
            </span>
          </div>
          <p className="text-[14px] truncate mt-0.5" style={{ color: C.text2 }}>
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
    <div className="flex items-center gap-3 px-4 animate-pulse" style={{ borderBottom: `1px solid ${C.border}` }}>
      <div className="shrink-0 py-3">
        <div className="w-[52px] h-[52px] rounded-full" style={{ background: C.inputBg }} />
      </div>
      <div className="flex-1 py-4">
        <div className="h-4 rounded-lg mb-2" style={{ background: C.inputBg, width: "55%" }} />
        <div className="h-3 rounded-lg" style={{ background: C.inputBg, width: "75%" }} />
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
    return user?.handle ? <Redirect to={`/e/${user.handle}/dono`} /> : <Redirect to="/escolher-handle" />;
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
    <div className="flex flex-col h-full" style={{ background: C.white, minHeight: "100dvh" }}>

      {/* ── Header ── */}
      <header className="shrink-0" style={{ background: C.white, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <div className="flex items-center justify-between px-4 h-14">
            <span className="font-bold text-[20px] tracking-tight" style={{ color: C.text }}>
              Link<span style={{ color: C.green }}>ealls</span>
            </span>
            <div className="flex items-center gap-4" style={{ color: C.text3 }}>
              <button
                onClick={() => setShowSearch((s) => !s)}
                aria-label="Pesquisar"
                className="transition-colors active:opacity-60"
              >
                <Search size={21} />
              </button>
              <button aria-label="Menu" className="transition-colors active:opacity-60">
                <MoreVertical size={21} />
              </button>
            </div>
          </div>

          {/* Inline search */}
          {showSearch && (
            <div className="px-4 pb-3">
              <div
                className="flex items-center gap-3 px-4 rounded-full"
                style={{ background: C.inputBg, height: 40 }}
              >
                <Search size={16} style={{ color: C.text3 }} className="shrink-0" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Pesquisar negócios…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 bg-transparent outline-none text-[15px]"
                  style={{ color: C.text }}
                />
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ── Filter tabs ── */}
      <div
        className="shrink-0 flex gap-2 px-4 py-2"
        style={{ background: C.white, borderBottom: `1px solid ${C.border}` }}
      >
        <span
          className="text-[13px] font-semibold px-3 py-1 rounded-full"
          style={{ background: C.greenLight, color: C.greenDark }}
        >
          Todas
        </span>
        <span
          className="text-[13px] font-medium px-3 py-1 rounded-full"
          style={{ background: C.inputBg, color: C.text2 }}
        >
          Com IA
        </span>
      </div>

      {/* ── Business list ── */}
      <div className="flex-1 overflow-y-auto min-h-0" style={{ background: C.white }}>
        {loading ? (
          <>
            <SkeletonRow /><SkeletonRow /><SkeletonRow /><SkeletonRow />
          </>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
            <Building2 size={40} style={{ color: C.text3 }} />
            <p className="text-[14px]" style={{ color: C.text2 }}>Erro ao carregar. Tenta de novo.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
            <Building2 size={40} style={{ color: C.text3 }} />
            <p className="text-[14px]" style={{ color: C.text2 }}>
              {search ? `Sem resultados para "${search}"` : "Nenhum negócio disponível ainda."}
            </p>
          </div>
        ) : (
          filtered.map((b) => <BusinessRow key={b.id} b={b} />)
        )}
      </div>

      {/* ── Footer ── */}
      <div
        className="shrink-0 flex items-center justify-between px-4 py-4"
        style={{
          background: C.bg,
          borderTop: `1px solid ${C.border}`,
          paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
        }}
      >
        <span className="text-[13px]" style={{ color: C.text3 }}>
          © {new Date().getFullYear()} Linkealls
        </span>
        <Link href="/login">
          <button
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-semibold"
            style={{ background: C.green, color: "#fff" }}
          >
            <LogIn size={14} /> Entrar
          </button>
        </Link>
      </div>
    </div>
  );
}
