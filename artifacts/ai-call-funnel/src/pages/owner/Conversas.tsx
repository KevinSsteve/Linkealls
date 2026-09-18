/**
 * Conversas — inbox premium mobile-native.
 * Design: sem cards gigantes, linhas de conversa compactas (~72-80px),
 * pesquisa com radius 12px, chips de filtro refinados.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  ArrowLeft, User, Phone, ExternalLink,
  DollarSign, Clock, MapPin, MessageCircle, RefreshCw, Zap, Send, Target, PackageCheck,
} from "lucide-react";
import { Link } from "wouter";
import {
  businessApi, type Lead, type LeadState,
  type Order, type OrderEvent, type OrderFulfillmentStatus,
} from "../../lib/api";
import { useBusinessSlug } from "../../hooks/useBusinessSlug";
import { OwnerNav } from "../../components/owner/OwnerNav";
import { C } from "../../theme";
import { AppHeader, AppIconButton } from "../../components/app/AppHeader";
import { SearchBar } from "../../components/app/SearchBar";
import { FilterChips } from "../../components/app/FilterChips";

// ─── Design tokens ────────────────────────────────────────────────────────────
const D = {
  bg:         "#F6F9FC",
  surface:    "#FFFFFF",
  ink:        "#0A2540",
  inkSoft:    "#425466",
  inkFaint:   "#8898AA",
  border:     "#E6EBF1",
  borderSoft: "#F1F4F8",
  subtle:     "#F1F5F9",
  green:      "#635BFF",
  greenDk:    "#5046E5",
  greenLt:    "#EEECFF",
} as const;

// ─── State config ─────────────────────────────────────────────────────────────
const STATE_LABELS: Record<LeadState, string> = {
  novo: "Novo", em_atendimento: "Em atend.", qualificado: "Qualificado",
  entregue: "Entregue", perdido: "Perdido",
};
const STATE_DOT: Record<LeadState, string> = {
  novo: "#3B82F6", em_atendimento: "#F59E0B",
  qualificado: "#2E8B72", entregue: "#06B6D4", perdido: "#EF4444",
};
const STATE_PILL_BG: Record<LeadState, string> = {
  novo: "#EFF6FF", em_atendimento: "#FFFBEB",
  qualificado: "#E8F7F1", entregue: "#ECFEFF", perdido: "#FEF2F2",
};
const STATE_PILL_COLOR: Record<LeadState, string> = {
  novo: "#1D4ED8", em_atendimento: "#B45309",
  qualificado: "#176B55", entregue: "#0E7490", perdido: "#B91C1C",
};
const STATE_ORDER: LeadState[] = ["novo","em_atendimento","qualificado","entregue","perdido"];

// ─── Avatars ──────────────────────────────────────────────────────────────────
const PALETTES = [
  { bg: "#F3E5F5", text: "#6A1B9A" },
  { bg: "#E3F2FD", text: "#0D47A1" },
  { bg: "#FCE4EC", text: "#880E4F" },
  { bg: "#E8F5E9", text: "#1B5E20" },
  { bg: "#FFF3E0", text: "#E65100" },
  { bg: "#E0F7FA", text: "#006064" },
];
function avatarPalette(name: string) {
  let h = 0; for (const c of name) h = h * 31 + c.charCodeAt(0);
  return PALETTES[Math.abs(h) % PALETTES.length]!;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatTime(iso: string): string {
  const d = new Date(iso), now = new Date();
  const diffH = (now.getTime() - d.getTime()) / 3_600_000;
  if (diffH < 24) return d.toLocaleTimeString("pt-AO", { hour: "2-digit", minute: "2-digit" });
  if (diffH < 48) return "Ontem";
  return d.toLocaleDateString("pt-AO", { day: "2-digit", month: "short" });
}
function getLeadName(lead: Lead) { return lead.qualificationData.name || "Visitante anónimo"; }
function getLeadPreview(lead: Lead) {
  if (lead.callTranscript) return "Chamada de voz concluída";
  const msgs = lead.chatMessages;
  if (!msgs.length) return "Sem mensagens";
  const last = msgs[msgs.length - 1]!;
  return last.text.length > 54 ? last.text.slice(0, 54) + "…" : last.text;
}
function parseTranscript(raw: string): Array<{ role: "user" | "ai"; text: string }> | null {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const parsed: Array<{ role: "user" | "ai"; text: string }> = [];
  for (const line of lines) {
    const m = line.match(/^(user|utilizador|cliente|ai|ia|assistente|bot):\s*(.*)/i);
    if (m) parsed.push({ role: /user|utilizador|cliente/i.test(m[1]!) ? "user" : "ai", text: m[2]! });
    else return null;
  }
  return parsed.length ? parsed : null;
}

const FULFILLMENT_LABELS: Record<OrderFulfillmentStatus, string> = {
  novo: "Novo",
  em_preparacao: "Em preparação",
  pronto: "Pronto",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

function OwnerOrderPanel({
  orders,
  events,
  loading,
  updatingId,
  error,
  onRefresh,
  onUpdate,
}: {
  orders: Order[];
  events: Record<string, OrderEvent[]>;
  loading: boolean;
  updatingId: string | null;
  error: string | null;
  onRefresh: () => void;
  onUpdate: (orderId: string, status: OrderFulfillmentStatus) => void;
}) {
  if (loading && orders.length === 0) {
    return <div className="px-4 py-3 text-[12px]" style={{ color: D.inkFaint }}>A carregar encomendas desta conversa…</div>;
  }
  if (orders.length === 0) return null;
  return (
    <div className="px-3 py-3" style={{ background: "#F8FAFC", borderBottom: `1px solid ${D.border}` }}>
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest" style={{ color: D.inkSoft }}>
          <PackageCheck size={13} style={{ color: D.green }} /> Encomendas
        </p>
        <button onClick={onRefresh} disabled={loading} className="rounded-full p-1.5 disabled:opacity-40" aria-label="Actualizar encomendas">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} style={{ color: D.inkSoft }} />
        </button>
      </div>
      {error && <p className="mb-2 text-[12px]" style={{ color: "#B91C1C" }}>{error}</p>}
      <div className="space-y-2">
        {orders.map((order) => (
          <div key={order.id} className="rounded-xl p-3" style={{ background: D.surface, border: `1px solid ${D.border}` }}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold" style={{ color: D.ink }}>{order.offeringName}</p>
                <p className="mt-0.5 text-[12px]" style={{ color: D.inkSoft }}>
                  {order.quantity} unidade{order.quantity !== 1 ? "s" : ""} · {Number(order.amount).toLocaleString("pt-AO")} Kz
                </p>
              </div>
              <span className="shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold" style={{
                background: order.status === "paga" ? "#E8F7F1" : "#FFF7ED",
                color: order.status === "paga" ? "#176B55" : "#B45309",
              }}>
                {order.status === "paga" ? "Pago" : order.status}
              </span>
            </div>
            <p className="mt-2 text-[12px]" style={{ color: D.inkSoft }}>
              Estado operacional: <strong style={{ color: D.ink }}>{FULFILLMENT_LABELS[order.fulfillmentStatus]}</strong>
            </p>
            <div className="mt-2 flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              {(Object.keys(FULFILLMENT_LABELS) as OrderFulfillmentStatus[]).map((status) => (
                <button
                  key={status}
                  disabled={status === order.fulfillmentStatus || updatingId === order.id}
                  onClick={() => onUpdate(order.id, status)}
                  className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium disabled:opacity-40"
                  style={{
                    background: status === order.fulfillmentStatus ? D.greenLt : D.subtle,
                    color: status === order.fulfillmentStatus ? D.greenDk : D.inkSoft,
                    border: `1px solid ${status === order.fulfillmentStatus ? `${D.green}50` : D.border}`,
                  }}
                >
                  {FULFILLMENT_LABELS[status]}
                </button>
              ))}
            </div>
            {(events[order.id] ?? []).length > 0 && (
              <div className="mt-3 border-t pt-2" style={{ borderColor: D.borderSoft }}>
                {(events[order.id] ?? []).slice(0, 4).map((event) => (
                  <div key={event.id} className="mb-1.5 text-[11px]" style={{ color: D.inkSoft }}>
                    <span>{event.content}</span>
                    <span className="ml-1" style={{ color: D.inkFaint }}>
                      · {new Date(event.createdAt).toLocaleDateString("pt-AO", { day: "2-digit", month: "short" })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Conversation Row — 72-80px, compact ─────────────────────────────────────
function ConversationRow({ lead, isNew, onClick }: { lead: Lead; isNew: boolean; onClick: () => void }) {
  const name = getLeadName(lead);
  const inits = name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const pal = avatarPalette(name);
  const preview = getLeadPreview(lead);

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center text-left transition-colors active:bg-gray-50"
      style={{ background: D.surface, paddingLeft: 16, paddingRight: 16, minHeight: 72 }}
    >
      {/* Avatar with status dot */}
      <div className="relative shrink-0 mr-3" style={{ width: 48, height: 48 }}>
        <div
          className="w-full h-full rounded-full flex items-center justify-center font-semibold"
          style={{ background: pal.bg, color: pal.text, fontSize: 15 }}
        >
          {inits || <User size={17} strokeWidth={1.75} />}
        </div>
        <span
          className="absolute rounded-full border-2 border-white"
          style={{
            width: 10, height: 10,
            background: STATE_DOT[lead.state],
            bottom: 0, right: 0,
          }}
        />
      </div>

      {/* Content */}
      <div
        className="flex-1 min-w-0 flex flex-col justify-center"
        style={{
          borderBottom: `1px solid ${D.borderSoft}`,
          paddingTop: 14,
          paddingBottom: 14,
          minHeight: 72,
        }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span
            className="font-semibold truncate"
            style={{ color: D.ink, fontSize: 15 }}
          >
            {name}
          </span>
          <span
            className="shrink-0 text-right"
            style={{ color: isNew ? D.green : D.inkFaint, fontSize: 12 }}
          >
            {formatTime(lead.updatedAt)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span
            className="truncate flex-1"
            style={{ color: D.inkSoft, fontSize: 14 }}
          >
            {preview}
          </span>
          {isNew && (
            <span
              className="shrink-0 min-w-[20px] h-5 rounded-full flex items-center justify-center font-bold px-1.5"
              style={{ background: D.green, color: "#fff", fontSize: 11 }}
            >
              1
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Bubble ───────────────────────────────────────────────────────────────────
function Bubble({ role, text, ts }: { role: "user" | "bot" | "agent"; text: string; ts?: string }) {
  const isRight = role === "user" || role === "agent";
  const bg = role === "agent" ? "#B2DFDB" : role === "user" ? C.bubOut : C.bubIn;
  const radius = isRight ? "8px 2px 8px 8px" : "2px 8px 8px 8px";
  return (
    <div className={`flex flex-col mb-1.5 ${isRight ? "items-end" : "items-start"}`}>
      {role === "agent" && (
        <p className="text-[10px] font-semibold mb-0.5 px-1" style={{ color: "#00695C" }}>Dono</p>
      )}
      <div
        className="max-w-[78%] px-3.5 py-2 text-[14px] leading-relaxed"
        style={{ borderRadius: radius, background: bg, color: C.text, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}
      >
        {text}
        {ts && (
          <p className="text-[10px] mt-1 text-right" style={{ color: C.text3 }}>
            {new Date(ts).toLocaleTimeString("pt-AO", { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Conversation Detail ──────────────────────────────────────────────────────
function ConversationDetail({ lead: initialLead, onBack, onStateChange, api }: {
  lead: Lead; onBack: () => void; onStateChange: (l: Lead) => void;
  api: ReturnType<typeof businessApi>;
}) {
  const [lead, setLead] = useState(initialLead);
  const [updating, setUpdating] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderEvents, setOrderEvents] = useState<Record<string, OrderEvent[]>>({});
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderUpdatingId, setOrderUpdatingId] = useState<string | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const replyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [lead.chatMessages.length]);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    setOrdersError(null);
    try {
      const { orders: allOrders } = await api.listOrders();
      const linked = allOrders.filter((order) => order.leadId === lead.id);
      setOrders(linked);
      const entries = await Promise.all(linked.map(async (order) => {
        const { events } = await api.listOrderEvents(order.id);
        return [order.id, events] as const;
      }));
      setOrderEvents(Object.fromEntries(entries));
    } catch {
      setOrdersError("Não foi possível carregar as encomendas.");
    } finally {
      setOrdersLoading(false);
    }
  }, [api, lead.id]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  async function handleOrderUpdate(orderId: string, status: OrderFulfillmentStatus) {
    setOrderUpdatingId(orderId);
    setOrdersError(null);
    try {
      const { order: updated } = await api.updateOrderFulfillment(orderId, status);
      setOrders((current) => current.map((order) => order.id === updated.id ? updated : order));
      const [{ events }, { lead: updatedLead }] = await Promise.all([
        api.listOrderEvents(orderId),
        api.getLeadDetail(lead.id),
      ]);
      setOrderEvents((current) => ({ ...current, [orderId]: events }));
      setLead(updatedLead);
      onStateChange(updatedLead);
    } catch {
      setOrdersError("Não foi possível actualizar a encomenda.");
    } finally {
      setOrderUpdatingId(null);
    }
  }

  async function handleOwnerReply() {
    const text = replyText.trim();
    if (!text || replying) return;
    setReplying(true); setReplyText("");
    try {
      const { lead: updated } = await api.ownerReplyToLead(lead.id, text);
      setLead(updated); onStateChange(updated);
    } catch { setReplyText(text); }
    finally { setReplying(false); replyInputRef.current?.focus(); }
  }

  async function handleState(state: LeadState) {
    setUpdating(true);
    try {
      const { lead: updated } = await api.updateLeadState(lead.id, state);
      setLead(updated); onStateChange(updated);
    } finally { setUpdating(false); }
  }

  const waPhone = lead.qualificationData.phone
    ?.replace(/\D/g, "").replace(/^00/, "").replace(/^0/, "244");
  const waUrl = waPhone
    ? `https://wa.me/${waPhone}${lead.whatsappMessage ? `?text=${encodeURIComponent(lead.whatsappMessage)}` : ""}`
    : null;

  const name = getLeadName(lead);
  const pal = avatarPalette(name);
  const inits = name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const parsedTranscript = lead.callTranscript ? parseTranscript(lead.callTranscript) : null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Chat header */}
      <div
        className="flex items-center gap-3 px-3 shrink-0"
        style={{ background: C.headerBg, height: 56 }}
      >
        <button
          onClick={onBack}
          className="transition-opacity active:opacity-60 p-1 -ml-1"
          style={{ color: "rgba(255,255,255,0.85)" }}
          aria-label="Voltar"
        >
          <ArrowLeft size={22} strokeWidth={1.75} />
        </button>
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
          style={{ background: pal.bg, color: pal.text }}
        >
          {inits || <User size={14} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate text-white" style={{ fontSize: 15 }}>{name}</p>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}>
            {lead.qualificationData.phone ?? lead.qualificationData.interest ?? formatTime(lead.createdAt)}
          </p>
        </div>
        {lead.score !== null && (
          <span
            className="font-bold rounded-full shrink-0"
            style={{
              background: "rgba(255,255,255,0.15)", color: "#fff",
              fontSize: 12, padding: "3px 10px",
            }}
          >
            {lead.score}/100
          </span>
        )}
      </div>

      {/* Thread */}
      <div className="owner-content-scroll px-3 py-4" style={{ background: C.chatBg }}>
        <div className="flex justify-center mb-4">
          <span
            className="rounded-full px-3 py-1"
            style={{ background: "rgba(255,255,255,0.7)", color: C.text2, fontSize: 11 }}
          >
            {new Date(lead.createdAt).toLocaleDateString("pt-AO", { day: "2-digit", month: "long", year: "numeric" })}
          </span>
        </div>
        {lead.chatMessages.map((m, i) => (
          <Bubble key={i} role={m.role} text={m.text} ts={m.ts} />
        ))}
        <OwnerOrderPanel
          orders={orders}
          events={orderEvents}
          loading={ordersLoading}
          updatingId={orderUpdatingId}
          error={ordersError}
          onRefresh={() => void loadOrders()}
          onUpdate={(orderId, status) => void handleOrderUpdate(orderId, status)}
        />
        {lead.callTranscript && (
          <>
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px" style={{ background: "rgba(0,0,0,0.08)" }} />
              <span
                className="flex items-center gap-1 rounded-full px-2.5 py-1"
                style={{ background: "rgba(255,255,255,0.7)", color: C.text2, fontSize: 11 }}
              >
                <Phone size={10} /> Chamada de voz
              </span>
              <div className="flex-1 h-px" style={{ background: "rgba(0,0,0,0.08)" }} />
            </div>
            {parsedTranscript
              ? parsedTranscript.map((l, i) => <Bubble key={i} role={l.role === "user" ? "user" : "bot"} text={l.text} />)
              : (
                <div
                  className="rounded-xl px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap"
                  style={{ background: C.bubIn, color: C.text2 }}
                >
                  {lead.callTranscript}
                </div>
              )
            }
          </>
        )}
        {lead.aiSummary && (
          <div
            className="mt-4 rounded-xl p-3.5"
            style={{ background: C.bubIn, border: `1px solid ${D.green}30` }}
          >
            <p className="font-bold uppercase tracking-widest mb-1.5" style={{ color: D.green, fontSize: 10 }}>Resumo IA</p>
            <p style={{ color: C.text2, fontSize: 13, lineHeight: 1.55 }}>{lead.aiSummary}</p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Footer */}
      <div className="shrink-0" style={{ background: D.surface, borderTop: `1px solid ${D.border}` }}>
        {/* Chips de info */}
        {(lead.qualificationData.phone || lead.qualificationData.budget || lead.qualificationData.timeline || lead.qualificationData.location) && (
          <div
            className="flex flex-wrap gap-1.5"
            style={{ padding: "10px 16px", borderBottom: `1px solid ${D.borderSoft}` }}
          >
            {[
              lead.qualificationData.phone    && { icon: Phone,    text: lead.qualificationData.phone },
              lead.qualificationData.budget   && { icon: DollarSign, text: lead.qualificationData.budget },
              lead.qualificationData.timeline && { icon: Clock,    text: lead.qualificationData.timeline },
              lead.qualificationData.location && { icon: MapPin,   text: lead.qualificationData.location },
            ].filter(Boolean).map((item, i) => {
              if (!item) return null;
              const { icon: Icon, text } = item;
              return (
                <span
                  key={i}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1"
                  style={{ background: D.subtle, color: D.inkSoft, fontSize: 12 }}
                >
                  <Icon size={11} style={{ color: D.green }} strokeWidth={1.75} /> {text}
                </span>
              );
            })}
          </div>
        )}

        {/* Estado */}
        <div
          className="flex gap-1.5 overflow-x-auto"
          style={{ padding: "10px 16px", borderBottom: `1px solid ${D.borderSoft}`, scrollbarWidth: "none" }}
        >
          {STATE_ORDER.map((s) => (
            <button
              key={s}
              disabled={s === lead.state || updating}
              onClick={() => handleState(s)}
              className="shrink-0 font-medium transition-all disabled:opacity-40"
              style={{
                fontSize: 12,
                padding: "4px 12px",
                borderRadius: 8,
                background: s === lead.state ? STATE_PILL_BG[s] : D.subtle,
                color: s === lead.state ? STATE_PILL_COLOR[s] : D.inkSoft,
                border: `1px solid ${s === lead.state ? STATE_DOT[s] + "50" : D.border}`,
              }}
            >
              {STATE_LABELS[s]}
            </button>
          ))}
        </div>

        {/* WhatsApp */}
        {waUrl && (
          <div style={{ padding: "10px 16px" }}>
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: C.green, borderRadius: 12, minHeight: 44, fontSize: 14 }}
            >
              <MessageCircle size={16} strokeWidth={1.75} /> Continuar no WhatsApp <ExternalLink size={12} />
            </a>
          </div>
        )}

        {/* Input de resposta */}
        <div
          className="flex items-center gap-2"
          style={{ padding: "8px 12px 8px", borderTop: `1px solid ${D.borderSoft}` }}
        >
          <input
            ref={replyInputRef}
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleOwnerReply(); } }}
            placeholder="Responder como dono…"
            disabled={replying}
            className="flex-1 outline-none disabled:opacity-50"
            style={{
              background: D.subtle,
              color: D.ink,
              border: `1px solid ${D.border}`,
              borderRadius: 22,
              fontSize: 14,
              padding: "10px 14px",
            }}
          />
          <button
            onClick={() => void handleOwnerReply()}
            disabled={!replyText.trim() || replying}
            className="flex items-center justify-center text-white transition-all disabled:opacity-30 shrink-0"
            style={{
              background: D.green,
              borderRadius: "50%",
              width: 40,
              height: 40,
            }}
            aria-label="Enviar"
          >
            <Send size={16} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function Conversas() {
  const slug = useBusinessSlug();
  const api = useMemo(() => (slug ? businessApi(slug) : null), [slug]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<LeadState | "todos">("todos");
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [notification, setNotification] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!api) return;
    try {
      const { leads: data } = await api.listLeads();
      setLeads([...data].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
    } finally { setLoading(false); }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!api) return;
    const es = new EventSource(api.getLeadsEventsUrl());
    es.addEventListener("lead_qualified", (e) => {
      const { leadId } = JSON.parse((e as MessageEvent).data) as { leadId: string };
      setNewIds((prev) => new Set([...prev, leadId]));
      setNotification("Novo lead qualificado!");
      void load();
      setTimeout(() => setNotification(null), 5000);
    });
    return () => es.close();
  }, [api, load]);

  const filtered = leads.filter((l) => {
    if (filter !== "todos" && l.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !(l.qualificationData.name ?? "").toLowerCase().includes(q) &&
        !(l.qualificationData.phone ?? "").toLowerCase().includes(q) &&
        !(l.qualificationData.interest ?? "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  if (!slug || !api) return (
    <div className="flex items-center justify-center h-full text-sm" style={{ background: D.bg, color: D.inkSoft }}>
      Negócio não encontrado
    </div>
  );

  if (selected) {
    return (
      <div className="owner-view-root" style={{ background: D.bg }}>
        <ConversationDetail
          lead={selected} api={api}
          onBack={() => setSelected(null)}
          onStateChange={(updated) => {
            setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
            setSelected(updated);
          }}
        />
        <OwnerNav />
      </div>
    );
  }

  const qualifiedCount = leads.filter((l) => l.state === "qualificado").length;

  return (
    <div className="owner-view-root" style={{ background: D.bg }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className="shrink-0"
        style={{ background: D.surface, borderBottom: `1px solid ${D.border}` }}
      >
        <header className="owner-header justify-between">
          <div className="owner-header-title">Conversas</div>
          <button
            onClick={() => void load()}
            className="owner-icon-btn text-[var(--ink-soft)]"
            aria-label="Actualizar"
          >
            <RefreshCw size={20} strokeWidth={1.75} />
          </button>
        </header>

        <div style={{ padding: "10px var(--page-padding-mobile) 10px" }}>
          <SearchBar value={search} onChange={setSearch} />
        </div>

        <div style={{ padding: "2px var(--page-padding-mobile) 10px" }}>
          <FilterChips
            value={filter}
            onChange={(key) => setFilter(key as LeadState | "todos")}
            options={(["todos", ...STATE_ORDER] as const).map((key) => ({
              value: key,
              label: key === "todos" ? "Todas" : STATE_LABELS[key],
            }))}
          />
        </div>
      </div>

      {/* Toast */}
      {notification && (
        <div
          className="shrink-0 flex items-center gap-2"
          style={{
            margin: "12px 16px 0",
            background: D.greenLt,
            border: `1px solid ${D.green}30`,
            color: D.greenDk,
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 13,
          }}
        >
          <Target size={14} className="shrink-0" strokeWidth={1.75} /> {notification}
        </div>
      )}

      {/* Metadata — "2 conversas · 1 qualificado" */}
      {!loading && leads.length > 0 && (
        <div style={{ padding: "8px 16px 4px" }}>
          <p style={{ color: D.inkFaint, fontSize: 12 }}>
            {leads.length} conversa{leads.length !== 1 ? "s" : ""}
            {qualifiedCount > 0 && <span style={{ color: D.green }}> · {qualifiedCount} qualificado{qualifiedCount !== 1 ? "s" : ""}</span>}
          </p>
        </div>
      )}

      {/* List */}
      <div
        className="owner-content-scroll"
        style={{ background: D.surface, borderTop: `1px solid ${D.border}` }}
      >
        {loading ? (
          /* Skeleton */
          <div>
            {[1,2,3,4,5].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 animate-pulse"
                style={{ padding: "14px 16px", borderBottom: `1px solid ${D.borderSoft}` }}
              >
                <div className="w-12 h-12 rounded-full shrink-0" style={{ background: D.subtle }} />
                <div className="flex-1">
                  <div className="h-4 rounded mb-2" style={{ background: D.subtle, width: "45%" }} />
                  <div className="h-3 rounded" style={{ background: D.subtle, width: "70%" }} />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          /* Empty state */
          <div className="owner-state-container">
            <div className="owner-state-icon">
              <MessageCircle size={28} />
            </div>
            <p className="owner-state-title">
              {search || filter !== "todos" ? "Sem resultados" : "Nenhuma conversa ainda"}
            </p>
            <p className="owner-state-desc">
              {search || filter !== "todos"
                ? "Tenta outros termos ou remove o filtro."
                : "Quando clientes entrarem em contacto, as conversas aparecerão aqui."}
            </p>
          </div>
        ) : (
          <div>
            {filtered.map((l) => (
              <ConversationRow
                key={l.id}
                lead={l}
                isNew={newIds.has(l.id)}
                onClick={() => {
                  setNewIds((prev) => { const s = new Set(prev); s.delete(l.id); return s; });
                  setSelected(l);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* FAB — Assistente IA */}
      <Link
        href={`/e/${slug}/dono/assistente`}
        aria-label="Abrir Assistente IA"
        style={{
          position: "fixed",
          right: 16,
          bottom: "calc(72px + env(safe-area-inset-bottom, 0px))",
          width: 54,
          height: 54,
          background: D.ink,
          borderRadius: 16,
          boxShadow: "0 4px 16px rgba(0,0,0,0.18), 0 1px 4px rgba(0,0,0,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 20,
        }}
      >
        <Zap size={22} style={{ color: "#FFFFFF" }} strokeWidth={2} />
      </Link>

      <OwnerNav />
    </div>
  );
}
