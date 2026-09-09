/**
 * Vendas — design premium, fundo #F8F9FA, safe-area, 16px horizontal padding.
 */
import { useState, useEffect, useCallback } from "react";
import { RefreshCw, ShoppingCart, CheckCircle2, Clock, XCircle, FlaskConical } from "lucide-react";
import { OwnerNav } from "../../components/owner/OwnerNav";
import { WaSkeletonList } from "../../components/wa/WaSkeletonList";
import { WaEmptyState } from "../../components/wa/WaEmptyState";
import { useBusinessSlug } from "../../hooks/useBusinessSlug";
import { businessApi, type Order } from "../../lib/api";
import { C } from "../../theme";
import { AppHeader, AppIconButton } from "../../components/app/AppHeader";
import { StatCard } from "../../components/app/StatCard";

const D = {
  bg:       "#F6F9FC",
  surface:  "#FFFFFF",
  ink:      "#0A2540",
  inkSoft:  "#425466",
  inkFaint: "#8898AA",
  border:   "#E6EBF1",
  borderS:  "#F1F4F8",
  green:    "#2E8B72",
  greenDk:  "#176B55",
  greenLt:  "#E8F7F1",
  px:       16,
} as const;

function fmtKz(v: string | number): string {
  const n = typeof v === "string" ? Number(v) : v;
  return `${n.toLocaleString("pt-AO", { maximumFractionDigits: 2 })} Kz`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const STATUS_UI: Record<Order["status"], { label: string; bg: string; color: string; Icon: typeof Clock }> = {
  paga:     { label: "Paga",     bg: "#F0FDF4", color: "#15803D", Icon: CheckCircle2 },
  pendente: { label: "Pendente", bg: "#FFFBEB", color: "#B45309", Icon: Clock },
  expirada: { label: "Expirada", bg: D.borderS, color: D.inkFaint, Icon: XCircle },
  falhada:  { label: "Falhada",  bg: "#FEF2F2", color: "#DC2626", Icon: XCircle },
};

function OrderRow({ order, last = false }: { order: Order; last?: boolean }) {
  const ui = STATUS_UI[order.status];
  return (
    <div
      className="flex items-center gap-3"
      style={{
        background: D.surface,
        borderBottom: last ? "none" : `1px solid ${D.borderS}`,
        padding: `12px ${D.px}px`,
      }}
    >
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate" style={{ color: D.ink, fontSize: 15 }}>
          {order.quantity > 1 ? `${order.quantity}× ` : ""}{order.offeringName}
        </p>
        <p className="truncate mt-0.5" style={{ color: D.inkSoft, fontSize: 13 }}>
          {order.buyerName ? `${order.buyerName} · ` : ""}{order.buyerPhone} · {fmtDate(order.createdAt)}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <p className="font-bold tabular-nums" style={{ color: order.status === "paga" ? D.green : D.ink, fontSize: 15 }}>
          {fmtKz(order.amount)}
        </p>
        <span
          className="flex items-center gap-1 font-semibold rounded-lg"
          style={{ background: ui.bg, color: ui.color, fontSize: 11, padding: "2px 8px" }}
        >
          <ui.Icon size={10} strokeWidth={2} /> {ui.label}
        </span>
      </div>
    </div>
  );
}

export function Vendas() {
  const slug = useBusinessSlug();
  const [orders, setOrders] = useState<Order[]>([]);
  const [simulation, setSimulation] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true); setError(null);
    try {
      const res = await businessApi(slug).listOrders();
      setOrders(res.orders); setSimulation(res.simulation);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar vendas");
    } finally { setLoading(false); }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  const paidTotal = orders.filter((o) => o.status === "paga").reduce((s, o) => s + Number(o.amount), 0);
  const paidCount = orders.filter((o) => o.status === "paga").length;

  return (
    <div className="flex flex-col h-full" style={{ background: D.bg }}>

      {/* Header */}
      <div className="shrink-0" style={{ background: D.surface, borderBottom: `1px solid ${D.border}` }}>
        <AppHeader
          title="Vendas"
          actions={
            <AppIconButton label="Actualizar" onClick={() => void load()}>
            <RefreshCw size={18} strokeWidth={1.75} />
            </AppIconButton>
          }
        />

        {/* Summary cards */}
        <div className="flex gap-3" style={{ padding: `0 ${D.px}px 16px` }}>
          <StatCard label="Total vendido" value={fmtKz(paidTotal)} tone="success" />
          <StatCard label="Vendas pagas" value={paidCount} />
        </div>
      </div>

      {/* Simulation banner */}
      {simulation && (
        <div
          className="shrink-0 flex items-center gap-2"
          style={{
            background: "#FFFBEB", color: "#B45309",
            border: `1px solid #FDE68A`,
            borderRadius: 10,
            margin: `12px ${D.px}px 0`,
            padding: "10px 14px",
            fontSize: 12,
          }}
        >
          <FlaskConical size={14} className="shrink-0" strokeWidth={1.75} />
          Modo de simulação — os pagamentos não usam dinheiro real.
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto" style={{ background: D.surface, borderTop: `1px solid ${D.border}`, marginTop: 12 }}>
        {error && (
          <div
            className="flex items-center gap-2"
            style={{
              background: "#FEF2F2", color: "#DC2626",
              border: `1px solid #FECACA`,
              borderRadius: 10,
              margin: `12px ${D.px}px`,
              padding: "10px 14px",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
        {loading && <WaSkeletonList count={6} />}
        {!loading && !error && orders.length === 0 && (
          <WaEmptyState
            icon={<ShoppingCart size={32} strokeWidth={1.75} />}
            iconBg={D.greenLt}
            iconColor={D.green}
            title="Ainda sem vendas"
            subtitle="Quando alguém comprar no teu catálogo com Multicaixa Express, aparece aqui."
          />
        )}
        {!loading && orders.map((o, i) => (
          <OrderRow key={o.id} order={o} last={i === orders.length - 1} />
        ))}
      </div>

      <OwnerNav />
    </div>
  );
}
