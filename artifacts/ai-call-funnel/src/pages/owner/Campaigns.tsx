/**
 * Estrategista de Campanhas — lista + criação.
 */
import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft,
  Plus,
  Megaphone,
  Globe,
  Instagram,
  Facebook,
  Loader2,
  AlertCircle,
  ChevronRight,
  BadgeCheck,
  TrendingUp,
  BarChart2,
  ExternalLink,
} from "lucide-react";
import {
  listCampaigns,
  createCampaign,
  getLeadsAnalytics,
  type Campaign,
  type CampaignPlatform,
  type LeadsAnalytics,
} from "../../lib/api";
import { OwnerNav } from "../../components/owner/OwnerNav";

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_META: Record<
  CampaignPlatform,
  { label: string; icon: React.ReactNode; color: string; bg: string }
> = {
  google:    { label: "Google Ads",    icon: <Globe size={15} />,     color: "#4285F4", bg: "#4285F418" },
  instagram: { label: "Instagram",     icon: <Instagram size={15} />, color: "#E1306C", bg: "#E1306C18" },
  facebook:  { label: "Facebook",      icon: <Facebook size={15} />,  color: "#1877F2", bg: "#1877F218" },
  tiktok:    { label: "TikTok",        icon: <span className="text-[13px] font-bold">T</span>, color: "#69C9D0", bg: "#69C9D018" },
};

const STATUS_META: Record<Campaign["status"], { label: string; color: string }> = {
  rascunho: { label: "Rascunho",  color: "#7B96B2" },
  ativa:    { label: "Ativa",     color: "#00C896" },
  pausada:  { label: "Pausada",   color: "#F59E0B" },
  encerrada:{ label: "Encerrada", color: "#EF4444" },
};

// ─── Create modal ─────────────────────────────────────────────────────────────

const PLATFORMS: CampaignPlatform[] = ["google", "instagram", "facebook", "tiktok"];

function CreateModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (c: Campaign) => void;
}) {
  const [name,      setName]      = useState("");
  const [platform,  setPlatform]  = useState<CampaignPlatform>("instagram");
  const [objective, setObjective] = useState("");
  const [budget,    setBudget]    = useState("");
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim() || !objective.trim()) { setErr("Preenche o nome e o objetivo."); return; }
    setSaving(true);
    setErr(null);
    try {
      const { campaign } = await createCampaign({
        name: name.trim(),
        platform,
        objective: objective.trim(),
        budget: parseInt(budget, 10) || 0,
      });
      onCreate(campaign);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao criar campanha");
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-[402px] rounded-t-2xl p-5 pb-8 space-y-4"
        style={{ background: "#111B27", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center justify-between">
          <p className="font-semibold text-[#EAF0F7]">Nova campanha</p>
          <button onClick={onClose} className="text-[#3E576F] hover:text-[#EAF0F7] text-xl leading-none">×</button>
        </div>

        {err && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-300">
            <AlertCircle size={12} /> {err}
          </div>
        )}

        {/* Platform */}
        <div className="space-y-1.5">
          <label className="text-xs text-[#7B96B2]">Plataforma</label>
          <div className="grid grid-cols-2 gap-2">
            {PLATFORMS.map((p) => {
              const m = PLATFORM_META[p];
              return (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-all"
                  style={{
                    background: platform === p ? m.bg : "#0F192A",
                    border: `1px solid ${platform === p ? m.color + "40" : "rgba(255,255,255,0.08)"}`,
                    color: platform === p ? m.color : "#7B96B2",
                  }}
                >
                  <span style={{ color: m.color }}>{m.icon}</span>
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Name */}
        <div className="space-y-1.5">
          <label className="text-xs text-[#7B96B2]">Nome da campanha</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Promo Julho – Instagram"
            className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
            style={{ background: "#0F192A", border: "1px solid rgba(255,255,255,0.08)", color: "#EAF0F7", caretColor: "#00C896" }}
          />
        </div>

        {/* Objective */}
        <div className="space-y-1.5">
          <label className="text-xs text-[#7B96B2]">Objetivo (descreve o que queres alcançar)</label>
          <textarea
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            rows={2}
            placeholder="Ex: Captar leads qualificados para serviço de instalação de ar condicionado em Luanda"
            className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none resize-none"
            style={{ background: "#0F192A", border: "1px solid rgba(255,255,255,0.08)", color: "#EAF0F7", caretColor: "#00C896" }}
          />
        </div>

        {/* Budget */}
        <div className="space-y-1.5">
          <label className="text-xs text-[#7B96B2]">Orçamento total (AOA) — opcional</label>
          <input
            value={budget}
            onChange={(e) => setBudget(e.target.value.replace(/\D/g, ""))}
            placeholder="Ex: 50000"
            className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
            style={{ background: "#0F192A", border: "1px solid rgba(255,255,255,0.08)", color: "#EAF0F7", caretColor: "#00C896" }}
          />
        </div>

        <button
          onClick={handleCreate}
          disabled={saving}
          className="w-full rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-all"
          style={{
            background: "linear-gradient(135deg, #00C896 0%, #007A5C 100%)",
            color: "#fff",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          {saving ? "A criar…" : "Criar campanha"}
        </button>
      </div>
    </div>
  );
}

// ─── Analytics view ───────────────────────────────────────────────────────────

function AnalyticsView() {
  const [data,    setData]    = useState<LeadsAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    getLeadsAnalytics()
      .then(({ analytics }) => setData(analytics))
      .catch(() => setError("Não foi possível carregar os dados"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 size={20} className="animate-spin text-[#3E576F]" />
    </div>
  );

  if (error) return (
    <div className="mx-4 mt-4 flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
      <AlertCircle size={13} className="text-red-400" /> <span className="text-xs text-red-300">{error}</span>
    </div>
  );

  if (!data || data.total === 0) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 px-6 text-center">
      <BarChart2 size={32} className="text-[#3E576F]" />
      <p className="text-sm text-[#EAF0F7] font-medium">Sem dados ainda</p>
      <p className="text-xs text-[#3E576F]">Os dados de atribuição aparecem assim que os primeiros leads chegarem pelos links rastreados.</p>
    </div>
  );

  const maxTotal = Math.max(...data.bySource.map((r) => r.total), 1);

  return (
    <div className="p-4 space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Total leads",    value: data.total,           color: "#7B96B2" },
          { label: "Qualificados",   value: data.totalQualified,  color: "#00C896" },
          { label: "Conversão",      value: `${data.overallRate}%`, color: "#F59E0B" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl p-3 text-center"
            style={{ background: "#111B27", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[10px] text-[#3E576F] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* By source/campaign */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="px-4 py-2.5" style={{ background: "#111B27" }}>
          <p className="text-xs font-semibold text-[#7B96B2] uppercase tracking-wider">Leads por fonte</p>
        </div>
        <div className="divide-y divide-white/[0.04]" style={{ background: "#0A1420" }}>
          {data.bySource.map((row, i) => (
            <div key={i} className="px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#EAF0F7] truncate">{row.source}</p>
                  {row.campaign && (
                    <p className="text-[10px] text-[#3E576F] truncate">utm_campaign: {row.campaign}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-[#EAF0F7]">{row.total}</p>
                  <p className="text-[10px]" style={{ color: row.rate >= 50 ? "#00C896" : row.rate >= 25 ? "#F59E0B" : "#7B96B2" }}>
                    {row.rate}% conv.
                  </p>
                </div>
              </div>
              {/* Bar */}
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.round((row.total / maxTotal) * 100)}%`,
                    background: row.rate >= 50 ? "#00C896" : row.rate >= 25 ? "#F59E0B" : "#4A6580",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tip */}
      <p className="text-[11px] text-center text-[#3E576F] px-4">
        Use os links rastreados de cada campanha para ver qual fonte converte melhor.
      </p>
    </div>
  );
}

// ─── Campaign card ────────────────────────────────────────────────────────────

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const pm = PLATFORM_META[campaign.platform];
  const sm = STATUS_META[campaign.status];

  return (
    <Link href={`/dono/campanhas/${campaign.id}`}>
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-white/[0.02] transition-colors border-b"
        style={{ borderColor: "rgba(255,255,255,0.04)" }}
      >
        {/* Platform icon */}
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: pm.bg, color: pm.color }}>
          {pm.icon}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm text-[#EAF0F7] truncate">{campaign.name}</p>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
              style={{ background: sm.color + "18", color: sm.color }}>
              {sm.label}
            </span>
          </div>
          <p className="text-xs text-[#3E576F] mt-0.5 flex items-center gap-1.5">
            <span style={{ color: pm.color }}>{pm.label}</span>
            {campaign.budget > 0 && (
              <span>· {campaign.budget.toLocaleString("pt-AO")} AOA</span>
            )}
            {campaign.kitJson && (
              <span className="text-[#00C896]">· Kit pronto</span>
            )}
          </p>
        </div>
        <ChevronRight size={16} className="text-[#3E576F] flex-shrink-0" />
      </div>
    </Link>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [tab,       setTab]       = useState<"campanhas" | "analise">("campanhas");
  const [, navigate]              = useLocation();

  useEffect(() => {
    listCampaigns()
      .then(({ campaigns: data }) => setCampaigns(data))
      .catch(() => setError("Não foi possível carregar as campanhas"))
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = useCallback((campaign: Campaign) => {
    setShowModal(false);
    navigate(`/dono/campanhas/${campaign.id}`);
  }, [navigate]);

  return (
    <div className="flex flex-col h-full bg-[#080E18]">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0"
        style={{ background: "#111B27" }}
      >
        <Link href="/dono" className="text-[#3E576F] hover:text-[#EAF0F7]">
          <ArrowLeft size={20} />
        </Link>
        <div className="w-9 h-9 rounded-full bg-orange-500/15 flex items-center justify-center flex-shrink-0">
          <Megaphone size={18} className="text-orange-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[#EAF0F7] text-sm">Campanhas</p>
          <p className="text-xs text-[#3E576F]">Estratégia gerada por IA · rastreio UTM</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
          style={{ background: "linear-gradient(135deg, #00C896 0%, #007A5C 100%)" }}
        >
          <Plus size={17} className="text-white" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/[0.06] flex-shrink-0" style={{ background: "#0A1420" }}>
        {([
          { key: "campanhas", label: "📢 Campanhas" },
          { key: "analise",   label: "📊 Análise" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex-1 py-2.5 text-xs font-medium transition-colors"
            style={{
              color: tab === t.key ? "#00C896" : "#3E576F",
              borderBottom: tab === t.key ? "2px solid #00C896" : "2px solid transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Analytics */}
      {tab === "analise" && (
        <div className="flex-1 overflow-y-auto">
          <AnalyticsView />
        </div>
      )}

      {/* Tab: Campaigns list */}
      {tab === "campanhas" && (
        <>
          {/* Error */}
          {error && (
            <div className="mx-4 mt-3 flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <AlertCircle size={13} className="text-red-400" />
              <span className="text-xs text-red-300">{error}</span>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center flex-1">
              <Loader2 size={20} className="text-[#3E576F] animate-spin" />
            </div>
          )}

          {/* Empty state */}
          {!loading && campaigns.length === 0 && (
            <div className="flex flex-col items-center justify-center flex-1 px-6 gap-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-orange-500/10 flex items-center justify-center">
                <Megaphone size={26} className="text-orange-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#EAF0F7]">Nenhuma campanha ainda</p>
                <p className="text-xs text-[#3E576F] mt-1 max-w-[260px] mx-auto">
                  Cria a tua primeira campanha e a IA gera o kit completo — copies, públicos e briefs criativos.
                </p>
              </div>
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 text-sm font-medium rounded-xl px-4 py-2.5 transition-all active:scale-95"
                style={{ background: "linear-gradient(135deg, #00C896 0%, #007A5C 100%)", color: "#fff" }}
              >
                <Plus size={15} />
                Criar primeira campanha
              </button>
            </div>
          )}

          {/* List */}
          {!loading && campaigns.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-2 px-4 py-3 border-b border-white/[0.04]">
                {[
                  { label: "Total",   value: campaigns.length,                                    color: "#7B96B2" },
                  { label: "Ativas",  value: campaigns.filter((c) => c.status === "ativa").length, color: "#00C896" },
                  { label: "Com kit", value: campaigns.filter((c) => c.kitJson).length,           color: "#F59E0B" },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <p className="text-[18px] font-bold" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-[10px] text-[#3E576F]">{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto">
                {campaigns.map((c) => <CampaignCard key={c.id} campaign={c} />)}
              </div>
            </>
          )}
        </>
      )}

      {showModal && (
        <CreateModal onClose={() => setShowModal(false)} onCreate={handleCreate} />
      )}
      <OwnerNav />
    </div>
  );
}
