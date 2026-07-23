/**
 * Detalhe de campanha — kit gerado por IA + dashboard de atribuição + optimização.
 */
import { useState, useEffect, useCallback } from "react";
import { Link, useParams } from "wouter";
import {
  ArrowLeft,
  Sparkles,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  Globe,
  Instagram,
  Facebook,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Users,
  BadgeCheck,
  TrendingUp,
  DollarSign,
  Lightbulb,
  Megaphone,
  Play,
  Pause,
} from "lucide-react";
import {
  getCampaignById,
  generateCampaignKit,
  getCampaignMetrics,
  getCampaignOptimizations,
  updateCampaignStatus,
  type Campaign,
  type CampaignKit,
  type CampaignMetrics,
  type CampaignPlatform,
} from "../../lib/api";

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_META: Record<
  CampaignPlatform,
  { label: string; icon: React.ReactNode; color: string; bg: string }
> = {
  google:    { label: "Google Ads",    icon: <Globe size={14} />,     color: "#4285F4", bg: "#4285F418" },
  instagram: { label: "Instagram",     icon: <Instagram size={14} />, color: "#E1306C", bg: "#E1306C18" },
  facebook:  { label: "Facebook",      icon: <Facebook size={14} />,  color: "#1877F2", bg: "#1877F218" },
  tiktok:    { label: "TikTok",        icon: <span className="text-[13px] font-bold">T</span>, color: "#69C9D0", bg: "#69C9D018" },
};

const STATUS_NEXT: Record<Campaign["status"], Campaign["status"] | null> = {
  rascunho: "ativa",
  ativa:    "pausada",
  pausada:  "ativa",
  encerrada: null,
};

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyBtn({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex items-center gap-1 text-[10px] transition-colors flex-shrink-0"
      style={{ color: copied ? "#00C896" : "#3E576F" }}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? "Copiado!" : label}
    </button>
  );
}

// ─── Collapsible section ──────────────────────────────────────────────────────

function Section({
  title,
  children,
  defaultOpen = true,
  accent,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  accent?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        style={{ background: "#111B27" }}
      >
        <span className="text-sm font-semibold" style={{ color: accent || "#EAF0F7" }}>{title}</span>
        {open ? <ChevronUp size={14} className="text-[#3E576F]" /> : <ChevronDown size={14} className="text-[#3E576F]" />}
      </button>
      {open && (
        <div className="px-4 py-3 space-y-2" style={{ background: "#0A1420" }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Kit rendering ────────────────────────────────────────────────────────────

function KitView({ kit }: { kit: CampaignKit }) {
  return (
    <div className="space-y-3">
      {/* Copies */}
      <Section title="✍️ Copies prontas a usar">
        {kit.copies.map((copy, i) => (
          <div key={i} className="rounded-xl p-3 space-y-2"
            style={{ background: "#111B27", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#7B96B2] mb-1">Variante {i + 1}</p>
                <p className="font-semibold text-sm text-[#EAF0F7]">{copy.headline}</p>
                <p className="text-xs text-[#B0C4D8] mt-1 leading-relaxed">{copy.body}</p>
                <p className="text-xs text-[#00C896] mt-1 font-medium">→ {copy.cta}</p>
              </div>
              <CopyBtn text={`${copy.headline}\n\n${copy.body}\n\n${copy.cta}`} />
            </div>
          </div>
        ))}
      </Section>

      {/* Audience */}
      <Section title="🎯 Público-alvo">
        {[
          { label: "Demografias", value: kit.audience.demographics },
          { label: "Interesses", value: kit.audience.interests },
          { label: "Comportamentos", value: kit.audience.behaviours },
          { label: "Excluir", value: kit.audience.excludedAudiences },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-[10px] text-[#3E576F] uppercase tracking-wide mb-0.5">{label}</p>
            <p className="text-xs text-[#B0C4D8] leading-relaxed">{value}</p>
          </div>
        ))}
      </Section>

      {/* Budget */}
      <Section title="💰 Orçamento & Licitação">
        {[
          { label: "Distribuição", value: kit.budgetAllocation.suggestion },
          { label: "Orçamento diário", value: kit.budgetAllocation.dailyBudget },
          { label: "Estratégia de licitação", value: kit.budgetAllocation.bidStrategy },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-[10px] text-[#3E576F] uppercase tracking-wide mb-0.5">{label}</p>
            <p className="text-xs text-[#B0C4D8] leading-relaxed">{value}</p>
          </div>
        ))}
      </Section>

      {/* Creative brief */}
      <Section title="🎨 Brief Criativo" defaultOpen={false}>
        <div>
          <p className="text-[10px] text-[#3E576F] uppercase tracking-wide mb-0.5">Formatos</p>
          <p className="text-xs text-[#B0C4D8] leading-relaxed">{kit.creativeBrief.format}</p>
        </div>
        <div>
          <p className="text-[10px] text-[#3E576F] uppercase tracking-wide mb-0.5">Conceito visual</p>
          <p className="text-xs text-[#B0C4D8] leading-relaxed">{kit.creativeBrief.visualConcept}</p>
        </div>
        <div>
          <p className="text-[10px] text-[#00C896] uppercase tracking-wide mb-1">✓ Incluir</p>
          <ul className="space-y-0.5">
            {kit.creativeBrief.doList.map((d, i) => (
              <li key={i} className="text-xs text-[#B0C4D8] leading-relaxed">• {d}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[10px] text-[#EF4444] uppercase tracking-wide mb-1">✗ Evitar</p>
          <ul className="space-y-0.5">
            {kit.creativeBrief.dontList.map((d, i) => (
              <li key={i} className="text-xs text-[#B0C4D8] leading-relaxed">• {d}</li>
            ))}
          </ul>
        </div>
      </Section>

      {/* Segmentation tips */}
      <Section title="💡 Dicas de Segmentação" defaultOpen={false}>
        <ul className="space-y-1.5">
          {kit.segmentationTips.map((tip, i) => (
            <li key={i} className="text-xs text-[#B0C4D8] leading-relaxed flex items-start gap-2">
              <span className="text-[#00C896] mt-0.5 flex-shrink-0">→</span>
              {tip}
            </li>
          ))}
        </ul>
      </Section>

      {/* Metrics to track */}
      {kit.keyMetricsToTrack.length > 0 && (
        <Section title="📊 Métricas a monitorar" defaultOpen={false}>
          <div className="flex flex-wrap gap-1.5">
            {kit.keyMetricsToTrack.map((m, i) => (
              <span key={i} className="text-[11px] px-2.5 py-1 rounded-full"
                style={{ background: "#1A2B3D", color: "#7B96B2", border: "1px solid rgba(255,255,255,0.06)" }}>
                {m}
              </span>
            ))}
          </div>
          <p className="text-xs text-[#3E576F] mt-1">Alcance estimado: {kit.estimatedReach}</p>
        </Section>
      )}
    </div>
  );
}

// ─── Metrics dashboard ────────────────────────────────────────────────────────

function MetricsDashboard({
  metrics,
  campaign,
  onSpendUpdate,
}: {
  metrics: CampaignMetrics;
  campaign: Campaign;
  onSpendUpdate: (spend: number) => void;
}) {
  const [editingSpend, setEditingSpend] = useState(false);
  const [spendInput,   setSpendInput]   = useState(String(campaign.totalSpend));
  const [savingSpend,  setSavingSpend]  = useState(false);

  // BASE_URL is set by Vite and includes the artifact prefix in both dev and prod
  // (e.g. "/ai-call-funnel/"). Always use it so copied links resolve correctly.
  const captationBaseUrl = `${import.meta.env.BASE_URL}captacao`;
  const fullCaptationUrl = `${window.location.origin}${captationBaseUrl}?utm_source=${campaign.platform}&utm_medium=paid&utm_campaign=${campaign.utmSlug}`;

  const saveSpend = async () => {
    const spend = parseInt(spendInput, 10);
    if (isNaN(spend) || spend < 0) return;
    setSavingSpend(true);
    try {
      await updateCampaignStatus(campaign.id, { totalSpend: spend });
      onSpendUpdate(spend);
    } finally {
      setSavingSpend(false);
      setEditingSpend(false);
    }
  };

  const statCards = [
    { label: "Leads",         value: metrics.totalLeads,      color: "#4285F4", icon: <Users size={14} /> },
    { label: "Qualificados",  value: metrics.qualifiedLeads,  color: "#00C896", icon: <BadgeCheck size={14} /> },
    { label: "% Qualific.",   value: `${metrics.qualificationRate}%`, color: "#F59E0B", icon: <TrendingUp size={14} /> },
    { label: "Score médio",   value: metrics.avgScore ?? "–", color: "#A78BFA", icon: <TrendingUp size={14} /> },
  ];

  return (
    <div className="space-y-3">
      {/* Link rastreado */}
      <div className="rounded-xl p-3 space-y-2"
        style={{ background: "#111B27", border: "1px solid rgba(0,200,150,0.15)" }}>
        <p className="text-[10px] text-[#3E576F] uppercase tracking-wide">Link de captação rastreado</p>
        <div className="flex items-center gap-2">
          <p className="text-xs text-[#00C896] flex-1 min-w-0 truncate">{fullCaptationUrl}</p>
          <CopyBtn text={fullCaptationUrl} label="Copiar link" />
        </div>
        <p className="text-[10px] text-[#3E576F]">
          Usa este link nos teus anúncios. Cada lead que vier por aqui fica atribuído a esta campanha.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        {statCards.map((s) => (
          <div key={s.label} className="rounded-xl p-3"
            style={{ background: "#111B27", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-1.5 mb-1.5" style={{ color: s.color }}>
              {s.icon}
              <span className="text-[10px] uppercase tracking-wide text-[#3E576F]">{s.label}</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Spend tracker */}
      <div className="rounded-xl p-3"
        style={{ background: "#111B27", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <DollarSign size={13} className="text-[#F59E0B]" />
            <span className="text-[10px] uppercase tracking-wide text-[#3E576F]">Gasto registado</span>
          </div>
          <button
            onClick={() => setEditingSpend(!editingSpend)}
            className="text-[10px] text-[#3E576F] hover:text-[#EAF0F7] transition-colors"
          >
            {editingSpend ? "Cancelar" : "Editar"}
          </button>
        </div>
        {editingSpend ? (
          <div className="flex items-center gap-2">
            <input
              value={spendInput}
              onChange={(e) => setSpendInput(e.target.value.replace(/\D/g, ""))}
              className="flex-1 rounded-lg px-2.5 py-1.5 text-sm outline-none"
              style={{ background: "#0A1420", border: "1px solid rgba(255,255,255,0.1)", color: "#EAF0F7" }}
            />
            <span className="text-xs text-[#3E576F]">AOA</span>
            <button
              onClick={saveSpend}
              disabled={savingSpend}
              className="text-xs text-[#00C896] font-medium"
            >
              {savingSpend ? "…" : "OK"}
            </button>
          </div>
        ) : (
          <p className="text-xl font-bold text-[#F59E0B]">
            {campaign.totalSpend.toLocaleString("pt-AO")} AOA
          </p>
        )}
        {metrics.costPerLead !== null && (
          <p className="text-xs text-[#3E576F] mt-1">
            Custo por lead: <span className="text-[#EAF0F7]">{metrics.costPerLead.toLocaleString("pt-AO")} AOA</span>
            {metrics.costPerQualifiedLead && (
              <span> · por qualificado: <span className="text-[#EAF0F7]">{metrics.costPerQualifiedLead.toLocaleString("pt-AO")} AOA</span></span>
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
  const id     = params.id ?? "";

  const [campaign,     setCampaign]     = useState<Campaign | null>(null);
  const [metrics,      setMetrics]      = useState<CampaignMetrics | null>(null);
  // null = idle, false = loading, string[] = loaded (may be empty)
  const [suggestions,  setSuggestions]  = useState<string[] | null | false>(null);
  const [generating,   setGenerating]   = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [tab,          setTab]          = useState<"kit" | "metricas">("kit");
  const [changingStatus, setChangingStatus] = useState(false);

  useEffect(() => {
    Promise.all([
      getCampaignById(id),
      getCampaignMetrics(id),
    ])
      .then(([{ campaign: c }, { metrics: m }]) => {
        setCampaign(c);
        setMetrics(m);
      })
      .catch(() => setError("Não foi possível carregar a campanha"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const { campaign: updated } = await generateCampaignKit(id);
      setCampaign(updated);
      setTab("kit");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao gerar kit");
    } finally {
      setGenerating(false);
    }
  }, [id]);

  const handleLoadOptimizations = useCallback(async () => {
    setSuggestions(false); // loading state
    try {
      const { suggestions: s } = await getCampaignOptimizations(id);
      setSuggestions(s.length > 0 ? s : ["Sem sugestões adicionais por agora — os dados estão bons! 👍"]);
    } catch {
      setSuggestions(["Não foi possível gerar sugestões agora — tenta mais tarde."]);
    }
  }, [id]);

  const handleStatusToggle = useCallback(async () => {
    if (!campaign) return;
    const next = STATUS_NEXT[campaign.status];
    if (!next) return;
    setChangingStatus(true);
    try {
      const { campaign: updated } = await updateCampaignStatus(campaign.id, { status: next });
      setCampaign(updated);
    } finally {
      setChangingStatus(false);
    }
  }, [campaign]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#080E18]">
        <Loader2 size={20} className="text-[#3E576F] animate-spin" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#080E18] gap-3">
        <AlertCircle size={24} className="text-red-400" />
        <p className="text-sm text-[#EAF0F7]">Campanha não encontrada</p>
        <Link href="/dono/campanhas" className="text-xs text-[#00C896]">← Voltar</Link>
      </div>
    );
  }

  const pm = PLATFORM_META[campaign.platform];
  const nextStatus = STATUS_NEXT[campaign.status];

  return (
    <div className="flex flex-col h-full bg-[#080E18]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0"
        style={{ background: "#111B27" }}>
        <Link href="/dono/campanhas" className="text-[#3E576F] hover:text-[#EAF0F7]">
          <ArrowLeft size={20} />
        </Link>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: pm.bg, color: pm.color }}>
          {pm.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[#EAF0F7] text-sm truncate">{campaign.name}</p>
          <p className="text-xs text-[#3E576F]">{pm.label}</p>
        </div>
        {nextStatus && (
          <button
            onClick={handleStatusToggle}
            disabled={changingStatus}
            className="text-[10px] font-medium px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all"
            style={{
              background: nextStatus === "ativa" ? "#00C89618" : "#F59E0B18",
              color: nextStatus === "ativa" ? "#00C896" : "#F59E0B",
              border: `1px solid ${nextStatus === "ativa" ? "#00C89630" : "#F59E0B30"}`,
            }}
          >
            {changingStatus ? <Loader2 size={10} className="animate-spin" /> :
              nextStatus === "ativa" ? <Play size={10} /> : <Pause size={10} />}
            {nextStatus === "ativa" ? "Ativar" : "Pausar"}
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 flex-shrink-0">
          <AlertCircle size={13} className="text-red-400 flex-shrink-0" />
          <span className="text-xs text-red-300">{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-white/[0.06] flex-shrink-0"
        style={{ background: "#0A1420" }}>
        {(["kit", "metricas"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-2.5 text-xs font-medium transition-colors"
            style={{
              color: tab === t ? "#00C896" : "#3E576F",
              borderBottom: tab === t ? "2px solid #00C896" : "2px solid transparent",
            }}
          >
            {t === "kit" ? "🎨 Kit da Campanha" : "📊 Métricas & Atribuição"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {tab === "kit" ? (
          <>
            {/* Generate button */}
            {!campaign.kitJson || generating ? (
              <div className="text-center space-y-3 py-4">
                {!campaign.kitJson && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#EAF0F7]">Kit ainda não gerado</p>
                    <p className="text-xs text-[#3E576F]">
                      O Gemini vai estudar o teu negócio e gerar copies, públicos e briefs para {pm.label}.
                    </p>
                  </div>
                )}
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex items-center gap-2 text-sm font-semibold rounded-xl px-5 py-2.5 mx-auto transition-all active:scale-95"
                  style={{
                    background: generating
                      ? "rgba(0,200,150,0.15)"
                      : "linear-gradient(135deg, #00C896 0%, #007A5C 100%)",
                    color: generating ? "#00C896" : "#fff",
                  }}
                >
                  {generating ? (
                    <><Loader2 size={15} className="animate-spin" />A gerar kit…</>
                  ) : (
                    <><Sparkles size={15} />Gerar kit com IA</>
                  )}
                </button>
                {generating && (
                  <p className="text-xs text-[#3E576F]">
                    O Gemini está a analisar o teu negócio e histórico de leads…
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[#3E576F]">
                    Gerado em {new Date(campaign.kitJson.generatedAt).toLocaleDateString("pt-AO")}
                  </p>
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex items-center gap-1 text-xs text-[#3E576F] hover:text-[#00C896] transition-colors"
                  >
                    <Sparkles size={11} />
                    Regenerar
                  </button>
                </div>
                <KitView kit={campaign.kitJson} />
              </>
            )}
          </>
        ) : (
          <>
            {metrics && (
              <>
                <MetricsDashboard
                  metrics={metrics}
                  campaign={campaign}
                  onSpendUpdate={(spend) => setCampaign((prev) => prev ? { ...prev, totalSpend: spend } : prev)}
                />

                {/* AI Optimization suggestions */}
                <div className="rounded-xl overflow-hidden"
                  style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="px-4 py-3 flex items-center justify-between"
                    style={{ background: "#111B27" }}>
                    <div className="flex items-center gap-2">
                      <Lightbulb size={14} className="text-yellow-400" />
                      <span className="text-sm font-semibold text-[#EAF0F7]">Sugestões de otimização</span>
                    </div>
                    {suggestions === null && (
                      <button
                        onClick={handleLoadOptimizations}
                        className="text-xs text-[#00C896] font-medium"
                      >
                        Gerar
                      </button>
                    )}
                  </div>
                  {suggestions === null ? (
                    // idle — not yet requested
                    <div className="px-4 py-3" style={{ background: "#0A1420" }}>
                      <p className="text-xs text-[#3E576F]">
                        Clica em "Gerar" para obter sugestões personalizadas com base nos teus dados reais.
                      </p>
                    </div>
                  ) : suggestions === false ? (
                    // loading — request in flight
                    <div className="px-4 py-3 flex items-center gap-2" style={{ background: "#0A1420" }}>
                      <Loader2 size={14} className="animate-spin text-[#3E576F]" />
                      <span className="text-xs text-[#3E576F]">A analisar dados…</span>
                    </div>
                  ) : (
                    // loaded — array (may be empty, handled inside handleLoadOptimizations)
                    <ul className="px-4 py-3 space-y-2" style={{ background: "#0A1420" }}>
                      {suggestions.map((s, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-[#00C896] mt-0.5 flex-shrink-0 text-xs">→</span>
                          <span className="text-xs text-[#B0C4D8] leading-relaxed">{s}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
