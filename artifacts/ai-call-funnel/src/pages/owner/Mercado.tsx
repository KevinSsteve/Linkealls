/**
 * Mercado — vitrine pública de todos os negócios na plataforma.
 * Design premium: fundo quente #F6F6F4, bordas suaves, tipografia limpa.
 * Clicar num negócio navega para o catálogo público desse negócio.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { ShoppingBag, RefreshCw, Search } from "lucide-react";
import { OwnerNav } from "../../components/owner/OwnerNav";
import { WaSkeletonList } from "../../components/wa/WaSkeletonList";
import { WaEmptyState } from "../../components/wa/WaEmptyState";
import { AppHeader, AppIconButton } from "../../components/app/AppHeader";
import { SearchBar } from "../../components/app/SearchBar";
import { BusinessListItem } from "../../components/app/BusinessListItem";

// ─── Design tokens locais ────────────────────────────────────────────────────
const D = {
  bg:       "#F6F9FC",
  surface:  "#FFFFFF",
  ink:      "#0A2540",
  inkSoft:  "#425466",
  inkFaint: "#8898AA",
  line:     "#E6EBF1",
  lineSoft: "#F1F4F8",
  subtle:   "#F1F5F9",
  green:    "#635BFF",
  greenDk:  "#5046E5",
  greenLt:  "#EEECFF",
  errorBg:  "#FEF2F2",
  errorText:"#DC2626",
  errorBorder:"#FECACA",
  rCard:    "20px",
  rBtn:     "999px",
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────
interface Business {
  id: number;
  slug: string;
  name: string;
  sector: string;
  description: string;
  hasActiveAI: boolean;
  catalogEnabled: boolean;
}

// ─── Avatar helpers ───────────────────────────────────────────────────────────
const PALETTES = [
  { bg: "#F3E5F5", text: "#6A1B9A" },
  { bg: "#E3F2FD", text: "#0D47A1" },
  { bg: "#FCE4EC", text: "#880E4F" },
  { bg: "#E8F5E9", text: "#1B5E20" },
  { bg: "#FFF3E0", text: "#E65100" },
  { bg: "#E0F7FA", text: "#006064" },
  { bg: "#FFF8E1", text: "#F57F17" },
  { bg: "#EDE7F6", text: "#4527A0" },
];
function avatarPalette(name: string) {
  let h = 0;
  for (const c of name) h = h * 31 + c.charCodeAt(0);
  return PALETTES[Math.abs(h) % PALETTES.length]!;
}
function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

// ─── Status Card — negócios com IA activa ─────────────────────────────────────
function StatusCard({ business }: { business: Business }) {
  const pal = avatarPalette(business.name);
  return (
    <Link href={`/e/${business.slug}`}>
      <div
        className="flex flex-col items-center gap-2 cursor-pointer select-none shrink-0"
        style={{ width: 64 }}
      >
        {/* Anel verde = IA activa */}
        <div
          className="rounded-full shrink-0"
          style={{
            padding: 2,
            background: `conic-gradient(${D.green} 0%, ${D.greenDk} 100%)`,
          }}
        >
          <div
            className="w-[56px] h-[56px] rounded-full flex items-center justify-center font-bold text-[18px]"
            style={{
              background: pal.bg,
              color: pal.text,
              border: "2.5px solid #FFFFFF",
            }}
          >
            {initials(business.name)}
          </div>
        </div>
        <p
          className="text-[10.5px] leading-tight text-center w-full truncate font-medium"
          style={{ color: D.ink }}
        >
          {business.name}
        </p>
      </div>
    </Link>
  );
}

// ─── Business Row ─────────────────────────────────────────────────────────────
function BusinessRow({ business, last = false }: { business: Business; last?: boolean }) {
  return (
    <div className={last ? "app-business-list-last" : ""}>
      <BusinessListItem
        name={business.name}
        description={business.sector || business.description || "Negócio local"}
        hasActiveAI={business.hasActiveAI}
        href={`/e/${business.slug}`}
      />
    </div>
  );
}

// ─── API ──────────────────────────────────────────────────────────────────────
const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "")
  ? `${import.meta.env.BASE_URL}api`
  : "/api";

async function fetchBusinesses(): Promise<Business[]> {
  const res = await fetch(`${API_BASE}/businesses`);
  if (!res.ok) throw new Error("Erro ao carregar negócios");
  const { businesses } = (await res.json()) as { businesses: Business[] };
  return businesses;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function Mercado() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBusinesses();
      data.sort((a, b) => {
        if (a.hasActiveAI !== b.hasActiveAI) return a.hasActiveAI ? -1 : 1;
        return a.name.localeCompare(b.name, "pt");
      });
      setBusinesses(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeAI = businesses.filter((b) => b.hasActiveAI);

  const filtered = useMemo(() => {
    if (!query.trim()) return businesses;
    const q = query.toLowerCase();
    return businesses.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.sector.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q),
    );
  }, [businesses, query]);

  return (
    <div className="flex flex-col h-full" style={{ background: D.bg }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className="shrink-0"
        style={{ background: D.surface, borderBottom: `1px solid ${D.line}` }}
      >
        <AppHeader
          title="Mercado"
          actions={
            <AppIconButton label="Actualizar" onClick={() => void load()}>
              <RefreshCw size={18} strokeWidth={1.8} />
            </AppIconButton>
          }
        />

        <div style={{ padding: "0 var(--page-padding-mobile) 16px" }}>
          <SearchBar value={query} onChange={setQuery} />
        </div>
      </div>

      {/* ── Com IA activa ──────────────────────────────────────────────────── */}
      {!loading && !query && activeAI.length > 0 && (
        <div
          className="shrink-0 mt-3 mx-5 overflow-hidden"
          style={{
            background: D.surface,
            border: `1px solid ${D.line}`,
            borderRadius: D.rCard,
          }}
        >
          <p
            className="font-semibold uppercase tracking-widest"
            style={{
              color: D.inkFaint,
              fontSize: 10.5,
              letterSpacing: "0.12em",
              padding: "12px 16px 4px",
            }}
          >
            Com IA activa
          </p>
          <div className="flex gap-4 px-4 py-3 overflow-x-auto scrollbar-none">
            {activeAI.map((b) => (
              <StatusCard key={b.id} business={b} />
            ))}
          </div>
        </div>
      )}

      {/* ── Lista de negócios ──────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto flex flex-col mt-3 mx-5 mb-2 overflow-hidden"
        style={{
          background: D.surface,
          border: `1px solid ${D.line}`,
          borderRadius: D.rCard,
        }}
      >
        {/* Erro */}
        {error && (
          <div
            className="m-4 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px]"
            style={{
              background: D.errorBg,
              color: D.errorText,
              border: `1px solid ${D.errorBorder}`,
            }}
          >
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && <WaSkeletonList count={6} />}

        {/* Vazio — sem negócios */}
        {!loading && businesses.length === 0 && !error && (
          <WaEmptyState
            icon={<ShoppingBag size={32} />}
            iconBg={D.greenLt}
            iconColor={D.green}
            title="Mercado vazio"
            subtitle="Ainda não existem negócios registados na plataforma."
          />
        )}

        {/* Vazio — sem resultados de pesquisa */}
        {!loading && businesses.length > 0 && filtered.length === 0 && (
          <WaEmptyState
            icon={<Search size={32} />}
            iconBg={D.subtle}
            iconColor={D.inkFaint}
            title={`Sem resultados para "${query}"`}
            subtitle="Tenta um nome de negócio ou sector diferente."
          />
        )}

        {/* Lista */}
        {!loading && filtered.length > 0 && (
          <div>
            {filtered.map((b, i) => (
              <BusinessRow key={b.id} business={b} last={i === filtered.length - 1} />
            ))}
            <p
              className="text-center py-4"
              style={{ color: D.inkFaint, fontSize: 12 }}
            >
              {filtered.length} negócio{filtered.length !== 1 ? "s" : ""}
              {query ? " encontrado" + (filtered.length !== 1 ? "s" : "") : ""}
            </p>
          </div>
        )}
      </div>

      <OwnerNav />
    </div>
  );
}
