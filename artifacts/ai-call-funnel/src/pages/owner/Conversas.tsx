/**
 * Conversas — lista estilo WhatsApp de todas as conversas da IA com clientes.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  ArrowLeft, User, Phone, Bell,
  Search, ExternalLink, DollarSign, Clock, MapPin,
  MessageCircle,
} from "lucide-react";
import {
  businessApi, type Lead, type LeadState,
} from "../../lib/api";
import { useBusinessSlug } from "../../hooks/useBusinessSlug";
import { OwnerNav } from "../../components/owner/OwnerNav";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATE_LABELS: Record<LeadState, string> = {
  novo: "Novo", em_atendimento: "Em atendimento",
  qualificado: "Qualificado", entregue: "Entregue", perdido: "Perdido",
};

const STATE_COLORS: Record<LeadState, string> = {
  novo:           "bg-sky-500/20 text-sky-300 border-sky-500/30",
  em_atendimento: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  qualificado:    "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  entregue:       "bg-teal-500/20 text-teal-300 border-teal-500/30",
  perdido:        "bg-red-500/20 text-red-300 border-red-500/30",
};

const STATE_DOT: Record<LeadState, string> = {
  novo:           "#38BDF8",
  em_atendimento: "#FBBF24",
  qualificado:    "#34D399",
  entregue:       "#2DD4BF",
  perdido:        "#F87171",
};

const STATE_ORDER: LeadState[] = [
  "novo", "em_atendimento", "qualificado", "entregue", "perdido",
];

// Avatar colours — assigned by name hash for visual variety
const AVATAR_PALETTES = [
  { bg: "#1A3828", text: "#4ADE80" },
  { bg: "#1A2B45", text: "#60A5FA" },
  { bg: "#3A1A2B", text: "#F472B6" },
  { bg: "#2B1A3A", text: "#A78BFA" },
  { bg: "#3A2B1A", text: "#FB923C" },
  { bg: "#1A3A3A", text: "#22D3EE" },
];

function avatarPalette(name: string) {
  let h = 0;
  for (const c of name) h = h * 31 + c.charCodeAt(0);
  return AVATAR_PALETTES[Math.abs(h) % AVATAR_PALETTES.length];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffH = (now.getTime() - d.getTime()) / 3_600_000;
  if (diffH < 24) return d.toLocaleTimeString("pt-AO", { hour: "2-digit", minute: "2-digit" });
  if (diffH < 48) return "Ontem";
  return d.toLocaleDateString("pt-AO", { day: "2-digit", month: "short" });
}

function getLeadName(lead: Lead) {
  return lead.qualificationData.name || "Visitante anónimo";
}

function getLeadPreview(lead: Lead) {
  if (lead.callTranscript) return "📞 Chamada de voz concluída";
  const msgs = lead.chatMessages;
  if (!msgs.length) return "Sem mensagens";
  const last = msgs[msgs.length - 1];
  const prefix = last.role === "user" ? "Tu: " : "";
  const t = last.text;
  return prefix + (t.length > 50 ? t.slice(0, 50) + "…" : t);
}

function scoreColor(score: number) {
  if (score >= 80) return "#10B981";
  if (score >= 60) return "#14B8A6";
  if (score >= 40) return "#F59E0B";
  return "#EF4444";
}

function parseTranscript(raw: string): Array<{ role: "user" | "ai"; text: string }> | null {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const parsed: Array<{ role: "user" | "ai"; text: string }> = [];
  for (const line of lines) {
    const m = line.match(/^(user|utilizador|cliente|ai|ia|assistente|bot):\s*(.*)/i);
    if (m) {
      const role = /user|utilizador|cliente/i.test(m[1]) ? "user" : "ai";
      parsed.push({ role, text: m[2] });
    } else {
      return null;
    }
  }
  return parsed.length ? parsed : null;
}

// ─── Conversation Row (WhatsApp style) ───────────────────────────────────────

function ConversationRow({ lead, isNew, onClick }: {
  lead: Lead; isNew: boolean; onClick: () => void;
}) {
  const name = getLeadName(lead);
  const initials = name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const palette = avatarPalette(name);
  const preview = getLeadPreview(lead);
  const dot = STATE_DOT[lead.state];

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 active:bg-white/[0.04] transition-colors text-left"
    >
      {/* Avatar with state dot */}
      <div className="relative flex-shrink-0">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-[15px] font-bold"
          style={{ background: palette.bg, color: palette.text }}
        >
          {initials || <User size={18} style={{ color: palette.text }} />}
        </div>
        <span
          className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2"
          style={{ backgroundColor: dot, borderColor: "#0D1520" }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 border-b border-white/[0.05] pb-3 pt-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className="font-semibold text-[15px] truncate"
            style={{ color: isNew ? "#EAF0F7" : "#B0C4D8" }}
          >
            {name}
          </span>
          <span className="text-[11px] flex-shrink-0" style={{ color: isNew ? "#00BFA5" : "#3E576F" }}>
            {formatTime(lead.updatedAt)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span
            className="text-[13px] truncate flex-1 min-w-0"
            style={{ color: isNew ? "#7B96B2" : "#3E576F" }}
          >
            {preview}
          </span>
          {isNew && (
            <span className="flex-shrink-0 w-2 h-2 rounded-full bg-[#00BFA5]" />
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Conversation Detail ──────────────────────────────────────────────────────

function Bubble({ isUser, text, ts }: { isUser: boolean; text: string; ts?: string }) {
  return (
    <div className={`flex mb-1.5 ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[78%] px-3.5 py-2 text-[14px] leading-relaxed"
        style={{
          borderRadius: isUser ? "18px 4px 18px 18px" : "4px 18px 18px 18px",
          background: isUser
            ? "linear-gradient(135deg, #1A4A35 0%, #0F3025 100%)"
            : "#1A2535",
          color: isUser ? "#D4F5E5" : "#C8DCF0",
          border: isUser
            ? "1px solid rgba(0,200,150,0.15)"
            : "1px solid rgba(100,150,220,0.1)",
        }}
      >
        {text}
        {ts && (
          <p className="text-[9px] mt-1 text-right" style={{ color: "#4A6580" }}>
            {new Date(ts).toLocaleTimeString("pt-AO", { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>
    </div>
  );
}

function ConversationDetail({ lead: initialLead, onBack, onStateChange, api }: {
  lead: Lead; onBack: () => void; onStateChange: (l: Lead) => void;
  api: ReturnType<typeof businessApi>;
}) {
  const [lead, setLead] = useState(initialLead);
  const [updating, setUpdating] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  async function handleState(state: LeadState) {
    setUpdating(true);
    try {
      const { lead: updated } = await api.updateLeadState(lead.id, state);
      setLead(updated);
      onStateChange(updated);
    } finally {
      setUpdating(false);
    }
  }

  const waPhone = lead.qualificationData.phone
    ?.replace(/\D/g, "").replace(/^00/, "").replace(/^0/, "244");
  const waUrl = waPhone
    ? `https://wa.me/${waPhone}${lead.whatsappMessage ? `?text=${encodeURIComponent(lead.whatsappMessage)}` : ""}`
    : null;

  const name = getLeadName(lead);
  const palette = avatarPalette(name);
  const initials = name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const parsedTranscript = lead.callTranscript ? parseTranscript(lead.callTranscript) : null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.06] flex-shrink-0"
        style={{ background: "#0D1824" }}
      >
        <button
          onClick={onBack}
          className="text-[#3E576F] hover:text-[#EAF0F7] transition-colors p-1 -ml-1"
        >
          <ArrowLeft size={20} />
        </button>
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
          style={{ background: palette.bg, color: palette.text }}
        >
          {initials || <User size={14} style={{ color: palette.text }} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[#EAF0F7] text-sm truncate">{name}</p>
          <p className="text-[11px] text-[#3E576F] truncate">
            {lead.qualificationData.phone ?? lead.qualificationData.interest ?? formatTime(lead.createdAt)}
          </p>
        </div>
        {lead.score !== null && (
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
            style={{ color: scoreColor(lead.score), background: scoreColor(lead.score) + "18" }}
          >
            {lead.score}/100
          </span>
        )}
      </div>

      {/* Thread */}
      <div
        className="flex-1 overflow-y-auto px-3 py-4"
        style={{ background: "#080E18" }}
      >
        {/* Date pill */}
        <div className="flex justify-center mb-4">
          <span
            className="text-[10px] px-3 py-1 rounded-full"
            style={{ background: "#111B27", color: "#3E576F", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            {new Date(lead.createdAt).toLocaleDateString("pt-AO", { day: "2-digit", month: "long", year: "numeric" })}
          </span>
        </div>

        {/* Chat messages */}
        {lead.chatMessages.map((m, i) => (
          <Bubble key={i} isUser={m.role === "user"} text={m.text} ts={m.ts} />
        ))}

        {/* Voice call divider */}
        {lead.callTranscript && (
          <>
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-white/[0.06]" />
              <div
                className="flex items-center gap-1.5 text-[10px] text-[#3E576F] px-2.5 py-1 rounded-full"
                style={{ background: "#111B27", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <Phone size={10} />
                Chamada de voz
              </div>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>

            {parsedTranscript
              ? parsedTranscript.map((line, i) => (
                  <Bubble key={i} isUser={line.role === "user"} text={line.text} />
                ))
              : (
                <div
                  className="rounded-2xl px-4 py-3 text-xs text-[#B0C4D8] whitespace-pre-wrap leading-relaxed"
                  style={{ background: "#111B27", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  {lead.callTranscript}
                </div>
              )}
          </>
        )}

        {/* AI summary */}
        {lead.aiSummary && (
          <div
            className="mt-4 rounded-2xl p-3.5"
            style={{ background: "#111B27", border: "1px solid rgba(0,191,165,0.15)" }}
          >
            <p className="text-[10px] text-[#00BFA5] font-semibold mb-1.5 uppercase tracking-widest">
              Resumo
            </p>
            <p className="text-[13px] text-[#B0C4D8] leading-relaxed">{lead.aiSummary}</p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-white/[0.06]" style={{ background: "#0A1420" }}>
        {/* Quick info chips */}
        {(lead.qualificationData.phone || lead.qualificationData.budget || lead.qualificationData.timeline || lead.qualificationData.location) && (
          <div className="flex flex-wrap gap-1.5 px-4 py-2.5 border-b border-white/[0.04]">
            {lead.qualificationData.phone && (
              <span className="flex items-center gap-1 text-[11px] text-[#B0C4D8] rounded-full px-2.5 py-1" style={{ background: "#111B27" }}>
                <Phone size={10} className="text-[#00BFA5]" /> {lead.qualificationData.phone}
              </span>
            )}
            {lead.qualificationData.budget && (
              <span className="flex items-center gap-1 text-[11px] text-[#B0C4D8] rounded-full px-2.5 py-1" style={{ background: "#111B27" }}>
                <DollarSign size={10} className="text-[#00BFA5]" /> {lead.qualificationData.budget}
              </span>
            )}
            {lead.qualificationData.timeline && (
              <span className="flex items-center gap-1 text-[11px] text-[#B0C4D8] rounded-full px-2.5 py-1" style={{ background: "#111B27" }}>
                <Clock size={10} className="text-[#00BFA5]" /> {lead.qualificationData.timeline}
              </span>
            )}
            {lead.qualificationData.location && (
              <span className="flex items-center gap-1 text-[11px] text-[#B0C4D8] rounded-full px-2.5 py-1" style={{ background: "#111B27" }}>
                <MapPin size={10} className="text-[#00BFA5]" /> {lead.qualificationData.location}
              </span>
            )}
          </div>
        )}

        {/* State selector */}
        <div className="flex gap-2 px-4 py-2.5 overflow-x-auto scrollbar-none border-b border-white/[0.04]">
          {STATE_ORDER.map((s) => (
            <button
              key={s}
              disabled={s === lead.state || updating}
              onClick={() => handleState(s)}
              className={`flex-shrink-0 text-[10px] px-3 py-1 rounded-full border transition-all ${
                s === lead.state
                  ? `${STATE_COLORS[s]} font-semibold`
                  : "border-white/10 text-[#3E576F] hover:border-white/30 hover:text-[#B0C4D8]"
              } disabled:opacity-40`}
            >
              {STATE_LABELS[s]}
            </button>
          ))}
        </div>

        {/* WhatsApp CTA */}
        {waUrl && (
          <div className="px-4 py-3">
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-white font-semibold text-sm py-3 rounded-2xl transition-colors"
              style={{ background: "#25D366" }}
            >
              <MessageCircle size={16} />
              Continuar no WhatsApp
              <ExternalLink size={12} className="opacity-70" />
            </a>
          </div>
        )}
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
    } finally {
      setLoading(false);
    }
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
      const name = (l.qualificationData.name ?? "").toLowerCase();
      const phone = (l.qualificationData.phone ?? "").toLowerCase();
      const interest = (l.qualificationData.interest ?? "").toLowerCase();
      if (!name.includes(q) && !phone.includes(q) && !interest.includes(q)) return false;
    }
    return true;
  });

  const qualifiedCount = leads.filter((l) => l.state === "qualificado").length;
  const today = new Date().toDateString();
  const todayCount = leads.filter((l) => new Date(l.createdAt).toDateString() === today).length;

  if (!slug || !api) {
    return (
      <div className="flex items-center justify-center h-full bg-[#080E18] text-[#3E576F] text-sm">
        Negócio não encontrado
      </div>
    );
  }

  if (selected) {
    return (
      <div className="flex flex-col h-full bg-[#080E18]">
        <ConversationDetail
          lead={selected}
          api={api}
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

  return (
    <div className="flex flex-col h-full" style={{ background: "#0D1520" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 pt-4 pb-3 flex-shrink-0"
        style={{ background: "#0D1520" }}
      >
        <div>
          <h1 className="text-[18px] font-bold text-[#EAF0F7] leading-tight">Conversas</h1>
          <p className="text-[12px] text-[#3E576F] mt-0.5">
            {leads.length > 0
              ? `${leads.length} conversa${leads.length !== 1 ? "s" : ""} · ${qualifiedCount} qualificado${qualifiedCount !== 1 ? "s" : ""} · ${todayCount} hoje`
              : "Nenhuma conversa ainda"}
          </p>
        </div>
        <button
          onClick={load}
          className="w-9 h-9 rounded-full flex items-center justify-center text-[#3E576F] hover:text-[#EAF0F7] hover:bg-white/[0.04] transition-colors"
          aria-label="Atualizar"
        >
          <Search size={17} />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 pb-2 flex-shrink-0">
        <div
          className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl"
          style={{ background: "#111B27" }}
        >
          <Search size={14} className="text-[#3E576F] flex-shrink-0" />
          <input
            className="flex-1 bg-transparent text-[14px] text-[#EAF0F7] placeholder:text-[#3E576F] outline-none"
            placeholder="Pesquisar…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ fontSize: "16px" }}
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="px-4 pb-1 flex gap-2 overflow-x-auto scrollbar-none flex-shrink-0">
        {(["todos", ...STATE_ORDER] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`flex-shrink-0 text-[11px] px-3 py-1.5 rounded-full transition-colors ${
              filter === s
                ? "bg-[#00BFA5] text-[#080E18] font-semibold"
                : "text-[#3E576F] hover:text-[#7A9BB5]"
            }`}
            style={filter !== s ? { background: "#111B27" } : {}}
          >
            {s === "todos" ? "Todas" : STATE_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Notification bar */}
      {notification && (
        <div className="mx-4 mt-1 mb-1 flex items-center gap-2 rounded-xl px-3 py-2 flex-shrink-0"
          style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)" }}>
          <Bell size={12} className="text-emerald-400 flex-shrink-0" />
          <span className="text-xs text-emerald-300 font-medium">{notification}</span>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto" style={{ background: "#0D1520" }}>
        {loading ? (
          <div className="flex items-center justify-center h-32 text-[#3E576F] text-sm">
            A carregar…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "#111B27" }}>
              <MessageCircle size={24} className="text-[#3E576F]" />
            </div>
            <p className="text-sm text-[#3E576F] text-center px-8">
              {leads.length === 0
                ? "Partilha o teu link de captação para receber os primeiros clientes"
                : "Sem conversas com estes filtros"}
            </p>
          </div>
        ) : (
          <div>
            {filtered.map((lead) => (
              <ConversationRow
                key={lead.id}
                lead={lead}
                isNew={newIds.has(lead.id)}
                onClick={async () => {
                  try {
                    const { lead: fresh } = await api.getLeadDetail(lead.id);
                    setSelected(fresh);
                  } catch {
                    setSelected(lead);
                  }
                  setNewIds((prev) => {
                    const next = new Set(prev);
                    next.delete(lead.id);
                    return next;
                  });
                }}
              />
            ))}
          </div>
        )}
      </div>

      <OwnerNav />
    </div>
  );
}
