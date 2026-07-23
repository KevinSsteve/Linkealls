import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  Search,
  Phone,
  MessageCircle,
  Star,
  ChevronRight,
  User,
  DollarSign,
  Clock,
  MapPin,
  FileText,
  ExternalLink,
  RefreshCw,
  Bell,
} from "lucide-react";
import {
  listLeads,
  getLeadDetail,
  updateLeadState,
  getLeadsEventsUrl,
  type Lead,
  type LeadState,
} from "../../lib/api";

// ─── State badge config ───────────────────────────────────────────────────────

const STATE_LABELS: Record<LeadState, string> = {
  novo: "Novo",
  em_atendimento: "Em atendimento",
  qualificado: "Qualificado",
  entregue: "Entregue",
  perdido: "Perdido",
};

const STATE_COLORS: Record<LeadState, string> = {
  novo: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  em_atendimento: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  qualificado: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  entregue: "bg-teal-500/20 text-teal-300 border-teal-500/30",
  perdido: "bg-red-500/20 text-red-300 border-red-500/30",
};

const STATE_ORDER: LeadState[] = [
  "novo",
  "em_atendimento",
  "qualificado",
  "entregue",
  "perdido",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-AO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getLeadName(lead: Lead): string {
  return lead.qualificationData.name || "Lead sem nome";
}

function getLeadContact(lead: Lead): string {
  return (
    lead.qualificationData.phone ||
    lead.qualificationData.email ||
    "sem contacto"
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const color =
    score >= 80
      ? "text-emerald-400"
      : score >= 60
        ? "text-teal-400"
        : score >= 40
          ? "text-yellow-400"
          : "text-red-400";
  return (
    <span className={`font-bold text-sm ${color}`}>{score}/100</span>
  );
}

// ─── Lead row ─────────────────────────────────────────────────────────────────

function LeadRow({
  lead,
  isNew,
  onClick,
}: {
  lead: Lead;
  isNew: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left border-b border-white/5"
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-[#1E2D3D] flex items-center justify-center">
          <User size={18} className="text-[#00BFA5]" />
        </div>
        {isNew && (
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-blue-500 border-2 border-[#0D1520]" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-[#EAF0F7] truncate text-sm">
            {getLeadName(lead)}
          </span>
          <span className="text-[10px] text-[#3E576F] flex-shrink-0">
            {formatDate(lead.createdAt)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded border ${STATE_COLORS[lead.state]}`}
          >
            {STATE_LABELS[lead.state]}
          </span>
          <span className="text-[11px] text-[#3E576F] truncate">
            {getLeadContact(lead)}
          </span>
          {lead.score !== null && (
            <ScoreBadge score={lead.score} />
          )}
        </div>
      </div>

      <ChevronRight size={14} className="text-[#3E576F] flex-shrink-0" />
    </button>
  );
}

// ─── Lead Detail ──────────────────────────────────────────────────────────────

function LeadDetail({
  lead: initialLead,
  onBack,
  onStateChange,
}: {
  lead: Lead;
  onBack: () => void;
  onStateChange: (updated: Lead) => void;
}) {
  const [lead, setLead] = useState(initialLead);
  const [updatingState, setUpdatingState] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  async function handleStateChange(state: LeadState) {
    setUpdatingState(true);
    try {
      const { lead: updated } = await updateLeadState(lead.id, state);
      setLead(updated);
      onStateChange(updated);
    } finally {
      setUpdatingState(false);
    }
  }

  const waPhone = lead.qualificationData.phone
    ? lead.qualificationData.phone.replace(/\D/g, "").replace(/^00/, "").replace(/^0/, "244")
    : null;
  const waUrl = waPhone
    ? `https://wa.me/${waPhone}${lead.whatsappMessage ? `?text=${encodeURIComponent(lead.whatsappMessage)}` : ""}`
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-white/10"
        style={{ background: "#111B27" }}
      >
        <button onClick={onBack} className="text-[#3E576F] hover:text-[#EAF0F7]">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[#EAF0F7] truncate">{getLeadName(lead)}</p>
          <p className="text-xs text-[#3E576F]">{formatDate(lead.createdAt)}</p>
        </div>
        <span
          className={`text-xs px-2 py-1 rounded border ${STATE_COLORS[lead.state]}`}
        >
          {STATE_LABELS[lead.state]}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Score + WhatsApp CTA */}
        {(lead.score !== null || waUrl) && (
          <div className="mx-4 mt-4 rounded-xl border border-white/10 bg-[#0F1923] p-4 flex items-center gap-4">
            {lead.score !== null && (
              <div className="text-center">
                <p className="text-xs text-[#3E576F] mb-0.5">Pontuação</p>
                <ScoreBadge score={lead.score} />
              </div>
            )}
            {waUrl && (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 bg-[#25D366] text-white font-semibold text-sm py-2.5 px-4 rounded-lg hover:bg-[#1ebe5c] transition-colors"
              >
                <MessageCircle size={16} />
                Enviar WhatsApp
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        )}

        {/* Qualification data */}
        <div className="mx-4 mt-4 rounded-xl border border-white/10 bg-[#0F1923] p-4">
          <p className="text-xs font-semibold text-[#3E576F] uppercase tracking-wider mb-3">
            Dados do Lead
          </p>
          <div className="space-y-2.5">
            {lead.qualificationData.name && (
              <div className="flex items-start gap-2.5">
                <User size={14} className="text-[#00BFA5] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-[#3E576F]">Nome</p>
                  <p className="text-sm text-[#EAF0F7]">{lead.qualificationData.name}</p>
                </div>
              </div>
            )}
            {lead.qualificationData.phone && (
              <div className="flex items-start gap-2.5">
                <Phone size={14} className="text-[#00BFA5] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-[#3E576F]">Telefone</p>
                  <p className="text-sm text-[#EAF0F7]">{lead.qualificationData.phone}</p>
                </div>
              </div>
            )}
            {lead.qualificationData.interest && (
              <div className="flex items-start gap-2.5">
                <Star size={14} className="text-[#00BFA5] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-[#3E576F]">Interesse</p>
                  <p className="text-sm text-[#EAF0F7]">{lead.qualificationData.interest}</p>
                </div>
              </div>
            )}
            {lead.qualificationData.budget && (
              <div className="flex items-start gap-2.5">
                <DollarSign size={14} className="text-[#00BFA5] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-[#3E576F]">Orçamento</p>
                  <p className="text-sm text-[#EAF0F7]">{lead.qualificationData.budget}</p>
                </div>
              </div>
            )}
            {lead.qualificationData.timeline && (
              <div className="flex items-start gap-2.5">
                <Clock size={14} className="text-[#00BFA5] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-[#3E576F]">Prazo</p>
                  <p className="text-sm text-[#EAF0F7]">{lead.qualificationData.timeline}</p>
                </div>
              </div>
            )}
            {lead.qualificationData.location && (
              <div className="flex items-start gap-2.5">
                <MapPin size={14} className="text-[#00BFA5] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-[#3E576F]">Localização</p>
                  <p className="text-sm text-[#EAF0F7]">{lead.qualificationData.location}</p>
                </div>
              </div>
            )}
            {lead.qualificationData.extras &&
              Object.entries(lead.qualificationData.extras).map(([k, v]) => (
                <div key={k} className="flex items-start gap-2.5">
                  <FileText size={14} className="text-[#00BFA5] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-[#3E576F]">{k}</p>
                    <p className="text-sm text-[#EAF0F7]">{v}</p>
                  </div>
                </div>
              ))}
            {!lead.qualificationData.name &&
              !lead.qualificationData.phone &&
              !lead.qualificationData.interest && (
                <p className="text-sm text-[#3E576F] italic">Sem dados extraídos ainda</p>
              )}
          </div>
        </div>

        {/* AI Summary */}
        {lead.aiSummary && (
          <div className="mx-4 mt-4 rounded-xl border border-white/10 bg-[#0F1923] p-4">
            <p className="text-xs font-semibold text-[#3E576F] uppercase tracking-wider mb-2">
              Resumo da IA
            </p>
            <p className="text-sm text-[#B0C4D8] leading-relaxed whitespace-pre-wrap">
              {lead.aiSummary}
            </p>
          </div>
        )}

        {/* Origin */}
        {(lead.origin.source || lead.origin.campaign) && (
          <div className="mx-4 mt-4 rounded-xl border border-white/10 bg-[#0F1923] p-4">
            <p className="text-xs font-semibold text-[#3E576F] uppercase tracking-wider mb-2">
              Origem
            </p>
            <div className="flex flex-wrap gap-2">
              {lead.origin.source && (
                <span className="text-xs bg-white/5 rounded px-2 py-1 text-[#B0C4D8]">
                  source: {lead.origin.source}
                </span>
              )}
              {lead.origin.medium && (
                <span className="text-xs bg-white/5 rounded px-2 py-1 text-[#B0C4D8]">
                  medium: {lead.origin.medium}
                </span>
              )}
              {lead.origin.campaign && (
                <span className="text-xs bg-white/5 rounded px-2 py-1 text-[#B0C4D8]">
                  campaign: {lead.origin.campaign}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Transcript toggle */}
        {lead.callTranscript && (
          <div className="mx-4 mt-4 mb-2">
            <button
              onClick={() => setShowTranscript((v) => !v)}
              className="text-xs text-[#00BFA5] hover:underline flex items-center gap-1"
            >
              <FileText size={12} />
              {showTranscript ? "Ocultar transcrição" : "Ver transcrição completa"}
            </button>
            {showTranscript && (
              <div className="mt-2 rounded-xl border border-white/10 bg-[#0F1923] p-4">
                <pre className="text-xs text-[#B0C4D8] whitespace-pre-wrap font-mono leading-relaxed">
                  {lead.callTranscript}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Chat messages */}
        {lead.chatMessages.length > 0 && (
          <div className="mx-4 mt-4 mb-4 rounded-xl border border-white/10 bg-[#0F1923] p-4">
            <p className="text-xs font-semibold text-[#3E576F] uppercase tracking-wider mb-3">
              Mensagens do Chat
            </p>
            <div className="space-y-2">
              {lead.chatMessages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <span
                    className={`text-xs px-3 py-1.5 rounded-lg max-w-[80%] ${
                      m.role === "user"
                        ? "bg-[#005C4B] text-[#EAF0F7]"
                        : "bg-[#1E2D3D] text-[#B0C4D8]"
                    }`}
                  >
                    {m.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* State change */}
        <div className="mx-4 mt-4 mb-6 rounded-xl border border-white/10 bg-[#0F1923] p-4">
          <p className="text-xs font-semibold text-[#3E576F] uppercase tracking-wider mb-3">
            Alterar Estado
          </p>
          <div className="flex flex-wrap gap-2">
            {STATE_ORDER.map((s) => (
              <button
                key={s}
                disabled={s === lead.state || updatingState}
                onClick={() => handleStateChange(s)}
                className={`text-xs px-3 py-1.5 rounded border transition-opacity ${
                  s === lead.state
                    ? `${STATE_COLORS[s]} opacity-100 font-semibold`
                    : "border-white/10 text-[#3E576F] hover:border-white/30 hover:text-[#B0C4D8]"
                } disabled:opacity-40`}
              >
                {STATE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Leads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [search, setSearch] = useState("");
  const [filterState, setFilterState] = useState<LeadState | "todos">("todos");
  const [newLeadIds, setNewLeadIds] = useState<Set<string>>(new Set());
  const [notification, setNotification] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const loadLeads = useCallback(async () => {
    try {
      const { leads: data } = await listLeads();
      setLeads(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  // SSE for real-time qualified notifications
  useEffect(() => {
    const es = new EventSource(getLeadsEventsUrl());
    eventSourceRef.current = es;

    es.addEventListener("lead_qualified", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { leadId: string };
      setNewLeadIds((prev) => new Set([...prev, data.leadId]));
      setNotification("🎯 Novo lead qualificado!");
      // Refresh list
      void loadLeads();
      setTimeout(() => setNotification(null), 5000);
    });

    return () => es.close();
  }, [loadLeads]);

  const filtered = leads.filter((l) => {
    if (filterState !== "todos" && l.state !== filterState) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = (l.qualificationData.name ?? "").toLowerCase();
      const phone = (l.qualificationData.phone ?? "").toLowerCase();
      const interest = (l.qualificationData.interest ?? "").toLowerCase();
      if (!name.includes(q) && !phone.includes(q) && !interest.includes(q)) return false;
    }
    return true;
  });

  if (selectedLead) {
    return (
      <div className="flex flex-col h-full bg-[#080E18]">
        <LeadDetail
          lead={selectedLead}
          onBack={() => setSelectedLead(null)}
          onStateChange={(updated) => {
            setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
            setSelectedLead(updated);
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#080E18]">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-white/10"
        style={{ background: "#111B27" }}
      >
        <Link href="/dono" className="text-[#3E576F] hover:text-[#EAF0F7]">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <p className="font-semibold text-[#EAF0F7]">Caixa de Leads</p>
          <p className="text-xs text-[#3E576F]">{leads.length} leads no total</p>
        </div>
        <button
          onClick={loadLeads}
          className="text-[#3E576F] hover:text-[#EAF0F7] transition-colors"
          title="Atualizar"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Notification banner */}
      {notification && (
        <div className="mx-4 mt-3 flex items-center gap-2 bg-emerald-500/20 border border-emerald-500/30 rounded-lg px-3 py-2">
          <Bell size={14} className="text-emerald-400" />
          <span className="text-xs text-emerald-300 font-medium">{notification}</span>
        </div>
      )}

      {/* Search */}
      <div className="px-4 pt-3">
        <div className="flex items-center gap-2 bg-[#111B27] border border-white/10 rounded-lg px-3 py-2">
          <Search size={14} className="text-[#3E576F]" />
          <input
            className="flex-1 bg-transparent text-sm text-[#EAF0F7] placeholder:text-[#3E576F] outline-none"
            placeholder="Pesquisar leads…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="px-4 pt-2 flex gap-2 overflow-x-auto scrollbar-none pb-1">
        {(["todos", ...STATE_ORDER] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterState(s)}
            className={`flex-shrink-0 text-xs px-3 py-1 rounded-full border transition-colors ${
              filterState === s
                ? "bg-[#00BFA5] border-[#00BFA5] text-[#080E18] font-semibold"
                : "border-white/10 text-[#3E576F] hover:text-[#EAF0F7]"
            }`}
          >
            {s === "todos"
              ? "Todos"
              : STATE_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Lead list */}
      <div className="flex-1 overflow-y-auto mt-2">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-[#3E576F] text-sm">
            A carregar…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-[#3E576F] text-sm gap-2">
            <User size={28} className="opacity-30" />
            <p>Nenhum lead encontrado</p>
          </div>
        ) : (
          filtered.map((lead) => (
            <LeadRow
              key={lead.id}
              lead={lead}
              isNew={newLeadIds.has(lead.id)}
              onClick={async () => {
                // Load fresh detail on click
                try {
                  const { lead: fresh } = await getLeadDetail(lead.id);
                  setSelectedLead(fresh);
                } catch {
                  setSelectedLead(lead);
                }
                setNewLeadIds((prev) => {
                  const next = new Set(prev);
                  next.delete(lead.id);
                  return next;
                });
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
