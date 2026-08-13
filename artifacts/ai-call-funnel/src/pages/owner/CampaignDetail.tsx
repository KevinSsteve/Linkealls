/**
 * Detalhe de campanha — tema claro estilo WhatsApp Business.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useParams, useLocation } from "wouter";
import {
  ArrowLeft, Sparkles, Copy, Check, Loader2, AlertCircle,
  Globe, Instagram, Facebook, ExternalLink,
  ChevronDown, ChevronUp, Users, BadgeCheck, TrendingUp,
  DollarSign, Lightbulb, Play, Pause, CopyPlus,
} from "lucide-react";
import { OwnerNav } from "../../components/owner/OwnerNav";
import {
  businessApi, type Campaign, type CampaignKit,
  type CampaignMetrics, type CampaignPlatform,
} from "../../lib/api";
import { useBusinessSlug } from "../../hooks/useBusinessSlug";

// ─── Colours ─────────────────────────────────────────────────────────────────
const C = {
  bg:     "#F0F2F5",
  white:  "#FFFFFF",
  text:   "#111B21",
  text2:  "#667781",
  text3:  "#8696A0",
  green:  "#00A884",
  border: "#E9EDEF",
};

// ─── Constants ────────────────────────────────────────────────────────────────
const PLATFORM_META: Record<CampaignPlatform, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  google:    { label: "Google Ads",  icon: <Globe size={14} />,     color: "#4285F4", bg: "#E8F0FE" },
  instagram: { label: "Instagram",   icon: <Instagram size={14} />, color: "#E1306C", bg: "#FCE4EC" },
  facebook:  { label: "Facebook",    icon: <Facebook size={14} />,  color: "#1877F2", bg: "#E3F2FD" },
  tiktok:    { label: "TikTok",      icon: <span className="text-[13px] font-bold">T</span>, color: "#010101", bg: "#F5F5F5" },
};
const STATUS_NEXT: Record<Campaign["status"], Campaign["status"] | null> = {
  rascunho: "ativa", ativa: "pausada", pausada: "ativa", encerrada: null,
};

// ─── Copy button ──────────────────────────────────────────────────────────────
function CopyBtn({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1 text-[11px] transition-colors shrink-0 font-medium"
      style={{ color: copied ? "#2E7D32" : C.green }}>
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? "Copiado!" : label}
    </button>
  );
}

// ─── Collapsible section ──────────────────────────────────────────────────────
function Section({ title, children, defaultOpen = true }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        style={{ background: C.bg, borderBottom: open ? `1px solid ${C.border}` : undefined }}>
        <span className="text-[13px] font-semibold" style={{ color: C.text }}>{title}</span>
        {open ? <ChevronUp size={14} style={{ color: C.text3 }} /> : <ChevronDown size={14} style={{ color: C.text3 }} />}
      </button>
      {open && (
        <div className="px-4 py-3 space-y-3" style={{ background: C.white }}>{children}</div>
      )}
    </div>
  );
}

// ─── Kit view ─────────────────────────────────────────────────────────────────
function KitView({ kit }: { kit: CampaignKit }) {
  return (
    <div className="space-y-3 px-4 py-3">
      <Section title="✍️ Copies prontas a usar">
        {kit.copies.map((copy, i) => (
          <div key={i} className="rounded-xl p-3 space-y-1"
            style={{ background: C.bg, border: `1px solid ${C.border}` }}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] mb-1" style={{ color: C.text3 }}>Variante {i + 1}</p>
                <p className="font-semibold text-[14px]" style={{ color: C.text }}>{copy.headline}</p>
                <p className="text-[13px] mt-1 leading-relaxed" style={{ color: C.text2 }}>{copy.body}</p>
                <p className="text-[13px] mt-1 font-medium" style={{ color: C.green }}>→ {copy.cta}</p>
              </div>
              <CopyBtn text={`${copy.headline}\n\n${copy.body}\n\n${copy.cta}`} />
            </div>
          </div>
        ))}
      </Section>

      <Section title="🎯 Público-alvo">
        {[
          { label: "Demografias",   value: kit.audience.demographics },
          { label: "Interesses",    value: kit.audience.interests },
          { label: "Comportamentos",value: kit.audience.behaviours },
          { label: "Excluir",       value: kit.audience.excludedAudiences },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-[11px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: C.text3 }}>{label}</p>
            <p className="text-[13px] leading-relaxed" style={{ color: C.text2 }}>{value}</p>
          </div>
        ))}
      </Section>

      <Section title="💰 Orçamento & Licitação">
        {[
          { label: "Distribuição",          value: kit.budgetAllocation.suggestion },
          { label: "Orçamento diário",       value: kit.budgetAllocation.dailyBudget },
          { label: "Estratégia de licitação",value: kit.budgetAllocation.bidStrategy },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-[11px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: C.text3 }}>{label}</p>
            <p className="text-[13px] leading-relaxed" style={{ color: C.text2 }}>{value}</p>
          </div>
        ))}
      </Section>

      <Section title="🎨 Brief Criativo" defaultOpen={false}>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: C.text3 }}>Formatos</p>
          <p className="text-[13px] leading-relaxed" style={{ color: C.text2 }}>{kit.creativeBrief.format}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: C.text3 }}>Conceito visual</p>
          <p className="text-[13px] leading-relaxed" style={{ color: C.text2 }}>{kit.creativeBrief.visualConcept}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold mb-1" style={{ color: C.green }}>✓ Incluir</p>
          <ul className="space-y-0.5">{kit.creativeBrief.doList.map((d, i) => (
            <li key={i} className="text-[13px] leading-relaxed" style={{ color: C.text2 }}>• {d}</li>
          ))}</ul>
        </div>
        <div>
          <p className="text-[11px] font-semibold mb-1" style={{ color: "#C62828" }}>✗ Evitar</p>
          <ul className="space-y-0.5">{kit.creativeBrief.dontList.map((d, i) => (
            <li key={i} className="text-[13px] leading-relaxed" style={{ color: C.text2 }}>• {d}</li>
          ))}</ul>
        </div>
      </Section>

      <Section title="💡 Dicas de Segmentação" defaultOpen={false}>
        <ul className="space-y-1.5">{kit.segmentationTips.map((tip, i) => (
          <li key={i} className="text-[13px] leading-relaxed flex items-start gap-2" style={{ color: C.text2 }}>
            <span style={{ color: C.green }} className="mt-0.5 shrink-0">→</span>{tip}
          </li>
        ))}</ul>
      </Section>

      {kit.keyMetricsToTrack.length > 0 && (
        <Section title="📊 Métricas a monitorar" defaultOpen={false}>
          <div className="flex flex-wrap gap-1.5">
            {kit.keyMetricsToTrack.map((m, i) => (
              <span key={i} className="text-[12px] px-2.5 py-1 rounded-full"
                style={{ background: C.bg, color: C.text2, border: `1px solid ${C.border}` }}>{m}</span>
            ))}
          </div>
          <p className="text-[12px]" style={{ color: C.text3 }}>Alcance estimado: {kit.estimatedReach}</p>
        </Section>
      )}
    </div>
  );
}

// ─── Metrics dashboard ────────────────────────────────────────────────────────
function MetricsDashboard({ api, slug, metrics, campaign, onSpendUpdate }: {
  api: ReturnType<typeof businessApi>; slug: string;
  metrics: CampaignMetrics; campaign: Campaign; onSpendUpdate: (s: number) => void;
}) {
  const [editingSpend, setEditingSpend] = useState(false);
  const [spendInput, setSpendInput]     = useState(String(campaign.totalSpend));
  const [savingSpend, setSavingSpend]   = useState(false);

  const captationBaseUrl = `${import.meta.env.BASE_URL}e/${slug}/captacao`;
  const fullCaptationUrl = `${window.location.origin}${captationBaseUrl}?utm_source=${campaign.platform}&utm_medium=paid&utm_campaign=${campaign.utmSlug}`;

  const saveSpend = async () => {
    const spend = parseInt(spendInput, 10);
    if (isNaN(spend) || spend < 0) return;
    setSavingSpend(true);
    try { await api.updateCampaignStatus(campaign.id, { totalSpend: spend }); onSpendUpdate(spend); }
    finally { setSavingSpend(false); setEditingSpend(false); }
  };

  const statCards = [
    { label: "Leads",         value: metrics.totalLeads,                   color: "#4285F4", icon: <Users size={14} /> },
    { label: "Qualificados",  value: metrics.qualifiedLeads,               color: C.green,   icon: <BadgeCheck size={14} /> },
    { label: "% Qualific.",   value: `${metrics.qualificationRate}%`,       color: "#E65100", icon: <TrendingUp size={14} /> },
    { label: "Score médio",   value: metrics.avgScore ?? "–",              color: "#7B1FA2", icon: <TrendingUp size={14} /> },
  ];

  return (
    <div className="space-y-3 px-4 py-3">
      {/* Tracked link */}
      <div className="rounded-2xl p-3.5 space-y-2"
        style={{ background: "#E8F5E9", border: "1px solid #C8E6C9" }}>
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#2E7D32" }}>Link de captação rastreado</p>
        <div className="flex items-center gap-2">
          <p className="text-[12px] truncate flex-1" style={{ color: C.green }}>{fullCaptationUrl}</p>
          <CopyBtn text={fullCaptationUrl} label="Copiar" />
        </div>
        <p className="text-[11px]" style={{ color: "#2E7D32" }}>
          Usa este link nos teus anúncios. Cada lead fica atribuído a esta campanha.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        {statCards.map((s) => (
          <div key={s.label} className="rounded-2xl p-3"
            style={{ background: C.white, border: `1px solid ${C.border}` }}>
            <div className="flex items-center gap-1.5 mb-1.5" style={{ color: s.color }}>
              {s.icon}
              <span className="text-[10px] uppercase tracking-wide" style={{ color: C.text3 }}>{s.label}</span>
            </div>
            <p className="text-[22px] font-bold" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Spend tracker */}
      <div className="rounded-2xl p-3.5" style={{ background: C.white, border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <DollarSign size={14} style={{ color: "#E65100" }} />
            <span className="text-[11px] uppercase tracking-wide" style={{ color: C.text3 }}>Gasto registado</span>
          </div>
          <button onClick={() => setEditingSpend(!editingSpend)}
            className="text-[12px] font-medium" style={{ color: C.green }}>
            {editingSpend ? "Cancelar" : "Editar"}
          </button>
        </div>
        {editingSpend ? (
          <div className="flex items-center gap-2">
            <input value={spendInput} onChange={(e) => setSpendInput(e.target.value.replace(/\D/g, ""))}
              className="flex-1 rounded-xl px-3 py-1.5 text-[14px] outline-none"
              style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }} />
            <span className="text-[12px]" style={{ color: C.text3 }}>AOA</span>
            <button onClick={saveSpend} disabled={savingSpend}
              className="text-[13px] font-semibold" style={{ color: C.green }}>
              {savingSpend ? "…" : "OK"}
            </button>
          </div>
        ) : (
          <p className="text-[20px] font-bold" style={{ color: "#E65100" }}>
            {campaign.totalSpend.toLocaleString("pt-AO")} AOA
          </p>
        )}
        {metrics.costPerLead !== null && (
          <p className="text-[12px] mt-1" style={{ color: C.text2 }}>
            Custo por lead: <span style={{ color: C.text }}>{metrics.costPerLead.toLocaleString("pt-AO")} AOA</span>
            {metrics.costPerQualifiedLead && (
              <span> · por qualificado: <span style={{ color: C.text }}>{metrics.costPerQualifiedLead.toLocaleString("pt-AO")} AOA</span></span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function CampaignDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";
  const slug = useBusinessSlug();
  const api = useMemo(() => (slug ? businessApi(slug) : null), [slug]);

  const [campaign, setCampaign]           = useState<Campaign | null>(null);
  const [metrics, setMetrics]             = useState<CampaignMetrics | null>(null);
  const [suggestions, setSuggestions]     = useState<string[] | null | false>(null);
  const [generating, setGenerating]       = useState(false);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [tab, setTab]                     = useState<"kit" | "metricas">("kit");
  const [changingStatus, setChangingStatus] = useState(false);
  const [duplicating, setDuplicating]     = useState(false);
  const [, navigate]                      = useLocation();

  useEffect(() => {
    if (!api) return;
    Promise.all([api.getCampaignById(id), api.getCampaignMetrics(id)])
      .then(([{ campaign: c }, { metrics: m }]) => { setCampaign(c); setMetrics(m); })
      .catch(() => setError("Não foi possível carregar a campanha"))
      .finally(() => setLoading(false));
  }, [id, api]);

  const handleGenerate = useCallback(async () => {
    if (!api) return;
    setGenerating(true); setError(null);
    try {
      const { campaign: updated } = await api.generateCampaignKit(id);
      setCampaign(updated); setTab("kit");
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao gerar kit"); }
    finally { setGenerating(false); }
  }, [id, api]);

  const handleLoadOptimizations = useCallback(async () => {
    if (!api) return;
    setSuggestions(false);
    try {
      const { suggestions: s } = await api.getCampaignOptimizations(id);
      setSuggestions(s.length > 0 ? s : ["Sem sugestões adicionais — os dados estão bons! 👍"]);
    } catch { setSuggestions(["Não foi possível gerar sugestões agora — tenta mais tarde."]); }
  }, [id, api]);

  const handleDuplicate = useCallback(async () => {
    if (!api) return;
    setDuplicating(true);
    try {
      const { campaign: copy } = await api.duplicateCampaign(id);
      navigate(`/e/${slug}/dono/campanhas/${copy.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao duplicar"); setDuplicating(false); }
  }, [id, navigate, api, slug]);

  const handleStatusToggle = useCallback(async () => {
    if (!campaign || !api) return;
    const next = STATUS_NEXT[campaign.status]; if (!next) return;
    setChangingStatus(true);
    try {
      const { campaign: updated } = await api.updateCampaignStatus(campaign.id, { status: next });
      setCampaign(updated);
    } finally { setChangingStatus(false); }
  }, [campaign, api]);

  if (!slug) return null;

  if (loading) return (
    <div className="flex items-center justify-center h-full" style={{ background: C.bg }}>
      <Loader2 size={20} className="animate-spin" style={{ color: C.text3 }} />
    </div>
  );

  if (!campaign) return (
    <div className="flex flex-col items-center justify-center h-full gap-3" style={{ background: C.bg }}>
      <AlertCircle size={24} style={{ color: "#C62828" }} />
      <p className="text-[14px]" style={{ color: C.text }}>Campanha não encontrada</p>
      <Link href={`/e/${slug}/dono/campanhas`} className="text-[13px] font-medium" style={{ color: C.green }}>← Voltar</Link>
    </div>
  );

  const pm = PLATFORM_META[campaign.platform];
  const nextStatus = STATUS_NEXT[campaign.status];

  return (
    <div className="flex flex-col h-full" style={{ background: C.bg }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 shrink-0"
        style={{ background: C.white, borderBottom: `1px solid ${C.border}` }}>
        <Link href={`/e/${slug}/dono/campanhas`} className="p-1 -ml-1" style={{ color: C.text3 }}>
          <ArrowLeft size={22} />
        </Link>
        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{ background: pm.bg, color: pm.color }}>
          {pm.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[15px] truncate" style={{ color: C.text }}>{campaign.name}</p>
          <p className="text-[12px]" style={{ color: pm.color }}>{pm.label}</p>
        </div>
        <button onClick={handleDuplicate} disabled={duplicating}
          className="w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90"
          style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text2 }}
          title="Duplicar campanha">
          {duplicating ? <Loader2 size={14} className="animate-spin" /> : <CopyPlus size={14} />}
        </button>
        {nextStatus && (
          <button onClick={handleStatusToggle} disabled={changingStatus}
            className="text-[11px] font-semibold px-2.5 py-1.5 rounded-full flex items-center gap-1 transition-all"
            style={{
              background: nextStatus === "ativa" ? "#E8F5E9" : "#FFF8E1",
              color: nextStatus === "ativa" ? "#1B5E20" : "#E65100",
              border: `1px solid ${nextStatus === "ativa" ? "#A5D6A7" : "#FFE082"}`,
            }}>
            {changingStatus ? <Loader2 size={10} className="animate-spin" /> :
              nextStatus === "ativa" ? <Play size={10} /> : <Pause size={10} />}
            {nextStatus === "ativa" ? "Ativar" : "Pausar"}
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 flex items-center gap-2 text-[13px] rounded-xl px-3.5 py-2.5 shrink-0"
          style={{ background: "#FFEBEE", color: "#C62828", border: "1px solid #FFCDD2" }}>
          <AlertCircle size={13} className="shrink-0" /> {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex shrink-0" style={{ background: C.white, borderBottom: `1px solid ${C.border}` }}>
        {([["kit", "🎯 Kit IA"], ["metricas", "📊 Métricas"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex-1 py-2.5 text-[13px] font-semibold"
            style={{
              color: tab === key ? C.green : C.text3,
              borderBottom: tab === key ? `2px solid ${C.green}` : "2px solid transparent",
            }}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Kit tab */}
        {tab === "kit" && (
          <>
            {!campaign.kitJson && (
              <div className="flex flex-col items-center justify-center py-12 gap-4 px-6 text-center">
                <div className="w-14 h-14 rounded-full flex items-center justify-center"
                  style={{ background: "#E8F5E9" }}>
                  <Sparkles size={26} style={{ color: C.green }} />
                </div>
                <div>
                  <p className="text-[15px] font-semibold" style={{ color: C.text }}>Kit ainda não gerado</p>
                  <p className="text-[13px] mt-1 leading-relaxed" style={{ color: C.text2 }}>
                    A IA vai gerar copies, públicos, orçamento e brief criativo em segundos.
                  </p>
                </div>
                <button onClick={handleGenerate} disabled={generating}
                  className="flex items-center gap-2 text-[14px] font-semibold rounded-full px-5 py-2.5"
                  style={{ background: C.green, color: "#fff", opacity: generating ? 0.7 : 1 }}>
                  {generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                  {generating ? "A gerar kit…" : "Gerar kit com IA"}
                </button>
              </div>
            )}
            {campaign.kitJson && (
              <>
                {/* Regenerate button */}
                <div className="px-4 pt-3 pb-1 flex items-center justify-between">
                  <p className="text-[12px]" style={{ color: C.text3 }}>
                    Kit gerado pela IA · pode ser regenerado a qualquer momento
                  </p>
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-full transition-all"
                    style={{ background: "#E8F5E9", color: "#1B5E20", border: "1px solid #A5D6A7", opacity: generating ? 0.6 : 1 }}
                  >
                    {generating ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                    {generating ? "A regenerar…" : "Regenerar"}
                  </button>
                </div>
                <KitView kit={campaign.kitJson as CampaignKit} />
              </>
            )}
          </>
        )}

        {/* Metrics tab */}
        {tab === "metricas" && metrics && slug && (
          <>
            <MetricsDashboard
              api={api!} slug={slug} metrics={metrics} campaign={campaign}
              onSpendUpdate={(spend) => setCampaign((c) => c ? { ...c, totalSpend: spend } : c)}
            />
            {/* AI Suggestions */}
            <div className="px-4 pb-4">
              {suggestions === null && (
                <button onClick={handleLoadOptimizations}
                  className="w-full flex items-center justify-center gap-2 text-[13px] font-medium rounded-2xl py-3"
                  style={{ background: C.white, border: `1px solid ${C.border}`, color: C.text2 }}>
                  <Lightbulb size={15} style={{ color: "#E65100" }} /> Ver sugestões de otimização
                </button>
              )}
              {suggestions === false && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 size={18} className="animate-spin" style={{ color: C.text3 }} />
                </div>
              )}
              {Array.isArray(suggestions) && (
                <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
                  <div className="px-4 py-2.5" style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.text2 }}>Sugestões de IA</p>
                  </div>
                  <ul className="divide-y px-4" style={{ background: C.white, borderColor: C.border }}>
                    {suggestions.map((s, i) => (
                      <li key={i} className="py-3 flex items-start gap-2 text-[13px] leading-relaxed"
                        style={{ color: C.text2 }}>
                        <span style={{ color: C.green }} className="shrink-0 mt-0.5">→</span>{s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <OwnerNav />
    </div>
  );
}
