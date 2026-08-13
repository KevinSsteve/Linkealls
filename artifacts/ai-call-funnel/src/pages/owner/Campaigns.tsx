/**
 * Campanhas — tema claro estilo WhatsApp Business.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useLocation } from "wouter";
import {
  Plus, Megaphone, Globe, Instagram, Facebook,
  Loader2, AlertCircle, ChevronRight, BarChart2,
} from "lucide-react";
import {
  businessApi, type Campaign, type CampaignPlatform, type LeadsAnalytics,
} from "../../lib/api";
import { useBusinessSlug } from "../../hooks/useBusinessSlug";
import { OwnerNav } from "../../components/owner/OwnerNav";
import { C } from "../../theme";
import { WaSkeletonList, WaSkeletonCard } from "../../components/wa/WaSkeletonList";
import { WaEmptyState } from "../../components/wa/WaEmptyState";

// ─── Platform / status meta ───────────────────────────────────────────────────
const PLATFORM_META: Record<CampaignPlatform, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  google:    { label: "Google Ads",  icon: <Globe size={16} />,     color: "#4285F4", bg: "#E8F0FE" },
  instagram: { label: "Instagram",   icon: <Instagram size={16} />, color: "#E1306C", bg: "#FCE4EC" },
  facebook:  { label: "Facebook",    icon: <Facebook size={16} />,  color: "#1877F2", bg: "#E3F2FD" },
  tiktok:    { label: "TikTok",      icon: <span className="text-[14px] font-bold">T</span>, color: "#010101", bg: "#F5F5F5" },
};
const STATUS_META: Record<Campaign["status"], { label: string; bg: string; color: string }> = {
  rascunho:  { label: "Rascunho",  bg: "#F0F2F5", color: "#667781" },
  ativa:     { label: "Ativa",     bg: "#E8F5E9", color: "#1B5E20" },
  pausada:   { label: "Pausada",   bg: "#FFF8E1", color: "#E65100" },
  encerrada: { label: "Encerrada", bg: "#FFEBEE", color: "#C62828" },
};

const PLATFORMS: CampaignPlatform[] = ["google", "instagram", "facebook", "tiktok"];

// ─── Create modal ─────────────────────────────────────────────────────────────
function CreateModal({ api, onClose, onCreate }: {
  api: ReturnType<typeof businessApi>;
  onClose: () => void;
  onCreate: (c: Campaign) => void;
}) {
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<CampaignPlatform>("instagram");
  const [objective, setObjective] = useState("");
  const [budget, setBudget] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim() || !objective.trim()) { setErr("Preenche o nome e o objetivo."); return; }
    setSaving(true); setErr(null);
    try {
      const { campaign } = await api.createCampaign({ name: name.trim(), platform, objective: objective.trim(), budget: parseInt(budget, 10) || 0 });
      onCreate(campaign);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao criar campanha");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-[480px] rounded-t-3xl p-5 pb-8 space-y-4"
        style={{ background: C.white }}>
        <div className="w-10 h-1 rounded-full mx-auto mb-2" style={{ background: C.border }} />
        <div className="flex items-center justify-between">
          <p className="font-bold text-[17px]" style={{ color: C.text }}>Nova campanha</p>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center text-lg"
            style={{ background: C.bg, color: C.text3 }}>×</button>
        </div>

        {err && (
          <div className="flex items-center gap-2 text-[13px] rounded-xl px-3.5 py-2.5"
            style={{ background: "#FFEBEE", color: "#C62828", border: "1px solid #FFCDD2" }}>
            <AlertCircle size={13} /> {err}
          </div>
        )}

        {/* Platform */}
        <div>
          <label className="text-[12px] font-semibold block mb-2" style={{ color: C.text2 }}>Plataforma</label>
          <div className="grid grid-cols-2 gap-2">
            {PLATFORMS.map((p) => {
              const m = PLATFORM_META[p];
              return (
                <button key={p} onClick={() => setPlatform(p)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all"
                  style={{
                    background: platform === p ? m.bg : C.bg,
                    border: `1.5px solid ${platform === p ? m.color + "60" : C.border}`,
                    color: platform === p ? m.color : C.text2,
                  }}>
                  <span style={{ color: m.color }}>{m.icon}</span> {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-[12px] font-semibold block mb-1.5" style={{ color: C.text2 }}>Nome</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Promo Julho – Instagram"
            className="w-full rounded-xl px-3.5 py-2.5 text-[14px] outline-none"
            style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }} />
        </div>

        <div>
          <label className="text-[12px] font-semibold block mb-1.5" style={{ color: C.text2 }}>Objetivo</label>
          <textarea value={objective} onChange={(e) => setObjective(e.target.value)} rows={2}
            placeholder="Ex: Captar leads qualificados para instalação em Luanda"
            className="w-full rounded-xl px-3.5 py-2.5 text-[14px] outline-none resize-none"
            style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }} />
        </div>

        <div>
          <label className="text-[12px] font-semibold block mb-1.5" style={{ color: C.text2 }}>Orçamento (AOA) — opcional</label>
          <input value={budget} onChange={(e) => setBudget(e.target.value.replace(/\D/g, ""))}
            placeholder="Ex: 50000"
            className="w-full rounded-xl px-3.5 py-2.5 text-[14px] outline-none"
            style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }} />
        </div>

        <button onClick={handleCreate} disabled={saving}
          className="w-full rounded-full py-3.5 text-[14px] font-bold flex items-center justify-center gap-2 transition-opacity"
          style={{ background: C.green, color: "#fff", opacity: saving ? 0.6 : 1 }}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          {saving ? "A criar…" : "Criar campanha"}
        </button>
      </div>
    </div>
  );
}

// ─── Analytics ────────────────────────────────────────────────────────────────
function AnalyticsView({ api }: { api: ReturnType<typeof businessApi> }) {
  const [data, setData] = useState<LeadsAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getLeadsAnalytics()
      .then(({ analytics }) => setData(analytics))
      .catch(() => setError("Não foi possível carregar os dados"))
      .finally(() => setLoading(false));
  }, [api]);

  if (loading) return (
    <div className="px-4 py-4 grid grid-cols-1 gap-3">
      <WaSkeletonCard /><WaSkeletonCard /><WaSkeletonCard />
    </div>
  );
  if (error) return (
    <div className="mx-4 mt-4 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px]"
      style={{ background: "#FFEBEE", color: "#C62828", border: "1px solid #FFCDD2" }}>
      <AlertCircle size={13} /> {error}
    </div>
  );
  if (!data || data.total === 0) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 px-6 text-center">
      <BarChart2 size={32} style={{ color: C.text3 }} />
      <p className="text-[14px] font-medium" style={{ color: C.text }}>Sem dados ainda</p>
      <p className="text-[12px] leading-relaxed" style={{ color: C.text2 }}>
        Os dados de atribuição aparecem quando os primeiros leads chegarem pelos links rastreados.
      </p>
    </div>
  );

  const maxTotal = Math.max(...data.bySource.map((r) => r.total), 1);

  return (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Total leads",  value: data.total,             color: C.text2 },
          { label: "Qualificados", value: data.totalQualified,    color: C.green },
          { label: "Conversão",    value: `${data.overallRate}%`, color: "#E65100" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl p-3 text-center"
            style={{ background: C.white, border: `1px solid ${C.border}` }}>
            <p className="text-[20px] font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[10px] mt-0.5" style={{ color: C.text3 }}>{s.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
        <div className="px-4 py-2.5" style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.text2 }}>Leads por fonte</p>
        </div>
        <div style={{ background: C.white }}>
          {data.bySource.map((row, i) => (
            <div key={i} className="px-4 py-3 space-y-1.5" style={{ borderBottom: i < data.bySource.length - 1 ? `1px solid ${C.border}` : undefined }}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold truncate" style={{ color: C.text }}>{row.source}</p>
                  {row.campaign && <p className="text-[11px]" style={{ color: C.text3 }}>utm: {row.campaign}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[14px] font-bold" style={{ color: C.text }}>{row.total}</p>
                  <p className="text-[11px]" style={{ color: row.rate >= 50 ? "#2E7D32" : row.rate >= 25 ? "#E65100" : C.text3 }}>
                    {row.rate}% conv.
                  </p>
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.bg }}>
                <div className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.round((row.total / maxTotal) * 100)}%`,
                    background: row.rate >= 50 ? C.green : row.rate >= 25 ? "#FFA726" : C.text3,
                  }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Campaign card ────────────────────────────────────────────────────────────
function CampaignCard({ campaign, slug }: { campaign: Campaign; slug: string }) {
  const pm = PLATFORM_META[campaign.platform];
  const sm = STATUS_META[campaign.status];

  return (
    <Link href={`/e/${slug}/dono/campanhas/${campaign.id}`}>
      <div className="flex items-center gap-3 px-4 py-3.5 cursor-pointer active:bg-gray-50 transition-colors"
        style={{ background: C.white, borderBottom: `1px solid ${C.border}` }}>
        <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
          style={{ background: pm.bg, color: pm.color }}>
          {pm.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-[15px] truncate" style={{ color: C.text }}>{campaign.name}</p>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0"
              style={{ background: sm.bg, color: sm.color }}>{sm.label}</span>
          </div>
          <p className="text-[12px] mt-0.5 flex items-center gap-1.5" style={{ color: C.text2 }}>
            <span style={{ color: pm.color }}>{pm.label}</span>
            {campaign.budget > 0 && <span>· {campaign.budget.toLocaleString("pt-AO")} AOA</span>}
            {campaign.kitJson && <span style={{ color: C.green }}>· Kit pronto</span>}
          </p>
        </div>
        <ChevronRight size={16} style={{ color: C.text3 }} className="shrink-0" />
      </div>
    </Link>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function Campaigns() {
  const slug = useBusinessSlug();
  const api = useMemo(() => (slug ? businessApi(slug) : null), [slug]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [tab, setTab] = useState<"campanhas" | "analise">("campanhas");
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!api) return;
    api.listCampaigns()
      .then(({ campaigns: data }) => setCampaigns(data))
      .catch(() => setError("Não foi possível carregar as campanhas"))
      .finally(() => setLoading(false));
  }, [api]);

  const handleCreate = useCallback((campaign: Campaign) => {
    setShowModal(false);
    navigate(`/e/${slug}/dono/campanhas/${campaign.id}`);
  }, [navigate, slug]);

  if (!slug || !api) return null;

  return (
    <div className="flex flex-col h-full wa-page" style={{ background: C.bg }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-6 pb-2 shrink-0"
        style={{ background: C.white }}>
        <h1 className="text-[26px] font-extrabold tracking-tight flex-1" style={{ color: "#0B141A" }}>Campanhas</h1>
        <button
          onClick={() => setShowModal(true)}
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-90"
          style={{ background: C.green }}>
          <Plus size={18} className="text-white" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0" style={{ background: C.white, borderBottom: `1px solid ${C.border}` }}>
        {([["campanhas", "📢 Campanhas"], ["analise", "📊 Análise"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex-1 py-2.5 text-[13px] font-semibold transition-colors"
            style={{
              color: tab === key ? C.green : C.text3,
              borderBottom: tab === key ? `2px solid ${C.green}` : "2px solid transparent",
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Analytics */}
      {tab === "analise" && (
        <div className="flex-1 overflow-y-auto"><AnalyticsView api={api} /></div>
      )}

      {/* Tab: Campaigns */}
      {tab === "campanhas" && (
        <>
          {error && (
            <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px]"
              style={{ background: "#FFEBEE", color: "#C62828", border: "1px solid #FFCDD2" }}>
              <AlertCircle size={13} /> {error}
            </div>
          )}

          {loading && <WaSkeletonList count={4} />}

          {!loading && campaigns.length === 0 && (
            <WaEmptyState
              icon={<Megaphone size={32} />}
              iconBg="#FFF3E0"
              iconColor="#E65100"
              title="Nenhuma campanha ainda"
              subtitle="Cria a tua primeira campanha e a IA gera o kit completo."
              action={
                <button onClick={() => setShowModal(true)}
                  className="flex items-center gap-2 text-[14px] font-semibold rounded-full px-5 py-2.5"
                  style={{ background: C.green, color: "#fff" }}>
                  <Plus size={15} /> Criar campanha
                </button>
              }
            />
          )}

          {!loading && campaigns.length > 0 && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 px-4 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
                {[
                  { label: "Total",   value: campaigns.length,                                    color: C.text2 },
                  { label: "Ativas",  value: campaigns.filter((c) => c.status === "ativa").length, color: C.green },
                  { label: "Com kit", value: campaigns.filter((c) => c.kitJson).length,           color: "#E65100" },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <p className="text-[20px] font-bold" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-[11px]" style={{ color: C.text3 }}>{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto" style={{ background: C.white }}>
                {campaigns.map((c) => <CampaignCard key={c.id} campaign={c} slug={slug} />)}
              </div>
            </>
          )}
        </>
      )}

      {showModal && <CreateModal api={api} onClose={() => setShowModal(false)} onCreate={handleCreate} />}
      <OwnerNav />
    </div>
  );
}
