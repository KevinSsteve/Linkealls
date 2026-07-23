/**
 * Conversas — lista WhatsApp-style de todas as conversas da IA com clientes.
 * Mostra chat inicial + transcrição de chamada num único thread por lead.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft, User, MessageSquare, Phone, Bell,
  Search, RefreshCw, ChevronRight, ExternalLink,
  Star, DollarSign, Clock, MapPin, FileText,
} from "lucide-react";
import {
  listLeads, getLeadDetail, updateLeadState,
  getLeadsEventsUrl, type Lead, type LeadState,
} from "../../lib/api";
import { OwnerNav } from "../../components/owner/OwnerNav";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATE_LABELS: Record<LeadState, string> = {
  novo: "Novo", em_atendimento: "Em atendimento",
  qualificado: "Qualificado", entregue: "Entregue", perdido: "Perdido",
};

const STATE_COLORS: Record<LeadState, string> = {
  novo:           "bg-blue-500/20 text-blue-300 border-blue-500/30",
  em_atendimento: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  qualificado:    "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  entregue:       "bg-teal-500/20 text-teal-300 border-teal-500/30",
  perdido:        "bg-red-500/20 text-red-300 border-red-500/30",
};

const STATE_ORDER: LeadState[] = [
  "novo", "em_atendimento", "qualificado", "entregue", "perdido",
];

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
  const prefix = last.role === "user" ? "" : "🤖 ";
  const t = last.text;
  return prefix + (t.length > 55 ? t.slice(0, 55) + "…" : t);
}

function scoreColor(score: number) {
  if (score >= 80) return "#10B981";
  if (score >= 60) return "#14B8A6";
  if (score >= 40) return "#F59E0B";
  return "#EF4444";
}

/** Try to parse "User: …" / "AI: …" transcript lines. Falls back to raw block. */
function parseTranscript(raw: string): Array<{ role: "user" | "ai"; text: string }> | null {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const parsed: Array<{ role: "user" | "ai"; text: string }> = [];
  for (const line of lines) {
    const m = line.match(/^(user|utilizador|cliente|ai|ia|assistente|bot):\s*(.*)/i);
    if (m) {
      const role = /user|utilizador|cliente/i.test(m[1]) ? "user" : "ai";
      parsed.push({ role, text: m[2] });
    } else {
      // Not parseable — return null so we fall back to raw block
      return null;
    }
  }
  return parsed.length ? parsed : null;
}

// ─── Conversation Row ─────────────────────────────────────────────────────────

function ConversationRow({
  lead, isNew, onClick,
}: {
  lead: Lead; isNew: boolean; onClick: () => void;
}) {
  const name = getLeadName(lead);
  const initials = name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors text-left border-b border-white/[0.04]"
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold"
          style={{ background: "#1E2D3D", color: "#00BFA5" }}
        >
          {initials || <User size={16} />}
        </div>
        {isNew && (
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-blue-500 border-2 border-[#0D1520]" />
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-[#EAF0F7] text-sm truncate">{name}</span>
          <span className="text-[10px] text-[#3E576F] flex-shrink-0">{formatTime(lead.createdAt)}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ${STATE_COLORS[lead.state]}`}
          >
            {STATE_LABELS[lead.state]}
          </span>
          <span className="text-[11px] text-[#3E576F] truncate">{getLeadPreview(lead)}</span>
        </div>
      </div>

      <ChevronRight size={14} className="text-[#3E576F] flex-shrink-0" />
    </button>
  );
}

// ─── Conversation Detail ──────────────────────────────────────────────────────

function ConversationDetail({
  lead: initialLead, onBack, onStateChange,
}: {
  lead: Lead; onBack: () => void; onStateChange: (l: Lead) => void;
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
      const { lead: updated } = await updateLeadState(lead.id, state);
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

  const parsedTranscript = lead.callTranscript ? parseTranscript(lead.callTranscript) : null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0"
        style={{ background: "#111B27" }}
      >
        <button onClick={onBack} className="text-[#3E576F] hover:text-[#EAF0F7] transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[#EAF0F7] text-sm truncate">{getLeadName(lead)}</p>
          <p className="text-[11px] text-[#3E576F]">
            {lead.qualificationData.interest ?? formatTime(lead.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {lead.score !== null && (
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ color: scoreColor(lead.score), background: scoreColor(lead.score) + "18" }}
            >
              {lead.score}/100
            </span>
          )}
          <span className={`text-[10px] px-2 py-0.5 rounded border ${STATE_COLORS[lead.state]}`}>
            {STATE_LABELS[lead.state]}
          </span>
        </div>
      </div>

      {/* Thread */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1" style={{ background: "#080E18" }}>
        {/* Date pill */}
        <div className="flex justify-center mb-3">
          <span className="text-[10px] px-3 py-1 rounded-full"
            style={{ background: "rgba(255,255,255,0.04)", color: "#3E576F", border: "1px solid rgba(255,255,255,0.06)" }}>
            {new Date(lead.createdAt).toLocaleDateString("pt-AO", { day: "2-digit", month: "long", year: "numeric" })}
          </span>
        </div>

        {/* Chat messages */}
        {lead.chatMessages.map((m, i) => {
          const isUser = m.role === "user";
          return (
            <div key={i} className={`flex mb-2 ${isUser ? "justify-end" : "justify-start"}`}>
              <div
                className="max-w-[78%] px-3 py-2 text-[13px] leading-relaxed"
                style={{
                  borderRadius: isUser ? "14px 4px 14px 14px" : "4px 14px 14px 14px",
                  background: isUser
                    ? "linear-gradient(135deg, #1C5140 0%, #12362A 100%)"
                    : "linear-gradient(135deg, #1A2B3D 0%, #10192C 100%)",
                  color: isUser ? "#C8F5E2" : "#C8DCF0",
                  border: isUser
                    ? "1px solid rgba(0,200,150,0.12)"
                    : "1px solid rgba(100,150,220,0.08)",
                }}
              >
                {m.text}
                <p className="text-[9px] mt-1 text-right" style={{ color: "#3E576F" }}>
                  {new Date(m.ts).toLocaleTimeString("pt-AO", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}

        {/* Voice call divider */}
        {lead.callTranscript && (
          <>
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-white/10" />
              <div className="flex items-center gap-1.5 text-[11px] text-[#3E576F] px-2 py-1 rounded-full border border-white/10"
                style={{ background: "#111B27" }}>
                <Phone size={11} />
                Chamada de voz
              </div>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            {/* Transcript bubbles or raw */}
            {parsedTranscript ? (
              parsedTranscript.map((line, i) => {
                const isUser = line.role === "user";
                return (
                  <div key={i} className={`flex mb-2 ${isUser ? "justify-end" : "justify-start"}`}>
                    <div
                      className="max-w-[78%] px-3 py-2 text-[13px] leading-relaxed"
                      style={{
                        borderRadius: isUser ? "14px 4px 14px 14px" : "4px 14px 14px 14px",
                        background: isUser
                          ? "linear-gradient(135deg, #1C5140 0%, #12362A 100%)"
                          : "linear-gradient(135deg, #1A2B3D 0%, #10192C 100%)",
                        color: isUser ? "#C8F5E2" : "#C8DCF0",
                        border: isUser
                          ? "1px solid rgba(0,200,150,0.12)"
                          : "1px solid rgba(100,150,220,0.08)",
                      }}
                    >
                      {line.text}
                    </div>
                  </div>
                );
              })
            ) : (
              <div
                className="rounded-xl px-3.5 py-3 text-xs text-[#B0C4D8] whitespace-pre-wrap font-mono leading-relaxed"
                style={{ background: "#0F1923", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                {lead.callTranscript}
              </div>
            )}
          </>
        )}

        {/* AI summary */}
        {lead.aiSummary && (
          <div className="mt-3 rounded-xl p-3"
            style={{ background: "#0F1923", border: "1px solid rgba(0,191,165,0.12)" }}>
            <p className="text-[10px] text-[#00BFA5] font-semibold mb-1 uppercase tracking-wider">Resumo da IA</p>
            <p className="text-xs text-[#B0C4D8] leading-relaxed">{lead.aiSummary}</p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Lead info footer */}
      <div className="flex-shrink-0 border-t border-white/10" style={{ background: "#0C1520" }}>
        {/* Qualification fields */}
        {(lead.qualificationData.phone || lead.qualificationData.budget || lead.qualificationData.timeline || lead.qualificationData.location) && (
          <div className="flex flex-wrap gap-2 px-4 py-2 border-b border-white/[0.04]">
            {lead.qualificationData.phone && (
              <span className="flex items-center gap-1 text-[11px] text-[#B0C4D8] bg-white/[0.04] rounded px-2 py-1">
                <Phone size={10} className="text-[#00BFA5]" /> {lead.qualificationData.phone}
              </span>
            )}
            {lead.qualificationData.budget && (
              <span className="flex items-center gap-1 text-[11px] text-[#B0C4D8] bg-white/[0.04] rounded px-2 py-1">
                <DollarSign size={10} className="text-[#00BFA5]" /> {lead.qualificationData.budget}
              </span>
            )}
            {lead.qualificationData.timeline && (
              <span className="flex items-center gap-1 text-[11px] text-[#B0C4D8] bg-white/[0.04] rounded px-2 py-1">
                <Clock size={10} className="text-[#00BFA5]" /> {lead.qualificationData.timeline}
              </span>
            )}
            {lead.qualificationData.location && (
              <span className="flex items-center gap-1 text-[11px] text-[#B0C4D8] bg-white/[0.04] rounded px-2 py-1">
                <MapPin size={10} className="text-[#00BFA5]" /> {lead.qualificationData.location}
              </span>
            )}
          </div>
        )}

        {/* State chips */}
        <div className="flex gap-1.5 px-4 py-2 overflow-x-auto scrollbar-none border-b border-white/[0.04]">
          {STATE_ORDER.map((s) => (
            <button
              key={s}
              disabled={s === lead.state || updating}
              onClick={() => handleState(s)}
              className={`flex-shrink-0 text-[10px] px-2.5 py-1 rounded-full border transition-all ${
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
          <div className="px-4 py-2.5">
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-[#25D366] text-white font-semibold text-sm py-2.5 rounded-xl hover:bg-[#1ebe5c] transition-colors"
            >
              <MessageSquare size={15} />
              Continuar no WhatsApp
              <ExternalLink size={12} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function Conversas() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<LeadState | "todos">("todos");
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [notification, setNotification] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const load = useCallback(async () => {
    try {
      const { leads: data } = await listLeads();
      // sort by most recent activity
      setLeads([...data].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // SSE real-time
  useEffect(() => {
    const es = new EventSource(getLeadsEventsUrl());
    eventSourceRef.current = es;
    es.addEventListener("lead_qualified", (e) => {
      const { leadId } = JSON.parse((e as MessageEvent).data) as { leadId: string };
      setNewIds((prev) => new Set([...prev, leadId]));
      setNotification("🎯 Novo lead qualificado!");
      void load();
      setTimeout(() => setNotification(null), 5000);
    });
    return () => es.close();
  }, [load]);

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

  if (selected) {
    return (
      <div className="flex flex-col h-full bg-[#080E18]">
        <ConversationDetail
          lead={selected}
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
    <div className="flex flex-col h-full bg-[#080E18]">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0"
        style={{ background: "#111B27" }}
      >
        <div className="w-9 h-9 rounded-full bg-[#00BFA5]/15 flex items-center justify-center flex-shrink-0">
          <MessageSquare size={18} className="text-[#00BFA5]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[#EAF0F7] text-sm">Conversas</p>
          <p className="text-xs text-[#3E576F]">{leads.length} conversas com clientes</p>
        </div>
        <button
          onClick={load}
          className="text-[#3E576F] hover:text-[#EAF0F7] transition-colors p-1"
          title="Atualizar"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Quick stats */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-white/[0.04]" style={{ background: "#0C1520" }}>
        <div className="text-center">
          <p className="text-sm font-bold text-[#7B96B2]">{leads.length}</p>
          <p className="text-[9px] text-[#3E576F]">Total</p>
        </div>
        <div className="w-px h-6 bg-white/10" />
        <div className="text-center">
          <p className="text-sm font-bold text-emerald-400">{qualifiedCount}</p>
          <p className="text-[9px] text-[#3E576F]">Qualificados</p>
        </div>
        <div className="w-px h-6 bg-white/10" />
        <div className="text-center">
          <p className="text-sm font-bold text-blue-400">{todayCount}</p>
          <p className="text-[9px] text-[#3E576F]">Hoje</p>
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div className="mx-4 mt-2 flex items-center gap-2 bg-emerald-500/20 border border-emerald-500/30 rounded-lg px-3 py-2 flex-shrink-0">
          <Bell size={13} className="text-emerald-400" />
          <span className="text-xs text-emerald-300 font-medium">{notification}</span>
        </div>
      )}

      {/* Search */}
      <div className="px-4 pt-3 pb-1 flex-shrink-0">
        <div className="flex items-center gap-2 bg-[#111B27] border border-white/10 rounded-lg px-3 py-2">
          <Search size={13} className="text-[#3E576F]" />
          <input
            className="flex-1 bg-transparent text-sm text-[#EAF0F7] placeholder:text-[#3E576F] outline-none"
            placeholder="Pesquisar por nome, telefone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="px-4 py-1.5 flex gap-2 overflow-x-auto scrollbar-none flex-shrink-0">
        {(["todos", ...STATE_ORDER] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`flex-shrink-0 text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
              filter === s
                ? "bg-[#00BFA5] border-[#00BFA5] text-[#080E18] font-semibold"
                : "border-white/10 text-[#3E576F] hover:text-[#EAF0F7]"
            }`}
          >
            {s === "todos" ? "Todos" : STATE_LABELS[s]}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-[#3E576F] text-sm">
            A carregar…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <MessageSquare size={28} className="text-[#3E576F] opacity-30" />
            <p className="text-sm text-[#3E576F]">
              {leads.length === 0
                ? "Ainda sem conversas — partilha o teu link de captação"
                : "Nenhuma conversa com esses filtros"}
            </p>
          </div>
        ) : (
          filtered.map((lead) => (
            <ConversationRow
              key={lead.id}
              lead={lead}
              isNew={newIds.has(lead.id)}
              onClick={async () => {
                try {
                  const { lead: fresh } = await getLeadDetail(lead.id);
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
          ))
        )}
      </div>

      <OwnerNav />
    </div>
  );
}
