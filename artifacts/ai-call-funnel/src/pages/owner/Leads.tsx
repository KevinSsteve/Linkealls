import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  ArrowLeft, Search, Phone, MessageCircle, Star,
  ChevronRight, User, DollarSign, Clock, MapPin,
  FileText, ExternalLink, RefreshCw,
} from "lucide-react";
import { businessApi, type Lead, type LeadState } from "../../lib/api";
import { useBusinessSlug } from "../../hooks/useBusinessSlug";
import { OwnerNav } from "../../components/owner/OwnerNav";
import { C } from "../../theme";
import { AppHeader, AppIconButton } from "../../components/app/AppHeader";
import { StatusBadge } from "../../components/app/StatusBadge";

// ─── State config ─────────────────────────────────────────────────────────────
const STATE_LABELS: Record<LeadState, string> = {
  novo: "Novo", em_atendimento: "Em atendimento",
  qualificado: "Qualificado", entregue: "Entregue", perdido: "Perdido",
};
const STATE_DOT: Record<LeadState, string> = {
  novo: "#4F8CFF", em_atendimento: "#D9902F",
  qualificado: "#2E8B72", entregue: "#1597A5", perdido: "#D9485F",
};
const STATE_PILL_BG: Record<LeadState, string> = {
  novo: "#E3F2FD", em_atendimento: "#FFF8E1",
  qualificado: "#E8F7F1", entregue: "#E5FAFC", perdido: "#FFF0F2",
};
const STATE_PILL_COLOR: Record<LeadState, string> = {
  novo: "#0277BD", em_atendimento: "#E65100",
  qualificado: "#176B55", entregue: "#0E7480", perdido: "#B9384A",
};
const STATE_ORDER: LeadState[] = ["novo","em_atendimento","qualificado","entregue","perdido"];

// ─── Avatar palettes ──────────────────────────────────────────────────────────
const PALETTES = [
  { bg: "#F3E5F5", text: "#6A1B9A" }, { bg: "#E3F2FD", text: "#0D47A1" },
  { bg: "#FCE4EC", text: "#880E4F" }, { bg: "#E8F5E9", text: "#1B5E20" },
  { bg: "#FFF3E0", text: "#E65100" }, { bg: "#E0F7FA", text: "#006064" },
];
function avatarPalette(name: string) {
  let h = 0; for (const c of name) h = h * 31 + c.charCodeAt(0);
  return PALETTES[Math.abs(h) % PALETTES.length];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-AO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function getLeadName(lead: Lead) { return lead.qualificationData.name || "Lead sem nome"; }
function getLeadContact(lead: Lead) {
  return lead.qualificationData.phone || lead.qualificationData.email || "sem contacto";
}
function scoreColor(score: number) {
  if (score >= 80) return "#2E7D32"; if (score >= 60) return "#00838F";
  if (score >= 40) return "#E65100"; return "#C62828";
}

// ─── Lead Row ────────────────────────────────────────────────────────────────
function LeadRow({ lead, isNew, onClick }: { lead: Lead; isNew: boolean; onClick: () => void }) {
  const name = getLeadName(lead);
  const initials = name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const pal = avatarPalette(name);

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 active:bg-gray-50 transition-colors text-left"
      style={{ background: C.white }}
    >
      {/* Avatar */}
      <div className="relative shrink-0 py-3">
        <div className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-[17px] font-bold"
          style={{ background: pal.bg, color: pal.text }}>
          {initials || <User size={20} />}
        </div>
        {isNew && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white"
            style={{ background: "#29B6F6" }} />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 py-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold text-[16px] truncate" style={{ color: "#0B141A" }}>{name}</span>
          <span className="text-[12px] shrink-0" style={{ color: C.text3 }}>{formatDate(lead.createdAt)}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0"
            style={{ background: STATE_PILL_BG[lead.state], color: STATE_PILL_COLOR[lead.state] }}>
            {STATE_LABELS[lead.state]}
          </span>
          <span className="text-[12px] truncate" style={{ color: C.text2 }}>{getLeadContact(lead)}</span>
          {lead.score !== null && (
            <span className="text-[12px] font-bold shrink-0" style={{ color: scoreColor(lead.score) }}>
              {lead.score}/100
            </span>
          )}
        </div>
      </div>

      <ChevronRight size={16} style={{ color: C.text3 }} className="shrink-0" />
    </button>
  );
}

// ─── Info card ────────────────────────────────────────────────────────────────
function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-4 mt-3 rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
      <div className="px-4 py-2.5" style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.text2 }}>{title}</p>
      </div>
      <div className="px-4 py-3 space-y-2.5" style={{ background: C.white }}>{children}</div>
    </div>
  );
}

// ─── Detail row ───────────────────────────────────────────────────────────────
function DetailRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={15} className="shrink-0 mt-0.5" style={{ color: C.green }} />
      <div>
        <p className="text-[11px]" style={{ color: C.text3 }}>{label}</p>
        <p className="text-[14px]" style={{ color: C.text }}>{value}</p>
      </div>
    </div>
  );
}

// ─── Lead Detail ──────────────────────────────────────────────────────────────
function LeadDetail({ lead: initialLead, onBack, onStateChange, api }: {
  lead: Lead; onBack: () => void; onStateChange: (l: Lead) => void;
  api: ReturnType<typeof businessApi>;
}) {
  const [lead, setLead] = useState(initialLead);
  const [updatingState, setUpdatingState] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  async function handleStateChange(state: LeadState) {
    setUpdatingState(true);
    try {
      const { lead: updated } = await api.updateLeadState(lead.id, state);
      setLead(updated); onStateChange(updated);
    } finally { setUpdatingState(false); }
  }

  const waPhone = lead.qualificationData.phone
    ?.replace(/\D/g, "").replace(/^00/, "").replace(/^0/, "244");
  const waUrl = waPhone
    ? `https://wa.me/${waPhone}${lead.whatsappMessage ? `?text=${encodeURIComponent(lead.whatsappMessage)}` : ""}`
    : null;

  const name = getLeadName(lead);
  const pal = avatarPalette(name);
  const initials = name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <AppHeader
        title={name}
        subtitle={formatDate(lead.createdAt)}
        onBack={onBack}
        leading={
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
          style={{ background: pal.bg, color: pal.text }}>
          {initials || <User size={14} />}
        </div>
        }
        actions={
          <StatusBadge tone={lead.state === "qualificado" ? "success" : lead.state === "perdido" ? "error" : "neutral"}>
            {STATE_LABELS[lead.state]}
          </StatusBadge>
        }
      />

      <div className="flex-1 overflow-y-auto" style={{ background: C.bg }}>
        {/* Score + WhatsApp */}
        {(lead.score !== null || waUrl) && (
          <div className="mx-4 mt-4 rounded-2xl p-4 flex items-center gap-4"
            style={{ background: C.white, border: `1px solid ${C.border}` }}>
            {lead.score !== null && (
              <div className="text-center">
                <p className="text-[11px]" style={{ color: C.text3 }}>Pontuação</p>
                <p className="text-[18px] font-bold" style={{ color: scoreColor(lead.score) }}>
                  {lead.score}/100
                </p>
              </div>
            )}
            {waUrl && (
              <a href={waUrl} target="_blank" rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 text-white font-semibold text-[14px] py-2.5 px-4 rounded-xl"
                style={{ background: C.green }}>
                <MessageCircle size={16} /> Enviar WhatsApp <ExternalLink size={12} />
              </a>
            )}
          </div>
        )}

        {/* Qualification data */}
        <InfoCard title="Dados do Lead">
          {lead.qualificationData.name && <DetailRow icon={User} label="Nome" value={lead.qualificationData.name} />}
          {lead.qualificationData.phone && <DetailRow icon={Phone} label="Telefone" value={lead.qualificationData.phone} />}
          {lead.qualificationData.interest && <DetailRow icon={Star} label="Interesse" value={lead.qualificationData.interest} />}
          {lead.qualificationData.budget && <DetailRow icon={DollarSign} label="Orçamento" value={lead.qualificationData.budget} />}
          {lead.qualificationData.timeline && <DetailRow icon={Clock} label="Prazo" value={lead.qualificationData.timeline} />}
          {lead.qualificationData.location && <DetailRow icon={MapPin} label="Localização" value={lead.qualificationData.location} />}
          {lead.qualificationData.extras &&
            Object.entries(lead.qualificationData.extras).map(([k, v]) => (
              <DetailRow key={k} icon={FileText} label={k} value={v} />
            ))}
          {!lead.qualificationData.name && !lead.qualificationData.phone && !lead.qualificationData.interest && (
            <p className="text-[13px] italic" style={{ color: C.text3 }}>Sem dados extraídos ainda</p>
          )}
        </InfoCard>

        {/* AI Summary */}
        {lead.aiSummary && (
          <InfoCard title="Resumo da IA">
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: C.text2 }}>
              {lead.aiSummary}
            </p>
          </InfoCard>
        )}

        {/* Origin */}
        {(lead.origin.source || lead.origin.campaign) && (
          <InfoCard title="Origem">
            <div className="flex flex-wrap gap-2">
              {lead.origin.source && <span className="text-[12px] px-3 py-1 rounded-full"
                style={{ background: C.bg, color: C.text2 }}>source: {lead.origin.source}</span>}
              {lead.origin.medium && <span className="text-[12px] px-3 py-1 rounded-full"
                style={{ background: C.bg, color: C.text2 }}>medium: {lead.origin.medium}</span>}
              {lead.origin.campaign && <span className="text-[12px] px-3 py-1 rounded-full"
                style={{ background: C.bg, color: C.text2 }}>campaign: {lead.origin.campaign}</span>}
            </div>
          </InfoCard>
        )}

        {/* Transcript */}
        {lead.callTranscript && (
          <div className="mx-4 mt-3">
            <button onClick={() => setShowTranscript((v) => !v)}
              className="text-[13px] flex items-center gap-1.5 font-medium" style={{ color: C.green }}>
              <FileText size={13} />
              {showTranscript ? "Ocultar transcrição" : "Ver transcrição completa"}
            </button>
            {showTranscript && (
              <div className="mt-2 rounded-2xl p-4" style={{ background: C.white, border: `1px solid ${C.border}` }}>
                <pre className="text-[12px] whitespace-pre-wrap font-mono leading-relaxed" style={{ color: C.text2 }}>
                  {lead.callTranscript}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Chat messages */}
        {lead.chatMessages.length > 0 && (
          <InfoCard title="Mensagens do Chat">
            <div className="space-y-2">
              {lead.chatMessages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <span className="text-[13px] px-3 py-2 rounded-xl max-w-[80%]"
                    style={{
                      background: m.role === "user" ? "#EEECFF" : C.bg,
                      color: C.text,
                      boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                    }}>
                    {m.text}
                  </span>
                </div>
              ))}
            </div>
          </InfoCard>
        )}

        {/* State change */}
        <InfoCard title="Alterar Estado">
          <div className="flex flex-wrap gap-2">
            {STATE_ORDER.map((s) => (
              <button
                key={s}
                disabled={s === lead.state || updatingState}
                onClick={() => handleStateChange(s)}
                className="text-[12px] px-3 py-1.5 rounded-full font-medium transition-all disabled:opacity-40"
                style={{
                  background: s === lead.state ? STATE_PILL_BG[s] : C.bg,
                  color: s === lead.state ? STATE_PILL_COLOR[s] : C.text2,
                  border: `1px solid ${s === lead.state ? STATE_DOT[s] + "50" : C.border}`,
                }}
              >
                {STATE_LABELS[s]}
              </button>
            ))}
          </div>
        </InfoCard>

        <div className="h-4" />
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function Leads() {
  const slug = useBusinessSlug();
  const api = useMemo(() => (slug ? businessApi(slug) : null), [slug]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [search, setSearch] = useState("");
  const [filterState, setFilterState] = useState<LeadState | "todos">("todos");
  const [newLeadIds, setNewLeadIds] = useState<Set<string>>(new Set());
  const [notification, setNotification] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const loadLeads = useCallback(async () => {
    if (!api) return;
    try { const { leads: data } = await api.listLeads(); setLeads(data); }
    finally { setLoading(false); }
  }, [api]);

  useEffect(() => { void loadLeads(); }, [loadLeads]);

  useEffect(() => {
    if (!api) return;
    const es = new EventSource(api.getLeadsEventsUrl());
    eventSourceRef.current = es;
    es.addEventListener("lead_qualified", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { leadId: string };
      setNewLeadIds((prev) => new Set([...prev, data.leadId]));
      setNotification("Novo lead qualificado!");
      void loadLeads();
      setTimeout(() => setNotification(null), 5000);
    });
    return () => es.close();
  }, [api, loadLeads]);

  const filtered = leads.filter((l) => {
    if (filterState !== "todos" && l.state !== filterState) return false;
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
    <div className="flex items-center justify-center h-full text-sm" style={{ background: C.bg, color: C.text2 }}>
      Negócio não encontrado
    </div>
  );

  if (selectedLead) {
    return (
      <div className="flex flex-col h-full" style={{ background: C.bg }}>
        <LeadDetail
          lead={selectedLead} api={api}
          onBack={() => setSelectedLead(null)}
          onStateChange={(updated) => {
            setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
            setSelectedLead(updated);
          }}
        />
        <OwnerNav />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: C.bg }}>
      {/* Header */}
      <div className="shrink-0" style={{ background: "#FFFFFF", borderBottom: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between" style={{ padding: "16px 16px 12px" }}>
          <h1 style={{ color: C.text, fontSize: 22, fontWeight: 700, letterSpacing: "-0.3px" }}>Leads</h1>
          <button
            onClick={() => void loadLeads()}
            className="flex items-center justify-center rounded-full transition-opacity active:opacity-60"
            style={{ width: 36, height: 36, color: "#9CA3AF" }}
            aria-label="Actualizar"
          >
            <RefreshCw size={18} strokeWidth={1.75} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: "0 16px 10px" }}>
          <div
            className="flex items-center gap-2"
            style={{
              background: C.inputBg,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              height: 44,
              paddingLeft: 12,
              paddingRight: 12,
            }}
          >
            <Search size={16} style={{ color: C.text3 }} strokeWidth={1.75} className="shrink-0" />
            <input
              type="text"
              placeholder="Pesquisar leads..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent outline-none"
              style={{ color: C.text, fontSize: 15 }}
            />
          </div>
        </div>

        {/* Filter chips */}
        <div
          className="flex gap-1.5 overflow-x-auto"
          style={{ padding: "2px 16px 10px", scrollbarWidth: "none" }}
        >
          {([["todos", "Todos"] as const, ...STATE_ORDER.map((s) => [s, STATE_LABELS[s]] as const)]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilterState(key as LeadState | "todos")}
              className="shrink-0 transition-all"
              style={{
                fontSize: 12.5,
                fontWeight: filterState === key ? 600 : 400,
                padding: "5px 12px",
                borderRadius: 8,
                background: filterState === key ? C.green : C.inputBg,
                color: filterState === key ? "#FFFFFF" : C.text2,
                border: `1px solid ${filterState === key ? C.green : C.border}`,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Notification banner */}
      {notification && (
        <div
          className="shrink-0 flex items-center gap-2 text-[13px]"
          style={{ background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0", borderRadius: 10, margin: "12px 16px 0", padding: "10px 14px" }}
        >
          {notification}
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="py-2">
            {[1,2,3].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse"
                style={{ background: "#FFFFFF", borderBottom: "1px solid #F3F4F6" }}>
                <div className="w-12 h-12 rounded-full shrink-0" style={{ background: "#F3F4F6" }} />
                <div className="flex-1">
                  <div className="h-4 rounded mb-2" style={{ background: "#F3F4F6", width: "45%" }} />
                  <div className="h-3 rounded" style={{ background: "#F3F4F6", width: "65%" }} />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: C.bg }}>
              <User size={28} style={{ color: C.text3 }} />
            </div>
            <p className="text-[15px] font-medium" style={{ color: C.text2 }}>
              {search || filterState !== "todos" ? "Nenhum resultado" : "Nenhum lead ainda"}
            </p>
          </div>
        ) : (
          <div style={{ background: C.white }}>
            {filtered.map((lead) => (
              <LeadRow
                key={lead.id} lead={lead}
                isNew={newLeadIds.has(lead.id)}
                onClick={() => {
                  setNewLeadIds((prev) => { const s = new Set(prev); s.delete(lead.id); return s; });
                  setSelectedLead(lead);
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
