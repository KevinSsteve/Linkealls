/**
 * Campanhas — design premium, fundo quente #F6F6F4, tipografia editorial.
 * Toda a lógica é idêntica à versão anterior.
 */
import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import {
  Plus, Megaphone, Globe, Instagram, Facebook,
  Layers2, Loader2, AlertCircle, ChevronRight, BarChart2,
  MoreVertical, CopyPlus, Trash2, X,
} from "lucide-react";
import {
  businessApi, type Campaign, type CampaignPlatform, type LeadsAnalytics,
} from "../../lib/api";
import { useBusinessSlug } from "../../hooks/useBusinessSlug";
import { OwnerNav } from "../../components/owner/OwnerNav";
import { WaSkeletonList, WaSkeletonCard } from "../../components/wa/WaSkeletonList";
import { WaEmptyState } from "../../components/wa/WaEmptyState";
import { AppHeader, AppIconButton } from "../../components/app/AppHeader";

// ─── Design tokens locais ────────────────────────────────────────────────────
const D = {
  bg:       "#F6F9FC",
  surface:  "#FFFFFF",
  ink:      "#0A2540",
  inkSoft:  "#425466",
  inkFaint: "#8898AA",
  line:     "#E6EBF1",
  lineSoft: "#F1F4F8",
  subtle:   "#F1F5F9",
  green:    "#635BFF",
  greenDk:  "#5046E5",
  greenLt:  "#EEECFF",
  rCard:    "20px",
  rBtn:     "999px",
  rInput:   "12px",
} as const;

// ─── Platform / status meta ───────────────────────────────────────────────────
const PLATFORM_META: Record<CampaignPlatform, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  google:    { label: "Google Ads",  icon: <Globe size={16} />,     color: "#4285F4", bg: "#E8F0FE" },
  instagram: { label: "Instagram",   icon: <Instagram size={16} />, color: "#E1306C", bg: "#FCE4EC" },
  facebook:  { label: "Facebook",    icon: <Facebook size={16} />,  color: "#1877F2", bg: "#E3F2FD" },
  tiktok:    { label: "TikTok",      icon: <span className="text-[14px] font-bold">T</span>, color: "#010101", bg: "#F5F5F5" },
  meta:      { label: "Meta Ads",    icon: <Layers2 size={16} />,    color: "#0866FF", bg: "#E7F0FF" },
};
const STATUS_META: Record<Campaign["status"], { label: string; bg: string; color: string }> = {
  rascunho:  { label: "Rascunho",  bg: D.subtle,    color: D.inkSoft },
  ativa:     { label: "Ativa",     bg: "#E8F5E9",   color: "#1B5E20" },
  pausada:   { label: "Pausada",   bg: "#FFF8E1",   color: "#E65100" },
  encerrada: { label: "Encerrada", bg: "#FFEBEE",   color: "#C62828" },
};

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
      <BarChart2 size={32} style={{ color: D.inkFaint }} />
      <p className="text-[14px] font-medium" style={{ color: D.ink }}>Sem dados ainda</p>
      <p className="text-[12px] leading-relaxed" style={{ color: D.inkSoft }}>
        Os dados de atribuição aparecem quando os primeiros leads chegarem pelos links rastreados.
      </p>
    </div>
  );

  const maxTotal = Math.max(...data.bySource.map((r) => r.total), 1);

  return (
    <div className="p-4 space-y-3">
      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Total leads",  value: data.total,             color: D.inkSoft },
          { label: "Qualificados", value: data.totalQualified,    color: D.green },
          { label: "Conversão",    value: `${data.overallRate}%`, color: "#E65100" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl p-3 text-center"
            style={{ background: D.surface, border: `1px solid ${D.line}` }}
          >
            <p className="text-[20px] font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[10px] mt-0.5" style={{ color: D.inkFaint }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Leads por fonte */}
      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${D.line}` }}>
        <div className="px-4 py-2.5" style={{ background: D.subtle, borderBottom: `1px solid ${D.line}` }}>
          <p className="font-semibold uppercase tracking-wider" style={{ color: D.inkSoft, fontSize: 10.5, letterSpacing: "0.12em" }}>
            Leads por fonte
          </p>
        </div>
        <div style={{ background: D.surface }}>
          {data.bySource.map((row, i) => (
            <div
              key={i}
              className="px-4 py-3 space-y-1.5"
              style={{ borderBottom: i < data.bySource.length - 1 ? `1px solid ${D.lineSoft}` : undefined }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold truncate" style={{ color: D.ink }}>{row.source}</p>
                  {row.campaign && <p className="text-[11px]" style={{ color: D.inkFaint }}>utm: {row.campaign}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[14px] font-bold" style={{ color: D.ink }}>{row.total}</p>
                  <p className="text-[11px]" style={{ color: row.rate >= 50 ? "#2E7D32" : row.rate >= 25 ? "#E65100" : D.inkFaint }}>
                    {row.rate}% conv.
                  </p>
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: D.subtle }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.round((row.total / maxTotal) * 100)}%`,
                    background: row.rate >= 50 ? D.green : row.rate >= 25 ? "#FFA726" : D.inkFaint,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Campaign card ────────────────────────────────────────────────────────────
function CampaignCard({ campaign, slug, onMenu }: {
  campaign: Campaign;
  slug: string;
  onMenu: (campaign: Campaign) => void;
}) {
  const pm = PLATFORM_META[campaign.platform];
  const sm = STATUS_META[campaign.status];

  return (
    <div className="relative" style={{ background: D.surface, borderBottom: `1px solid ${D.lineSoft}` }}>
      <Link href={`/e/${slug}/dono/campanhas/${campaign.id}`}>
        <div
          className="flex items-center gap-3 px-4 py-4 pr-14 cursor-pointer active:bg-[#F0F0EC] transition-colors"
        >
        {/* Ícone da plataforma */}
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: pm.bg, color: pm.color }}
        >
          {pm.icon}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p
              className="font-semibold truncate"
              style={{ color: D.ink, fontSize: 14.5 }}
            >
              {campaign.name}
            </p>
            <span
              className="font-medium rounded-full shrink-0"
              style={{
                background: sm.bg,
                color: sm.color,
                fontSize: 11,
                paddingLeft: 8,
                paddingRight: 8,
                paddingTop: 2,
                paddingBottom: 2,
              }}
            >
              {sm.label}
            </span>
          </div>
          <p className="mt-1 flex items-center gap-1.5 flex-wrap" style={{ color: D.inkSoft, fontSize: 12 }}>
            <span style={{ color: pm.color }}>{pm.label}</span>
            {campaign.budget > 0 && <span>· {campaign.budget.toLocaleString("pt-AO")} AOA</span>}
           {campaign.creativeStatus === "pronto" && <span style={{ color: D.green }}>· Criativo pronto</span>}
          </p>
        </div>

        <ChevronRight size={15} style={{ color: D.inkFaint }} className="shrink-0" />
        </div>
      </Link>
      <button type="button" aria-label={`Opções de ${campaign.name}`} onClick={() => onMenu(campaign)}
        style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 34, height: 34, border: 0, borderRadius: "50%", background: "transparent", color: D.inkSoft, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <MoreVertical size={19} />
      </button>
    </div>
  );
}

function CampaignActionsSheet({
  campaign, onClose, onOpen, onDuplicate, onDelete, busy,
}: {
  campaign: Campaign;
  onClose: () => void;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  busy: "duplicate" | "delete" | null;
}) {
  const canDelete =
    campaign.status === "rascunho" &&
    campaign.paymentStatus === "nao_pago" &&
    campaign.publishStatus === "nao_publicada";
  return (
    <div role="dialog" aria-modal="true" aria-label="Opções da campanha" onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 30, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "flex-end" }}>
      <div onClick={(event) => event.stopPropagation()}
        style={{ width: "100%", background: "#FFF", borderRadius: "22px 22px 0 0", padding: "10px 20px 28px", boxSizing: "border-box" }}>
        <div style={{ width: 38, height: 4, borderRadius: 4, background: "#D1D5DB", margin: "0 auto 16px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 17, fontWeight: 700, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{campaign.name}</p>
            <p style={{ fontSize: 13, color: "#6B7280", marginTop: 3 }}>Opções da campanha</p>
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose} style={{ border: 0, background: "#F3F4F6", borderRadius: "50%", width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>
        <button type="button" onClick={onOpen}
          style={{ width: "100%", minHeight: 50, display: "flex", alignItems: "center", gap: 12, border: 0, borderBottom: "1px solid #F0F0F0", background: "#FFF", color: "#111", fontSize: 15, fontWeight: 600, textAlign: "left" }}>
          <ChevronRight size={19} style={{ color: "#6B7280" }} /> Abrir campanha
        </button>
        <button type="button" onClick={onDuplicate} disabled={busy !== null}
          style={{ width: "100%", minHeight: 50, display: "flex", alignItems: "center", gap: 12, border: 0, borderBottom: "1px solid #F0F0F0", background: "#FFF", color: "#111", fontSize: 15, fontWeight: 600, textAlign: "left", opacity: busy === "duplicate" ? 0.6 : 1 }}>
          {busy === "duplicate" ? <Loader2 size={19} className="animate-spin" style={{ color: "#6B7280" }} /> : <CopyPlus size={19} style={{ color: "#6B7280" }} />} Duplicar campanha
        </button>
        {canDelete ? (
          <button type="button" onClick={onDelete} disabled={busy !== null}
            style={{ width: "100%", minHeight: 50, display: "flex", alignItems: "center", gap: 12, border: 0, background: "#FFF", color: "#C62828", fontSize: 15, fontWeight: 600, textAlign: "left", opacity: busy === "delete" ? 0.6 : 1 }}>
            {busy === "delete" ? <Loader2 size={19} className="animate-spin" /> : <Trash2 size={19} />} Eliminar rascunho
          </button>
        ) : (
          <p style={{ color: "#9CA3AF", fontSize: 12, lineHeight: 1.5, padding: "12px 0 0 31px" }}>
            Campanhas pagas ou publicadas não podem ser eliminadas. Usa o controlo do anúncio para as encerrar.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function LegacyCampaigns() {
  const slug = useBusinessSlug();
  const api = useMemo(() => (slug ? businessApi(slug) : null), [slug]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<"campanhas" | "analise">("campanhas");
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [actionBusy, setActionBusy] = useState<"duplicate" | "delete" | null>(null);
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!api) return;
    api.listCampaigns()
      .then(({ campaigns: data }) => setCampaigns(data))
      .catch(() => setError("Não foi possível carregar as campanhas"))
      .finally(() => setLoading(false));
  }, [api]);

  const handleCreate = async () => {
    if (!api || creating) return;
    setCreating(true);
    setError(null);
    try {
      const { campaign } = await api.createCampaign({
        name: "Nova campanha Meta",
        platform: "meta",
        objective: "lead_generation",
        budget: 0,
        durationDays: 7,
      });
      navigate(`/e/${slug}/dono/campanhas/${campaign.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível iniciar o anúncio");
      setCreating(false);
    }
  };

  const handleDuplicate = async () => {
    if (!api || !selectedCampaign || actionBusy) return;
    setActionBusy("duplicate"); setError(null);
    try {
      const { campaign } = await api.duplicateCampaign(selectedCampaign.id);
      setCampaigns((items) => [campaign, ...items]);
      setSelectedCampaign(null);
      navigate(`/e/${slug}/dono/campanhas/${campaign.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível duplicar a campanha");
    } finally {
      setActionBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!api || !selectedCampaign || actionBusy) return;
    const confirmed = window.confirm(
      `Eliminar o rascunho "${selectedCampaign.name}"? Esta ação não pode ser desfeita.`,
    );
    if (!confirmed) return;
    setActionBusy("delete"); setError(null);
    try {
      await api.deleteCampaign(selectedCampaign.id);
      setCampaigns((items) => items.filter((item) => item.id !== selectedCampaign.id));
      setSelectedCampaign(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível eliminar a campanha");
    } finally {
      setActionBusy(null);
    }
  };

  if (!slug || !api) return null;

  return (
    <div className="flex flex-col h-full" style={{ background: D.bg }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className="shrink-0"
        style={{ background: D.surface, borderBottom: `1px solid ${D.line}` }}
      >
        <AppHeader
          title="Campanhas"
          actions={
            <AppIconButton label="Criar campanha" onClick={() => void handleCreate()} disabled={creating}>
              {creating ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} strokeWidth={1.9} />}
            </AppIconButton>
          }
        />

        {/* Tabs */}
        <div className="flex" style={{ borderTop: `1px solid ${D.lineSoft}` }}>
          {([["campanhas", "Campanhas"], ["analise", "Análise"]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="flex-1 py-2.5 font-semibold transition-colors"
              style={{
                fontSize: 13,
                color: tab === key ? D.green : D.inkFaint,
                borderBottom: tab === key ? `2px solid ${D.green}` : "2px solid transparent",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab: Análise ───────────────────────────────────────────────────── */}
      {tab === "analise" && (
        <div className="flex-1 overflow-y-auto">
          <AnalyticsView api={api} />
        </div>
      )}

      {/* ── Tab: Campanhas ─────────────────────────────────────────────────── */}
      {tab === "campanhas" && (
        <>
          {error && (
            <div
              className="mx-4 mt-3 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px]"
              style={{ background: "#FFEBEE", color: "#C62828", border: "1px solid #FFCDD2" }}
            >
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
                <button
                  onClick={() => void handleCreate()}
                  disabled={creating}
                  className="flex items-center gap-2 font-semibold rounded-full px-5 py-2.5"
                  style={{ background: D.green, color: "#fff", fontSize: 14, opacity: creating ? 0.65 : 1 }}
                >
                  {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Criar campanha
                </button>
              }
            />
          )}

          {!loading && campaigns.length > 0 && (
            <>
              {/* Stats em cards */}
              <div
                className="grid grid-cols-3 gap-3 mx-4 mt-4 mb-3"
              >
                {[
                  { label: "Total",   value: campaigns.length,                                    color: D.inkSoft },
                  { label: "Ativas",  value: campaigns.filter((c) => c.status === "ativa").length, color: D.green },
                  { label: "Com kit", value: campaigns.filter((c) => c.kitJson).length,           color: "#E65100" },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-2xl text-center py-3"
                    style={{ background: D.surface, border: `1px solid ${D.line}` }}
                  >
                    <p className="font-bold" style={{ color: s.color, fontSize: 22 }}>{s.value}</p>
                    <p style={{ color: D.inkFaint, fontSize: 11 }}>{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Lista */}
              <div
                className="flex-1 overflow-y-auto mx-4 mb-2 overflow-hidden"
                style={{
                  background: D.surface,
                  border: `1px solid ${D.line}`,
                  borderRadius: D.rCard,
                }}
              >
                 {campaigns.map((c) => <CampaignCard key={c.id} campaign={c} slug={slug} onMenu={setSelectedCampaign} />)}
              </div>
            </>
          )}
        </>
      )}

      <OwnerNav />
      {selectedCampaign && (
        <CampaignActionsSheet
          campaign={selectedCampaign}
          busy={actionBusy}
          onClose={() => { if (!actionBusy) setSelectedCampaign(null); }}
          onOpen={() => { setSelectedCampaign(null); navigate(`/e/${slug}/dono/campanhas/${selectedCampaign.id}`); }}
          onDuplicate={() => void handleDuplicate()}
          onDelete={() => void handleDelete()}
        />
      )}
    </div>
  );
}
