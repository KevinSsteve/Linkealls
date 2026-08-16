/**
 * Conversas — design premium, fundo quente #F6F6F4, tipografia editorial.
 * Toda a lógica é idêntica à versão anterior.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  ArrowLeft, User, Phone, Search, ExternalLink,
  DollarSign, Clock, MapPin, MessageCircle, RefreshCw, Zap, Send, Target,
} from "lucide-react";
import { Link } from "wouter";
import {
  businessApi, type Lead, type LeadState,
} from "../../lib/api";
import { useBusinessSlug } from "../../hooks/useBusinessSlug";
import { OwnerNav } from "../../components/owner/OwnerNav";
import { C } from "../../theme";

// ─── Design tokens locais ────────────────────────────────────────────────────
const D = {
  bg:       "#F6F6F4",
  surface:  "#FFFFFF",
  ink:      "#14171A",
  inkSoft:  "#6B7280",
  inkFaint: "#9CA3AF",
  line:     "#E7E7E3",
  lineSoft: "#F0F0EC",
  subtle:   "#F2F2EF",
  green:    "#16A34A",
  greenDk:  "#15803D",
  greenLt:  "#DCFCE7",
  rCard:    "20px",
  rBtn:     "999px",
} as const;

// ─── State config ─────────────────────────────────────────────────────────────
const STATE_LABELS: Record<LeadState, string> = {
  novo: "Novo", em_atendimento: "Em atendimento",
  qualificado: "Qualificado", entregue: "Entregue", perdido: "Perdido",
};
const STATE_DOT: Record<LeadState, string> = {
  novo: "#29B6F6", em_atendimento: "#FFA726",
  qualificado: D.green, entregue: "#26C6DA", perdido: "#EF5350",
};
const STATE_PILL_BG: Record<LeadState, string> = {
  novo: "#E3F2FD", em_atendimento: "#FFF8E1",
  qualificado: "#E8F5E9", entregue: "#E0F7FA", perdido: "#FFEBEE",
};
const STATE_PILL_COLOR: Record<LeadState, string> = {
  novo: "#0277BD", em_atendimento: "#E65100",
  qualificado: "#1B5E20", entregue: "#006064", perdido: "#C62828",
};
const STATE_ORDER: LeadState[] = ["novo","em_atendimento","qualificado","entregue","perdido"];

// ─── Avatar palettes ──────────────────────────────────────────────────────────
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
  const t = last.text;
  return (t.length > 52 ? t.slice(0, 52) + "…" : t);
}
function scoreColor(score: number) {
  if (score >= 80) return "#2E7D32"; if (score >= 60) return "#00838F";
  if (score >= 40) return "#E65100"; return "#C62828";
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

// ─── Conversation Row ─────────────────────────────────────────────────────────
function ConversationRow({ lead, isNew, onClick }: { lead: Lead; isNew: boolean; onClick: () => void }) {
  const name = getLeadName(lead);
  const initials = name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const pal = avatarPalette(name);
  const preview = getLeadPreview(lead);

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 active:bg-[#F0F0EC] transition-colors text-left"
      style={{ background: D.surface }}
    >
      {/* Avatar */}
      <div className="relative shrink-0 py-3.5">
        <div
          className="w-[50px] h-[50px] rounded-full flex items-center justify-center font-bold"
          style={{ background: pal.bg, color: pal.text, fontSize: 16 }}
        >
          {initials || <User size={18} />}
        </div>
        <span
          className="absolute bottom-3.5 right-0 w-2.5 h-2.5 rounded-full border-2 border-white"
          style={{ background: STATE_DOT[lead.state] }}
        />
      </div>

      {/* Content */}
      <div
        className="flex-1 min-w-0 py-3.5"
        style={{ borderBottom: `1px solid ${D.lineSoft}` }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span
            className="font-semibold truncate"
            style={{ color: D.ink, fontSize: 15 }}
          >
            {name}
          </span>
          <span
            className="shrink-0"
            style={{ color: isNew ? D.green : D.inkFaint, fontSize: 12 }}
          >
            {formatTime(lead.updatedAt)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span
            className="truncate flex-1"
            style={{ color: D.inkSoft, fontSize: 13.5 }}
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
        <p className="text-[10px] font-semibold mb-0.5 px-1" style={{ color: "#00695C" }}>
          Dono
        </p>
      )}
      <div
        className="max-w-[78%] px-3.5 py-2 text-[14px] leading-relaxed"
        style={{ borderRadius: radius, background: bg, color: C.text, boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }}
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const replyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, []);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lead.chatMessages.length]);

  async function handleOwnerReply() {
    const text = replyText.trim();
    if (!text || replying) return;
    setReplying(true);
    setReplyText("");
    try {
      const { lead: updated } = await api.ownerReplyToLead(lead.id, text);
      setLead(updated);
      onStateChange(updated);
    } catch {
      setReplyText(text);
    } finally {
      setReplying(false);
      replyInputRef.current?.focus();
    }
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
  const initials = name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const parsedTranscript = lead.callTranscript ? parseTranscript(lead.callTranscript) : null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header — identidade escura do chat */}
      <div
        className="flex items-center gap-3 px-3 shrink-0"
        style={{ background: C.headerBg, height: 56 }}
      >
        <button
          onClick={onBack}
          className="transition-colors p-1 -ml-1 active:scale-90"
          style={{ color: "rgba(255,255,255,0.85)" }}
        >
          <ArrowLeft size={22} />
        </button>
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
          style={{ background: pal.bg, color: pal.text }}
        >
          {initials || <User size={14} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate text-white" style={{ fontSize: 15 }}>{name}</p>
          <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.75)" }}>
            {lead.qualificationData.phone ?? lead.qualificationData.interest ?? formatTime(lead.createdAt)}
          </p>
        </div>
        {lead.score !== null && (
          <span
            className="font-bold px-2 py-1 rounded-full shrink-0"
            style={{ background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 12 }}
          >
            {lead.score}/100
          </span>
        )}
      </div>

      {/* Thread */}
      <div className="flex-1 overflow-y-auto px-3 py-4" style={{ background: C.chatBg }}>
        <div className="flex justify-center mb-4">
          <span
            className="px-3 py-1 rounded-full"
            style={{ background: "rgba(255,255,255,0.7)", color: C.text2, fontSize: 11 }}
          >
            {new Date(lead.createdAt).toLocaleDateString("pt-AO", { day: "2-digit", month: "long", year: "numeric" })}
          </span>
        </div>
        {lead.chatMessages.map((m, i) => (
          <Bubble key={i} role={m.role} text={m.text} ts={m.ts} />
        ))}
        {lead.callTranscript && (
          <>
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px" style={{ background: "rgba(0,0,0,0.1)" }} />
              <span
                className="flex items-center gap-1 px-2.5 py-1 rounded-full"
                style={{ background: "rgba(255,255,255,0.7)", color: C.text2, fontSize: 11 }}
              >
                <Phone size={10} /> Chamada de voz
              </span>
              <div className="flex-1 h-px" style={{ background: "rgba(0,0,0,0.1)" }} />
            </div>
            {parsedTranscript
              ? parsedTranscript.map((l, i) => <Bubble key={i} role={l.role === "user" ? "user" : "bot"} text={l.text} />)
              : (
                <div
                  className="rounded-xl px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap"
                  style={{ background: C.bubIn, color: C.text2, boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }}
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
            style={{ background: C.bubIn, border: `1px solid ${D.green}30`, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}
          >
            <p className="font-bold uppercase tracking-widest mb-1.5" style={{ color: D.green, fontSize: 10 }}>Resumo</p>
            <p className="leading-relaxed" style={{ color: C.text2, fontSize: 13 }}>{lead.aiSummary}</p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Footer */}
      <div className="shrink-0" style={{ background: D.surface, borderTop: `1px solid ${D.line}` }}>
        {/* Chips de info */}
        {(lead.qualificationData.phone || lead.qualificationData.budget || lead.qualificationData.timeline || lead.qualificationData.location) && (
          <div className="flex flex-wrap gap-1.5 px-4 py-2.5" style={{ borderBottom: `1px solid ${D.lineSoft}` }}>
            {lead.qualificationData.phone && (
              <span className="flex items-center gap-1 rounded-full px-2.5 py-1" style={{ background: D.subtle, color: D.inkSoft, fontSize: 12 }}>
                <Phone size={11} style={{ color: D.green }} /> {lead.qualificationData.phone}
              </span>
            )}
            {lead.qualificationData.budget && (
              <span className="flex items-center gap-1 rounded-full px-2.5 py-1" style={{ background: D.subtle, color: D.inkSoft, fontSize: 12 }}>
                <DollarSign size={11} style={{ color: D.green }} /> {lead.qualificationData.budget}
              </span>
            )}
            {lead.qualificationData.timeline && (
              <span className="flex items-center gap-1 rounded-full px-2.5 py-1" style={{ background: D.subtle, color: D.inkSoft, fontSize: 12 }}>
                <Clock size={11} style={{ color: D.green }} /> {lead.qualificationData.timeline}
              </span>
            )}
            {lead.qualificationData.location && (
              <span className="flex items-center gap-1 rounded-full px-2.5 py-1" style={{ background: D.subtle, color: D.inkSoft, fontSize: 12 }}>
                <MapPin size={11} style={{ color: D.green }} /> {lead.qualificationData.location}
              </span>
            )}
          </div>
        )}

        {/* Selector de estado */}
        <div className="flex gap-1.5 px-4 py-2.5 overflow-x-auto scrollbar-none" style={{ borderBottom: `1px solid ${D.lineSoft}` }}>
          {STATE_ORDER.map((s) => (
            <button
              key={s}
              disabled={s === lead.state || updating}
              onClick={() => handleState(s)}
              className="shrink-0 font-medium transition-all disabled:opacity-40"
              style={{
                fontSize: 11,
                padding: "5px 12px",
                borderRadius: D.rBtn,
                background: s === lead.state ? STATE_PILL_BG[s] : D.subtle,
                color: s === lead.state ? STATE_PILL_COLOR[s] : D.inkSoft,
                border: `1px solid ${s === lead.state ? STATE_DOT[s] + "40" : D.line}`,
              }}
            >
              {STATE_LABELS[s]}
            </button>
          ))}
        </div>

        {/* WhatsApp CTA */}
        {waUrl && (
          <div className="px-4 py-2.5">
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-white font-semibold py-2.5 rounded-xl transition-colors"
              style={{ background: "#25D366", fontSize: 14 }}
            >
              <MessageCircle size={16} /> Continuar no WhatsApp <ExternalLink size={12} className="opacity-70" />
            </a>
          </div>
        )}

        {/* Input de resposta do dono */}
        <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderTop: `1px solid ${D.lineSoft}` }}>
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
              border: `1px solid ${D.line}`,
              borderRadius: D.rBtn,
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
              borderRadius: D.rBtn,
              width: 40,
              height: 40,
            }}
            aria-label="Enviar resposta"
          >
            <Send size={16} />
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
      <div className="flex flex-col h-full" style={{ background: D.bg }}>
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
    <div className="flex flex-col h-full" style={{ background: D.bg }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className="shrink-0"
        style={{ background: D.surface, borderBottom: `1px solid ${D.line}` }}
      >
        {/* Título */}
        <div className="flex items-center justify-between px-5 pt-6 pb-3">
          <h1
            className="font-bold tracking-tight"
            style={{ color: D.ink, fontSize: 26, letterSpacing: "-0.5px" }}
          >
            Conversas
          </h1>
          <button
            onClick={() => void load()}
            className="flex items-center justify-center rounded-full transition-colors active:bg-black/5"
            style={{ width: 36, height: 36, color: D.inkFaint }}
            aria-label="Actualizar"
          >
            <RefreshCw size={18} strokeWidth={1.8} />
          </button>
        </div>

        {/* Barra de pesquisa */}
        <div className="px-5 pb-3">
          <div
            className="flex items-center gap-2.5"
            style={{
              background: D.surface,
              border: `1.5px solid ${D.line}`,
              borderRadius: D.rBtn,
              height: 44,
              paddingLeft: 14,
              paddingRight: 14,
            }}
          >
            <Search size={15} style={{ color: D.inkFaint }} className="shrink-0" />
            <input
              type="text"
              placeholder="Pesquisar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent outline-none"
              style={{ color: D.ink, fontSize: 15 }}
            />
          </div>
        </div>

        {/* Filtros de estado */}
        <div className="flex gap-1.5 px-5 pb-3 overflow-x-auto scrollbar-none">
          {([["todos", "Todas"] as const, ...STATE_ORDER.map((s) => [s, STATE_LABELS[s]] as const)]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key as LeadState | "todos")}
              className="shrink-0 font-medium transition-all"
              style={{
                fontSize: 12,
                padding: "5px 13px",
                borderRadius: D.rBtn,
                background: filter === key ? D.green : D.subtle,
                color: filter === key ? "#fff" : D.inkSoft,
                border: `1px solid ${filter === key ? D.green : D.line}`,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Toast de notificação */}
      {notification && (
        <div
          className="shrink-0 mx-5 mt-3 flex items-center gap-2 rounded-xl px-3.5 py-2.5"
          style={{ background: D.greenLt, color: D.greenDk, border: `1px solid ${D.green}30`, fontSize: 13 }}
        >
          <Target size={14} className="shrink-0" /> {notification}
        </div>
      )}

      {/* Stats */}
      {leads.length > 0 && (
        <div className="shrink-0 flex gap-4 px-5 py-2">
          <span style={{ color: D.inkFaint, fontSize: 12 }}>
            {leads.length} conversa{leads.length !== 1 ? "s" : ""}
          </span>
          {qualifiedCount > 0 && (
            <span className="font-semibold" style={{ color: D.green, fontSize: 12 }}>
              {qualifiedCount} qualificado{qualifiedCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {/* Lista */}
      <div className="flex-1 overflow-y-auto mx-5 mb-2 overflow-hidden" style={{ background: D.surface, border: `1px solid ${D.line}`, borderRadius: D.rCard }}>
        {loading ? (
          <div className="py-2">
            {[1,2,3,4].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse" style={{ borderBottom: `1px solid ${D.lineSoft}` }}>
                <div className="w-12 h-12 rounded-full shrink-0" style={{ background: D.subtle }} />
                <div className="flex-1">
                  <div className="h-4 rounded mb-2" style={{ background: D.subtle, width: "50%" }} />
                  <div className="h-3 rounded" style={{ background: D.subtle, width: "75%" }} />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center py-16">
            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: D.subtle }}>
              <MessageCircle size={26} style={{ color: D.inkFaint }} />
            </div>
            <p className="font-medium" style={{ color: D.inkSoft, fontSize: 15 }}>
              {search || filter !== "todos" ? "Nenhum resultado" : "Nenhuma conversa ainda"}
            </p>
          </div>
        ) : (
          <div>
            {filtered.map((l) => (
              <ConversationRow
                key={l.id}
                lead={l}
                isNew={newIds.has(l.id)}
                onClick={() => { setNewIds((prev) => { const s = new Set(prev); s.delete(l.id); return s; }); setSelected(l); }}
              />
            ))}
          </div>
        )}
      </div>

      {/* FAB — Assistente IA */}
      <Link
        href={`/e/${slug}/dono/assistente`}
        className="fixed right-4"
        style={{
          bottom: "calc(68px + env(safe-area-inset-bottom, 0px))",
          width: 52,
          height: 52,
          background: D.ink,
          borderRadius: 16,
          boxShadow: "0 4px 16px rgba(20,23,26,0.24), 0 1px 4px rgba(20,23,26,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 20,
        }}
        aria-label="Abrir Assistente IA"
      >
        <Zap size={22} className="text-white" strokeWidth={2} />
      </Link>

      <OwnerNav />
    </div>
  );
}
