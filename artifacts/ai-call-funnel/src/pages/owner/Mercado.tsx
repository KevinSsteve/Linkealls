/**
 * Mercado — vitrine pública de todos os negócios na plataforma.
 * Design: WhatsApp Business "Conversas" list — header bold, search bar pill,
 * status cards horizontais, lista de negócios com avatar e chevron.
 * Clicar num negócio navega para o catálogo público desse negócio.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { ShoppingBag, RefreshCw, Search, ChevronRight } from "lucide-react";
import { OwnerNav } from "../../components/owner/OwnerNav";
import { WaSkeletonList } from "../../components/wa/WaSkeletonList";
import { WaEmptyState } from "../../components/wa/WaEmptyState";
import { C } from "../../theme";

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
  return PALETTES[Math.abs(h) % PALETTES.length];
}
function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

// ─── Status Card — WA Atualizações style ──────────────────────────────────────
function StatusCard({ business }: { business: Business }) {
  const pal = avatarPalette(business.name);
  return (
    <Link href={`/e/${business.slug}`}>
      <div
        className="flex flex-col items-center gap-1.5 cursor-pointer select-none shrink-0"
        style={{ width: 68 }}
      >
        {/* Green ring = AI active */}
        <div
          className="rounded-full shrink-0"
          style={{
            padding: 2.5,
            background: `conic-gradient(${C.green} 0%, #128C7E 100%)`,
          }}
        >
          <div
            className="w-[52px] h-[52px] rounded-full flex items-center justify-center font-bold text-[18px]"
            style={{
              background: pal?.bg,
              color: pal?.text,
              border: "2px solid #FFFFFF",
            }}
          >
            {initials(business.name)}
          </div>
        </div>
        <p
          className="text-[11px] leading-tight text-center w-full truncate"
          style={{ color: C.text, fontWeight: 500 }}
        >
          {business.name}
        </p>
      </div>
    </Link>
  );
}

// ─── Business Row — WA conversation row style ─────────────────────────────────
function BusinessRow({ business }: { business: Business }) {
  const pal = avatarPalette(business.name);
  return (
    <Link href={`/e/${business.slug}`}>
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer active:bg-[#F5F6F6] transition-colors"
        style={{ background: C.white, borderBottom: `1px solid ${C.border}` }}
      >
        {/* Avatar */}
        <div
          className="w-[52px] h-[52px] rounded-full flex items-center justify-center font-bold text-[18px] shrink-0"
          style={{ background: pal?.bg, color: pal?.text }}
        >
          {initials(business.name)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 py-0.5">
          <div className="flex items-center gap-2">
            <p
              className="font-semibold text-[16px] truncate"
              style={{ color: "#111B21" }}
            >
              {business.name}
            </p>
            {business.hasActiveAI && (
              <span
                className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: C.successBg, color: C.successText }}
              >
                IA
              </span>
            )}
          </div>
          <p
            className="text-[14px] truncate mt-0.5"
            style={{ color: C.text2 }}
          >
            {business.sector || business.description || "Negócio local"}
          </p>
        </div>

        <ChevronRight size={16} style={{ color: "#C4C4C4" }} className="shrink-0" />
      </div>
    </Link>
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
    <div className="flex flex-col h-full wa-page" style={{ background: "#F0F2F5" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0" style={{ background: C.white }}>
        {/* Title row */}
        <div className="flex items-center justify-between px-4 pt-5 pb-2">
          <h1
            className="text-[26px] font-extrabold tracking-tight"
            style={{ color: "#0B141A" }}
          >
            Mercado
          </h1>
          <button
            onClick={() => void load()}
            className="p-1.5 rounded-full transition-colors active:bg-[#F0F2F5]"
            aria-label="Actualizar"
            style={{ color: "#54656F" }}
          >
            <RefreshCw size={20} strokeWidth={1.8} />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-4 pb-3">
          <div
            className="flex items-center gap-2.5 px-4 rounded-full"
            style={{ background: "#F0F2F5", height: 44 }}
          >
            <Search size={16} className="shrink-0" style={{ color: "#8696A0" }} />
            <input
              type="text"
              placeholder="Pesquisar..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-[15px] outline-none"
              style={{ color: "#111B21" }}
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="shrink-0"
                style={{ color: "#8696A0" }}
                aria-label="Limpar"
              >
                ×
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Status cards — IA activa ────────────────────────────────────────── */}
      {!loading && !query && activeAI.length > 0 && (
        <div
          className="shrink-0 mt-2"
          style={{ background: C.white, borderBottom: `1px solid ${C.border}` }}
        >
          <p
            className="px-4 pt-3 pb-0 text-[12px] font-semibold"
            style={{ color: C.text2 }}
          >
            Com IA activa
          </p>
          <div className="flex gap-5 px-4 py-3 overflow-x-auto scrollbar-none">
            {activeAI.map((b) => (
              <StatusCard key={b.id} business={b} />
            ))}
          </div>
        </div>
      )}

      {/* ── Business list ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto flex flex-col mt-2" style={{ background: C.white }}>

        {/* Error */}
        {error && (
          <div
            className="mx-4 mt-3 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px]"
            style={{
              background: C.errorBg,
              color: C.errorText,
              border: `1px solid ${C.errorBorder}`,
            }}
          >
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && <WaSkeletonList count={6} />}

        {/* Empty — no businesses */}
        {!loading && businesses.length === 0 && !error && (
          <WaEmptyState
            icon={<ShoppingBag size={36} />}
            iconBg="#E8F5E9"
            iconColor={C.green}
            title="Mercado vazio"
            subtitle="Ainda não existem negócios registados na plataforma."
          />
        )}

        {/* Empty — no search results */}
        {!loading && businesses.length > 0 && filtered.length === 0 && (
          <WaEmptyState
            icon={<Search size={36} />}
            iconBg="#F0F2F5"
            iconColor={C.text3}
            title={`Sem resultados para "${query}"`}
            subtitle="Tenta um nome de negócio ou sector diferente."
          />
        )}

        {/* List */}
        {!loading && filtered.length > 0 && (
          <div>
            {filtered.map((b) => (
              <BusinessRow key={b.id} business={b} />
            ))}
            {/* Count footer */}
            <p
              className="text-center text-[12px] py-4"
              style={{ color: C.text3 }}
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
