/**
 * Vendas — owner list of catalog orders paid via Multicaixa Express.
 */
import { useState, useEffect, useCallback } from "react";
import { RefreshCw, ShoppingCart, CheckCircle2, Clock, XCircle, FlaskConical } from "lucide-react";
import { OwnerNav } from "../../components/owner/OwnerNav";
import { WaSkeletonList } from "../../components/wa/WaSkeletonList";
import { WaEmptyState } from "../../components/wa/WaEmptyState";
import { useBusinessSlug } from "../../hooks/useBusinessSlug";
import { businessApi, type Order } from "../../lib/api";
import { C } from "../../theme";

function fmtKz(v: string | number): string {
  const n = typeof v === "string" ? Number(v) : v;
  return `${n.toLocaleString("pt-AO", { maximumFractionDigits: 2 })} Kz`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_UI: Record<Order["status"], { label: string; bg: string; color: string; Icon: typeof Clock }> = {
  paga:     { label: "Paga",     bg: C.successBg, color: C.successText, Icon: CheckCircle2 },
  pendente: { label: "Pendente", bg: C.warnBg,    color: C.warnText,    Icon: Clock },
  expirada: { label: "Expirada", bg: "#F3F4F6",   color: "#6B7280",     Icon: XCircle },
  falhada:  { label: "Falhada",  bg: C.errorBg,   color: C.errorText,   Icon: XCircle },
};

function OrderRow({ order }: { order: Order }) {
  const ui = STATUS_UI[order.status];
  return (
    <div className="px-4 py-3 flex items-center gap-3" style={{ background: C.white, borderBottom: `1px solid ${C.border}` }}>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[15px] truncate" style={{ color: C.text }}>
          {order.quantity > 1 ? `${order.quantity}× ` : ""}{order.offeringName}
        </p>
        <p className="text-[13px] truncate mt-0.5" style={{ color: C.text2 }}>
          {order.buyerName ? `${order.buyerName} · ` : ""}{order.buyerPhone} · {fmtDate(order.createdAt)}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <p className="font-bold text-[15px] tabular-nums" style={{ color: order.status === "paga" ? C.green : C.text }}>
          {fmtKz(order.amount)}
        </p>
        <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: ui.bg, color: ui.color }}>
          <ui.Icon size={11} /> {ui.label}
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
    setLoading(true);
    setError(null);
    try {
      const res = await businessApi(slug).listOrders();
      setOrders(res.orders);
      setSimulation(res.simulation);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar vendas");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  const paidTotal = orders
    .filter((o) => o.status === "paga")
    .reduce((s, o) => s + Number(o.amount), 0);
  const paidCount = orders.filter((o) => o.status === "paga").length;

  return (
    <div className="flex flex-col h-full wa-page" style={{ background: "#F3F4F6" }}>
      {/* Header */}
      <div className="shrink-0" style={{ background: C.white }}>
        <div className="flex items-center justify-between px-4 pt-5 pb-3">
          <h1 className="text-[26px] font-extrabold tracking-tight" style={{ color: "#111827" }}>Vendas</h1>
          <button onClick={() => void load()} className="p-1.5 rounded-full active:bg-[#F3F4F6]" aria-label="Actualizar" style={{ color: "#6B7280" }}>
            <RefreshCw size={20} strokeWidth={1.8} />
          </button>
        </div>
        {/* Summary */}
        <div className="px-4 pb-4 flex gap-3">
          <div className="flex-1 rounded-2xl px-4 py-3" style={{ background: C.greenMuted, border: `1px solid ${C.successBorder}` }}>
            <p className="text-[12px] font-medium" style={{ color: C.text2 }}>Total vendido</p>
            <p className="text-[20px] font-extrabold tabular-nums" style={{ color: C.greenDark }}>{fmtKz(paidTotal)}</p>
          </div>
          <div className="flex-1 rounded-2xl px-4 py-3" style={{ background: "#F9FAFB", border: `1px solid ${C.border}` }}>
            <p className="text-[12px] font-medium" style={{ color: C.text2 }}>Vendas pagas</p>
            <p className="text-[20px] font-extrabold tabular-nums" style={{ color: C.text }}>{paidCount}</p>
          </div>
        </div>
      </div>

      {simulation && (
        <div className="shrink-0 mx-4 mt-2 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[12px]"
          style={{ background: C.warnBg, color: C.warnText, border: `1px solid ${C.warnBorder}` }}>
          <FlaskConical size={14} className="shrink-0" />
          Modo de simulação — os pagamentos não usam dinheiro real.
        </div>
      )}

      <div className="flex-1 overflow-y-auto flex flex-col mt-2" style={{ background: C.white }}>
        {error && (
          <div className="mx-4 mt-3 rounded-xl px-3.5 py-2.5 text-[13px]" style={{ background: C.errorBg, color: C.errorText, border: `1px solid ${C.errorBorder}` }}>
            {error}
          </div>
        )}
        {loading && <WaSkeletonList count={6} />}
        {!loading && !error && orders.length === 0 && (
          <WaEmptyState
            icon={<ShoppingCart size={36} />}
            iconBg="#E8F5E9"
            iconColor={C.green}
            title="Ainda sem vendas"
            subtitle="Quando alguém comprar no teu catálogo com Multicaixa Express, aparece aqui."
          />
        )}
        {!loading && orders.map((o) => <OrderRow key={o.id} order={o} />)}
      </div>

      <OwnerNav />
    </div>
  );
}
