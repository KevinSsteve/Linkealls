/**
 * Mercado — vitrine pública de todos os negócios na plataforma.
 * Aparência inspirada na página "Atualizações" do WhatsApp Business:
 *   - Cards de status horizontais no topo (negócios com IA activa em destaque)
 *   - Lista de negócios abaixo, estilo WA conversation row
 */
import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { ShoppingBag, ChevronRight, RefreshCw } from "lucide-react";
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

// ─── Avatar palettes ──────────────────────────────────────────────────────────
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

// ─── Status Card (WA Atualizações style) ──────────────────────────────────────
function StatusCard({ business }: { business: Business }) {
  const pal = avatarPalette(business.name);
  return (
    <Link href={`/e/${business.slug}`}>
      <div className="flex flex-col items-center gap-1.5 cursor-pointer select-none" style={{ width: 72 }}>
        {/* Avatar with green ring if AI active */}
        <div
          className="rounded-full p-[2.5px] shrink-0"
          style={{
            background: business.hasActiveAI
              ? `linear-gradient(135deg, ${C.green}, #128C7E)`
              : C.border,
          }}
        >
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-[18px] font-bold border-2 border-white"
            style={{ background: pal.bg, color: pal.text }}
          >
            {initials(business.name)}
          </div>
        </div>
        {/* Name */}
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

// ─── Business Row (WA conversation row style) ─────────────────────────────────
function BusinessRow({ business }: { business: Business }) {
  const pal = avatarPalette(business.name);
  return (
    <Link href={`/e/${business.slug}`}>
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer active:bg-gray-50 transition-colors"
        style={{ background: C.white, borderBottom: `1px solid ${C.border}` }}
      >
        {/* Avatar */}
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-[16px] font-bold shrink-0"
          style={{ background: pal.bg, color: pal.text }}
        >
          {initials(business.name)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-[15px] truncate" style={{ color: C.text }}>
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
          <p className="text-[13px] truncate mt-0.5" style={{ color: C.text2 }}>
            {business.sector || business.description || "Negócio local"}
          </p>
        </div>

        {/* Arrow */}
        <ChevronRight size={16} style={{ color: C.text3 }} className="shrink-0" />
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
  const { businesses } = await res.json() as { businesses: Business[] };
  return businesses;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function Mercado() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBusinesses();
      // Sort: AI-active first, then alphabetical
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

  return (
    <div className="flex flex-col h-full wa-page" style={{ background: C.bg }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className="shrink-0 flex items-center justify-between px-4 pt-6 pb-2"
        style={{ background: C.white }}
      >
        <h1 className="text-[26px] font-extrabold tracking-tight" style={{ color: "#0B141A" }}>
          Mercado
        </h1>
        <button
          onClick={() => void load()}
          className="p-1.5 rounded-full transition-colors"
          style={{ color: "#54656F" }}
          aria-label="Actualizar"
        >
          <RefreshCw size={20} strokeWidth={1.8} />
        </button>
      </div>

      {/* ── Status cards — horizontal scroll ───────────────────────────────── */}
      {!loading && activeAI.length > 0 && (
        <div className="shrink-0" style={{ background: C.white, borderBottom: `1px solid ${C.border}` }}>
          <p
            className="px-4 pt-3 pb-1 text-[12px] font-semibold uppercase tracking-wider"
            style={{ color: C.text2 }}
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

      {/* ── Business list ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        {/* Section header */}
        {!loading && businesses.length > 0 && (
          <p
            className="shrink-0 px-4 py-2 text-[12px] font-semibold uppercase tracking-wider"
            style={{ background: C.bg, color: C.text2 }}
          >
            {businesses.length} negócio{businesses.length !== 1 ? "s" : ""}
          </p>
        )}

        {/* Error */}
        {error && (
          <div
            className="mx-4 mt-3 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px]"
            style={{ background: C.errorBg, color: C.errorText, border: `1px solid ${C.errorBorder}` }}
          >
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && <WaSkeletonList count={5} />}

        {/* Empty state */}
        {!loading && businesses.length === 0 && !error && (
          <WaEmptyState
            icon={<ShoppingBag size={36} />}
            iconBg="#E8F5E9"
            iconColor={C.green}
            title="Mercado vazio"
            subtitle="Ainda não existem negócios registados na plataforma."
          />
        )}

        {/* List */}
        {!loading && businesses.length > 0 && (
          <div>
            {businesses.map((b) => (
              <BusinessRow key={b.id} business={b} />
            ))}
          </div>
        )}
      </div>

      <OwnerNav />
    </div>
  );
}
