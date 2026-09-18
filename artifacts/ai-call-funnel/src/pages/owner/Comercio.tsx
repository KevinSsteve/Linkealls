import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Clock3, FileCheck2, PackageCheck, RefreshCw, ShoppingBag, Truck, XCircle } from "lucide-react";
import { OwnerNav } from "../../components/owner/OwnerNav";
import { AppHeader, AppIconButton } from "../../components/app/AppHeader";
import { StatCard } from "../../components/app/StatCard";
import { WaEmptyState } from "../../components/wa/WaEmptyState";
import { WaSkeletonList } from "../../components/wa/WaSkeletonList";
import { useBusinessSlug } from "../../hooks/useBusinessSlug";
import { businessApi, type Order, type OrderAnalytics, type OrderEvent, type OrderFulfillmentStatus } from "../../lib/api";

const D = {
  bg: "var(--app-bg)",
  surface: "#FFFFFF",
  ink: "var(--ink)",
  inkSoft: "var(--ink-soft)",
  faint: "var(--ink-faint)",
  border: "var(--border)",
  soft: "#F1F4F8",
  green: "var(--green)",
  greenLt: "var(--green-light)",
  success: "#15803D",
} as const;

const FLOW: Array<{ value: OrderFulfillmentStatus; label: string }> = [
  { value: "novo", label: "Novo" },
  { value: "em_preparacao", label: "Em preparação" },
  { value: "pronto", label: "Pronto" },
  { value: "entregue", label: "Entregue" },
  { value: "cancelado", label: "Cancelado" },
];

function fmtKz(v: number | string) {
  return `${Number(v).toLocaleString("pt-AO", { maximumFractionDigits: 2 })} Kz`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function fulfillmentLabel(status: OrderFulfillmentStatus) {
  return FLOW.find((item) => item.value === status)?.label ?? status;
}

function OrderCard({
  order,
  selected,
  onSelect,
  onUpdate,
}: {
  order: Order;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (status: OrderFulfillmentStatus) => void;
}) {
  const needsAttention = order.status === "paga" && (order.proofStatus === "recebido" || order.lastFollowUpAt === null);
  return (
    <button
      onClick={onSelect}
      className="w-full text-left transition-colors hover:bg-[#FAFBFF]"
      style={{ background: D.surface, borderBottom: `1px solid ${D.soft}`, padding: "14px 16px" }}
      aria-expanded={selected}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: needsAttention ? "#FFF7ED" : D.greenLt, color: needsAttention ? "#C2410C" : D.green }}>
          {needsAttention ? <Clock3 size={18} /> : <PackageCheck size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-semibold" style={{ color: D.ink, fontSize: 14 }}>
              {order.quantity > 1 ? `${order.quantity}× ` : ""}{order.offeringName}
            </p>
            <span className="shrink-0 font-bold tabular-nums" style={{ color: order.status === "paga" ? D.success : D.ink, fontSize: 13 }}>
              {fmtKz(order.amount)}
            </span>
          </div>
          <p className="mt-1 truncate" style={{ color: D.inkSoft, fontSize: 12 }}>
            {order.buyerName ? `${order.buyerName} · ` : ""}{order.buyerPhone} · {fmtDate(order.createdAt)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full px-2 py-1 font-semibold" style={{ background: order.status === "paga" ? "#F0FDF4" : "#FFFBEB", color: order.status === "paga" ? D.success : "#B45309", fontSize: 10 }}>
              {order.status === "paga" ? "Pagamento confirmado" : order.status}
            </span>
            <span className="rounded-full px-2 py-1 font-semibold" style={{ background: D.soft, color: D.inkSoft, fontSize: 10 }}>
              {fulfillmentLabel(order.fulfillmentStatus)}
            </span>
            {order.proofStatus === "recebido" && (
              <span className="rounded-full px-2 py-1 font-semibold" style={{ background: "#FEF3C7", color: "#92400E", fontSize: 10 }}>Comprovativo para rever</span>
            )}
          </div>
        </div>
        <ChevronDown size={17} style={{ color: D.faint, transform: selected ? "rotate(180deg)" : undefined, transition: "transform .15s" }} />
      </div>
      {selected && (
        <div className="mt-3 rounded-xl" style={{ background: "#FAFBFF", border: `1px solid ${D.border}`, padding: 12 }} onClick={(event) => event.stopPropagation()}>
          <label className="block font-semibold" style={{ color: D.inkSoft, fontSize: 11 }}>
            Próximo estado
            <select
              value={order.fulfillmentStatus}
              onChange={(event) => onUpdate(event.target.value as OrderFulfillmentStatus)}
              className="mt-1 w-full rounded-lg bg-white px-3 outline-none"
              style={{ border: `1px solid ${D.border}`, color: D.ink, fontSize: 13, minHeight: 38 }}
            >
              {FLOW.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        </div>
      )}
    </button>
  );
}

export function Comercio() {
  const slug = useBusinessSlug();
  const [orders, setOrders] = useState<Order[]>([]);
  const [analytics, setAnalytics] = useState<OrderAnalytics | null>(null);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(() => orders.find((order) => order.id === selectedId) ?? null, [orders, selectedId]);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const api = businessApi(slug);
      const [ordersResult, analyticsResult] = await Promise.all([api.listOrders(), api.getOrderAnalytics()]);
      setOrders(ordersResult.orders);
      setAnalytics(analyticsResult.analytics);
      setSelectedId((current) => current ?? ordersResult.orders[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar o comércio.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!slug) return;
    const events = new EventSource(businessApi(slug).getOrdersEventsUrl());
    const refresh = () => { void load(); };
    events.addEventListener("order_changed", refresh);
    return () => {
      events.removeEventListener("order_changed", refresh);
      events.close();
    };
  }, [slug, load]);

  useEffect(() => {
    if (!slug || !selectedId) {
      setEvents([]);
      return;
    }
    businessApi(slug).listOrderEvents(selectedId).then((result) => setEvents(result.events)).catch(() => setEvents([]));
  }, [slug, selectedId]);

  async function updateStatus(orderId: string, status: OrderFulfillmentStatus) {
    if (!slug) return;
    setBusy(orderId);
    try {
      const result = await businessApi(slug).updateOrderFulfillment(orderId, status);
      setOrders((current) => current.map((order) => order.id === orderId ? result.order : order));
      const timeline = await businessApi(slug).listOrderEvents(orderId);
      setEvents(timeline.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível actualizar o estado.");
    } finally {
      setBusy(null);
    }
  }

  async function reviewProof(orderId: string, status: "aprovado" | "rejeitado") {
    if (!slug) return;
    setBusy(orderId);
    try {
      const result = await businessApi(slug).reviewOrderProof(orderId, status);
      setOrders((current) => current.map((order) => order.id === orderId ? result.order : order));
      const timeline = await businessApi(slug).listOrderEvents(orderId);
      setEvents(timeline.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível rever o comprovativo.");
    } finally {
      setBusy(null);
    }
  }

  async function openProof(orderId: string) {
    if (!slug) return;
    try {
      const blob = await businessApi(slug).downloadOrderProof(orderId);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível abrir o comprovativo.");
    }
  }

  return (
    <div className="owner-view-root" style={{ background: D.bg }}>
      <div className="shrink-0" style={{ background: D.surface, borderBottom: `1px solid ${D.border}` }}>
        <header className="owner-header justify-between">
          <div className="owner-header-title">Comércio</div>
          <button onClick={() => void load()} className="owner-icon-btn text-[var(--ink-soft)]" aria-label="Actualizar">
            <RefreshCw size={20} />
          </button>
        </header>
        {analytics && (
          <div className="grid grid-cols-2 gap-3 px-4 pb-4 pt-3">
            <StatCard label="Vendas pagas" value={fmtKz(analytics.grossSales)} tone="success" />
            <StatCard label="Pedidos pagos" value={analytics.paidOrders} />
            <StatCard label="A pedir atenção" value={analytics.awaitingProof + analytics.awaitingFollowUp} />
            <StatCard label="Pagamentos pendentes" value={analytics.pendingPayments} />
          </div>
        )}
      </div>

      {error && <div className="mx-4 mt-3 rounded-xl px-3 py-2.5 text-[12px]" style={{ background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>{error}</div>}

      <div className="owner-content-scroll">
        {loading && <WaSkeletonList count={6} />}
        {!loading && orders.length === 0 && (
          <WaEmptyState icon={<ShoppingBag size={32} />} iconBg={D.greenLt} iconColor={D.green} title="O teu comércio começa aqui" subtitle="Quando alguém comprar no catálogo, vais ver aqui o pedido, o próximo passo e a conversa relacionada." />
        )}
        {!loading && orders.length > 0 && (
          <>
            <div className="px-4 pb-2 pt-4">
              <p className="font-bold" style={{ color: D.ink, fontSize: 16 }}>Próximas acções</p>
              <p className="mt-1" style={{ color: D.inkSoft, fontSize: 12 }}>Não acompanhes só o dinheiro. Acompanha o que precisa de acontecer a seguir.</p>
            </div>
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} selected={selectedId === order.id} onSelect={() => setSelectedId((current) => current === order.id ? null : order.id)} onUpdate={(status) => void updateStatus(order.id, status)} />
            ))}
            {selected && (
              <section className="m-4 rounded-2xl bg-white p-4" style={{ border: `1px solid ${D.border}` }}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold" style={{ color: D.ink, fontSize: 15 }}>Acompanhamento</p>
                    <p className="mt-1" style={{ color: D.inkSoft, fontSize: 12 }}>{selected.leadId ? "Ligado à conversa do cliente" : "Pedido sem conversa ligada"}</p>
                  </div>
                  {busy === selected.id && <RefreshCw size={16} className="animate-spin" style={{ color: D.green }} />}
                </div>
                {selected.proofStatus === "recebido" && (
                  <div className="mt-4 rounded-xl p-3" style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
                    <div className="flex items-center gap-2 font-semibold" style={{ color: "#92400E", fontSize: 12 }}><FileCheck2 size={16} /> Comprovativo recebido</div>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => void openProof(selected.id)} className="flex-1 rounded-lg bg-white px-3 py-2 font-semibold" style={{ color: D.ink, fontSize: 12 }}>Abrir</button>
                      <button onClick={() => void reviewProof(selected.id, "aprovado")} className="flex-1 rounded-lg px-3 py-2 font-semibold" style={{ background: D.success, color: "#FFF", fontSize: 12 }}>Aprovar</button>
                      <button onClick={() => void reviewProof(selected.id, "rejeitado")} className="rounded-lg px-3 py-2 font-semibold" style={{ background: "#FEE2E2", color: "#B91C1C", fontSize: 12 }}>Pedir novo</button>
                    </div>
                  </div>
                )}
                <div className="mt-4">
                  <p className="mb-2 font-semibold" style={{ color: D.inkSoft, fontSize: 11 }}>Linha do tempo</p>
                  {events.length === 0 ? <p style={{ color: D.faint, fontSize: 12 }}>Sem eventos ainda.</p> : events.map((event) => (
                    <div key={event.id} className="flex gap-2 border-l-2 pb-3 pl-3" style={{ borderColor: D.greenLt }}>
                      <div className="min-w-0">
                        <p style={{ color: D.ink, fontSize: 12 }}>{event.content}</p>
                        <p className="mt-0.5" style={{ color: D.faint, fontSize: 10 }}>{event.actor} · {fmtDate(event.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
      <OwnerNav />
    </div>
  );
}