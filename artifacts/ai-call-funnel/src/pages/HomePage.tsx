/**
 * Linkealls — Landing page & business directory.
 * Fetches all public businesses and renders a card grid.
 * Also injects JSON-LD (WebSite + ItemList) for GEO/SEO.
 */
import { useState, useEffect } from "react";
import { Link, Redirect } from "wouter";
import { Building2, ChevronRight, Loader2, Zap, LogIn, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { userLogout } from "@/lib/api";

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

// ─── Business card ───────────────────────────────────────────────────────────

function BusinessCard({ b }: { b: Business }) {
  return (
    <Link href={`/e/${b.slug}`}>
      <div
        className="group block rounded-2xl p-5 transition-all cursor-pointer hover:-translate-y-0.5"
        style={{
          background: "#0D1826",
          border: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
        }}
      >
        <div className="flex items-start justify-between mb-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "#00A88415", border: "1px solid #00A88430" }}
          >
            <Building2 size={18} className="text-[#00A884]" />
          </div>
          <ChevronRight
            size={16}
            className="text-[#3E576F] group-hover:text-[#00A884] transition-colors mt-1"
          />
        </div>

        <h3 className="font-semibold text-[#EAF0F7] mb-0.5 truncate leading-snug">
          {b.name}
        </h3>
        <p className="text-xs font-medium mb-2" style={{ color: "#00A884" }}>
          {b.sector}
        </p>
        <p className="text-sm text-[#7B96B2] line-clamp-2 leading-relaxed">
          {b.description}
        </p>

        <div
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
          style={{ background: "#00A88415", color: "#00A884" }}
        >
          <Zap size={10} fill="currentColor" />
          Assistente IA
        </div>
      </div>
    </Link>
  );
}

// ─── Skeleton placeholder ─────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="rounded-2xl p-5 animate-pulse"
      style={{ background: "#0D1826", border: "1px solid rgba(255,255,255,0.04)" }}
    >
      <div className="w-10 h-10 rounded-xl mb-4" style={{ background: "#141E2E" }} />
      <div className="h-4 rounded mb-2" style={{ background: "#141E2E", width: "60%" }} />
      <div className="h-3 rounded mb-3" style={{ background: "#141E2E", width: "40%" }} />
      <div className="h-3 rounded mb-1.5" style={{ background: "#141E2E" }} />
      <div className="h-3 rounded" style={{ background: "#141E2E", width: "80%" }} />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function HomePage() {
  const { user, isLoggedIn, token, logout } = useAuth();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Logged-in users land on their conversations page
  if (isLoggedIn) return <Redirect to="/conversas" />;

  const handleLogout = async () => {
    if (token) await userLogout(token).catch(() => {});
    logout();
  };

  useEffect(() => {
    fetch(`${API_BASE}/businesses`)
      .then((r) => r.json())
      .then(({ businesses }) => setBusinesses(businesses ?? []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  // Inject JSON-LD for GEO/SEO (WebSite + ItemList)
  useEffect(() => {
    if (businesses.length === 0) return;

    const origin = window.location.origin;

    const ld = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          "@id": `${origin}/#website`,
          url: `${origin}/`,
          name: "Linkealls",
          description:
            "Diretório de negócios angolanos com assistente IA integrado.",
          inLanguage: "pt-AO",
        },
        {
          "@type": "ItemList",
          "@id": `${origin}/#businesses`,
          name: "Negócios no Linkealls",
          numberOfItems: businesses.length,
          itemListElement: businesses.map((b, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `${origin}/e/${b.slug}/`,
            name: b.name,
            description: b.description,
          })),
        },
      ],
    };

    const script = document.createElement("script");
    script.id = "linkealls-jsonld";
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(ld);
    document.head.appendChild(script);
    return () => {
      document.getElementById("linkealls-jsonld")?.remove();
    };
  }, [businesses]);

  return (
    <div
      className="min-h-screen"
      style={{ background: "linear-gradient(180deg, #060C14 0%, #080E18 100%)" }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-10 backdrop-blur-md"
        style={{
          background: "rgba(6,12,20,0.85)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{
                background: "linear-gradient(135deg, #00A884 0%, #007A62 100%)",
              }}
            >
              L
            </div>
            <span className="font-bold text-[17px] text-[#EAF0F7] tracking-tight">
              Linkealls
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="text-xs px-2.5 py-1 rounded-full font-medium"
              style={{ background: "#00A88415", color: "#00A884", border: "1px solid #00A88430" }}
            >
              Angola
            </span>

            {isLoggedIn ? (
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium"
                style={{ background: "#0D1826", color: "#7B96B2", border: "1px solid rgba(255,255,255,0.08)" }}
                title={`Sair (${user?.name})`}
              >
                <LogOut size={13} />
                <span className="hidden sm:inline">{user?.name?.split(" ")[0]}</span>
              </button>
            ) : (
              <Link href="/login">
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold"
                  style={{ background: "#00A88415", color: "#00A884", border: "1px solid #00A88430" }}
                >
                  <LogIn size={13} />
                  Entrar
                </button>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-8"
          style={{
            background: "#00A88415",
            border: "1px solid #00A88430",
            color: "#00A884",
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#00A884] animate-pulse" />
          Assistentes IA em tempo real
        </div>

        <h1 className="text-4xl md:text-5xl font-bold mb-5 leading-tight text-[#EAF0F7]">
          Encontra negócios locais.
          <br />
          <span style={{ color: "#00A884" }}>Fala com a IA deles.</span>
        </h1>

        <p className="text-lg text-[#7B96B2] max-w-lg mx-auto leading-relaxed">
          Cada negócio tem o seu assistente inteligente. Faz perguntas, recebe
          respostas e liga direto — tudo num clique.
        </p>
      </section>

      {/* ── Business grid ──────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <h2 className="text-xs font-semibold text-[#3E576F] uppercase tracking-widest mb-6">
          Negócios disponíveis{!loading && businesses.length > 0 && ` · ${businesses.length}`}
        </h2>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : error ? (
          <div className="text-center py-20 text-[#3E576F]">
            <Building2 size={40} className="mx-auto mb-3 opacity-30" />
            <p>Erro ao carregar negócios. Tenta de novo.</p>
          </div>
        ) : businesses.length === 0 ? (
          <div className="text-center py-20 text-[#3E576F]">
            <Building2 size={40} className="mx-auto mb-3 opacity-30" />
            <p>Nenhum negócio disponível ainda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {businesses.map((b) => (
              <BusinessCard key={b.id} b={b} />
            ))}
          </div>
        )}
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[#3E576F]">
          <span>© {new Date().getFullYear()} Linkealls</span>
          <span>O diretório de negócios angolanos com IA</span>
        </div>
      </footer>
    </div>
  );
}
