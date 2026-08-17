/**
 * Detalhe de campanha — tema claro estilo WhatsApp Business.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link, useParams, useLocation } from "wouter";
import {
  ArrowLeft, Sparkles, Copy, Check, Loader2, AlertCircle,
  Globe, Instagram, Facebook, ExternalLink,
  Layers2, ImagePlus, WandSparkles,
  ChevronDown, ChevronUp, Users, BadgeCheck, TrendingUp,
  DollarSign, Lightbulb, Play, Pause, CopyPlus,
  Wallet, Smartphone, Rocket, Eye, MousePointerClick, StopCircle,
} from "lucide-react";
import { OwnerNav } from "../../components/owner/OwnerNav";
import {
  businessApi, type Campaign, type CampaignKit,
  type CampaignMetrics, type CampaignPlatform,
  type AdsQuote, type CampaignPublishStatus,
  type CampaignSetup,
  uploadPrivateImage,
} from "../../lib/api";
import { useBusinessSlug } from "../../hooks/useBusinessSlug";
import { AppHeader, AppIconButton } from "../../components/app/AppHeader";

// ─── Colours ─────────────────────────────────────────────────────────────────
const C = {
  bg:     "#F8F9FA",
  white:  "#FFFFFF",
  text:   "#111111",
  text2:  "#6B7280",
  text3:  "#9CA3AF",
  green:  "#16A34A",
  border: "#E5E7EB",
};

// ─── Constants ────────────────────────────────────────────────────────────────
const PLATFORM_META: Record<CampaignPlatform, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  google:    { label: "Google Ads",  icon: <Globe size={14} />,     color: "#4285F4", bg: "#E8F0FE" },
  instagram: { label: "Instagram",   icon: <Instagram size={14} />, color: "#E1306C", bg: "#FCE4EC" },
  facebook:  { label: "Facebook",    icon: <Facebook size={14} />,  color: "#1877F2", bg: "#E3F2FD" },
  tiktok:    { label: "TikTok",      icon: <span className="text-[13px] font-bold">T</span>, color: "#010101", bg: "#F5F5F5" },
  meta:      { label: "Meta Ads",    icon: <Layers2 size={14} />,    color: "#0866FF", bg: "#E7F0FF" },
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

// ─── Meta Ads wizard (real ads via Zernio, paid in Kz) ─────────────────────────
const META_OBJECTIVES = [
  { value: "awareness", label: "Dar a conhecer", description: "Alcançar mais pessoas na tua zona." },
  { value: "traffic", label: "Levar pessoas ao catálogo", description: "Gerar visitas para os teus produtos." },
  { value: "lead_generation", label: "Receber contactos", description: "Encontrar pessoas interessadas no teu negócio." },
  { value: "engagement", label: "Gerar envolvimento", description: "Aumentar interações com a tua marca." },
] as const;

const CTA_LABELS: Record<CampaignSetup["creative"]["callToAction"], string> = {
  SHOP_NOW: "Comprar agora",
  LEARN_MORE: "Saber mais",
  CONTACT_US: "Contactar",
  ORDER_NOW: "Encomendar agora",
  GET_OFFER: "Ver oferta",
};

function defaultCampaignSetup(campaign: Campaign): CampaignSetup {
  return campaign.campaignSetup ?? {
    audience: {
      location: "Luanda",
      ageMin: 18,
      ageMax: 55,
      gender: "all",
      interests: "",
      excludedAudiences: "",
    },
    creative: {
      source: "gemini",
      referenceImagePath: null,
      mediaPath: null,
      mediaMimeType: null,
      prompt: "",
      headline: "",
      body: "",
      callToAction: "LEARN_MORE",
    },
  };
}

function objectStorageUrl(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${base}api/storage${path}`;
}

function MetaAdsWizard({ api, campaign, onUpdate }: {
  api: ReturnType<typeof businessApi>;
  campaign: Campaign;
  onUpdate: (c: Campaign) => void;
}) {
  const [step, setStep] = useState(0);
  const [setup, setSetup] = useState<CampaignSetup>(() => defaultCampaignSetup(campaign));
  const [objective, setObjective] = useState(campaign.objective);
  const [budget, setBudget] = useState(campaign.budget ? String(campaign.budget) : "");
  const [durationDays, setDurationDays] = useState(String(campaign.durationDays || 7));
  const [quote, setQuote] = useState<AdsQuote | null>(null);
  const [payMethod, setPayMethod] = useState<"carteira" | "multicaixa">("carteira");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"creative" | "reference" | null>(null);
  const creativeInput = useRef<HTMLInputElement>(null);
  const referenceInput = useRef<HTMLInputElement>(null);

  const paid = campaign.paymentStatus === "pago";
  const creativeReady = campaign.creativeStatus === "pronto" && !!campaign.creativeJson;
  const published = !["nao_publicada", "erro", "rejeitada"].includes(campaign.publishStatus);
  const ps = PUBLISH_LABEL[campaign.publishStatus];

  useEffect(() => {
    if (!campaign.budget) return;
    api.getAdsQuote(campaign.budget).then(setQuote).catch(() => {});
  }, [api, campaign.budget]);

  useEffect(() => {
    if (campaign.campaignSetup) setSetup(campaign.campaignSetup);
    setObjective(campaign.objective);
    setBudget(campaign.budget ? String(campaign.budget) : "");
    setDurationDays(String(campaign.durationDays || 7));
  }, [campaign.campaignSetup, campaign.objective, campaign.budget, campaign.durationDays]);

  const polling = campaign.creativeStatus === "a_gerar" ||
    campaign.paymentStatus === "pendente" ||
    campaign.publishStatus === "a_publicar";
  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(() => {
      api.getCampaignById(campaign.id).then(({ campaign: next }) => onUpdate(next)).catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [api, campaign.id, onUpdate, polling]);

  const run = async (key: string, fn: () => Promise<{ campaign: Campaign }>) => {
    setBusy(key);
    setError(null);
    try {
      const { campaign: next } = await fn();
      onUpdate(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setBusy(null);
    }
  };

  const saveObjective = async (nextObjective: string) => {
    setObjective(nextObjective);
    setError(null);
    try {
      const { campaign: next } = await api.updateCampaignStatus(campaign.id, { objective: nextObjective });
      onUpdate(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível guardar o objetivo");
    }
  };

  const saveSetup = async (nextStep: number) => {
    setBusy("save");
    setError(null);
    try {
      const { campaign: next } = await api.updateCampaignSetup(campaign.id, setup);
      onUpdate(next);
      setStep(nextStep);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível guardar esta etapa");
    } finally {
      setBusy(null);
    }
  };

  const saveBudget = async () => {
    const amount = Number.parseInt(budget, 10);
    const days = Math.min(90, Math.max(1, Number.parseInt(durationDays, 10) || 7));
    if (!Number.isInteger(amount) || amount < (quote?.minBudgetAoa ?? 5000)) {
      setError(`O orçamento mínimo é ${(quote?.minBudgetAoa ?? 5000).toLocaleString("pt-AO")} Kz.`);
      return;
    }
    await run("budget", async () => {
      const { campaign: next } = await api.updateCampaignStatus(campaign.id, { budget: amount, durationDays: days });
      setQuote(await api.getAdsQuote(amount));
      setStep(4);
      return { campaign: next };
    });
  };

  const handleFile = async (file: File | undefined, kind: "creative" | "reference") => {
    if (!file) return;
    setUploading(kind);
    setError(null);
    try {
      const path = await uploadPrivateImage(file);
      setSetup((current) => ({
        ...current,
        creative: {
          ...current.creative,
          ...(kind === "creative"
            ? { source: "upload" as const, mediaPath: path, mediaMimeType: file.type }
            : { referenceImagePath: path, mediaMimeType: file.type }),
        },
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar a imagem");
    } finally {
      setUploading(null);
    }
  };

  const generate = async () => {
    setBusy("generate");
    setError(null);
    try {
      const { campaign: saved } = await api.updateCampaignSetup(campaign.id, setup);
      onUpdate(saved);
      const { campaign: started } = await api.generateCampaignCreative(campaign.id);
      onUpdate(started);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível iniciar a geração");
    } finally {
      setBusy(null);
    }
  };

  const audience = setup.audience;
  const creative = setup.creative;
  const selectedObjective = META_OBJECTIVES.find((item) => item.value === objective);

  return (
    <div className="space-y-3 px-4 py-3">
      <div className="rounded-2xl px-3.5 py-3 flex items-center justify-between"
        style={{ background: ps.bg, border: `1px solid ${ps.color}22` }}>
        <div>
          <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: ps.color }}>Meta Ads</p>
          <p className="text-[15px] font-bold" style={{ color: ps.color }}>{published ? ps.label : `Passo ${step + 1} de 5`}</p>
        </div>
        {quote?.simulated && <span className="text-[10px] px-2 py-1 rounded-full font-semibold" style={{ background: "#FFF", color: "#E65100" }}>SIMULAÇÃO</span>}
      </div>

      {error && (
        <div className="rounded-xl px-3.5 py-2.5 text-[12px] flex items-start gap-2" style={{ background: "#FFEBEE", color: "#C62828" }}>
          <AlertCircle size={13} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <div className="flex gap-1.5 px-1">
        {[0, 1, 2, 3, 4].map((item) => (
          <div key={item} className="h-1 flex-1 rounded-full" style={{ background: item <= step ? C.green : C.border }} />
        ))}
      </div>

      {step === 0 && (
        <WizardCard title="Qual é o objetivo?" description="Escolhe o resultado mais importante para esta campanha.">
          <div className="space-y-2">
            {META_OBJECTIVES.map((item) => (
              <button key={item.value} type="button" onClick={() => void saveObjective(item.value)}
                className="w-full rounded-xl px-3 py-3 text-left"
                style={{ background: objective === item.value ? "#E8F5E9" : C.bg, border: `1px solid ${objective === item.value ? "#A5D6A7" : C.border}` }}>
                <p className="text-[13px] font-semibold" style={{ color: objective === item.value ? "#1B5E20" : C.text }}>{item.label}</p>
                <p className="text-[11px] mt-0.5" style={{ color: C.text2 }}>{item.description}</p>
              </button>
            ))}
          </div>
          <NextButton label="Escolher criativo" onClick={() => setStep(1)} disabled={!objective} />
        </WizardCard>
      )}

      {step === 1 && (
        <WizardCard title="Que imagem queres usar?" description="Podes carregar uma imagem tua ou pedir uma imagem nova à Gemini.">
          <div className="grid grid-cols-2 gap-2">
            {([
              ["upload", "Imagem própria", "Usar uma foto do produto ou negócio", <ImagePlus size={17} />],
              ["gemini", "Gerar com Gemini", "Criar uma imagem publicitária", <WandSparkles size={17} />],
            ] as const).map(([source, label, description, icon]) => (
              <button key={source} type="button" onClick={() => setSetup((current) => ({
                ...current,
                creative: {
                  ...current.creative,
                  source,
                  ...(current.creative.source === source ? {} : { mediaPath: null, mediaMimeType: null }),
                },
              }))}
                className="rounded-xl p-3 text-left"
                style={{ background: creative.source === source ? "#E8F5E9" : C.bg, border: `1px solid ${creative.source === source ? "#A5D6A7" : C.border}` }}>
                <span style={{ color: creative.source === source ? C.green : C.text2 }}>{icon}</span>
                <p className="text-[12px] font-semibold mt-2" style={{ color: C.text }}>{label}</p>
                <p className="text-[10px] mt-0.5 leading-relaxed" style={{ color: C.text2 }}>{description}</p>
              </button>
            ))}
          </div>

          {creative.source === "upload" ? (
            <>
              <input ref={creativeInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                onChange={(event) => { void handleFile(event.target.files?.[0], "creative"); event.currentTarget.value = ""; }} />
              <button type="button" onClick={() => creativeInput.current?.click()} disabled={uploading !== null}
                className="w-full rounded-xl py-3 text-[13px] font-semibold"
                style={{ background: C.bg, color: C.green, border: `1px dashed ${C.green}` }}>
                {uploading === "creative" ? <Loader2 size={15} className="animate-spin inline mr-2" /> : <ImagePlus size={15} className="inline mr-2" />}
                {creative.mediaPath ? "Trocar imagem" : "Carregar imagem"}
              </button>
              {creative.mediaPath && <img src={objectStorageUrl(creative.mediaPath)} alt="Pré-visualização" className="w-full rounded-xl object-cover" style={{ maxHeight: 260 }} />}
              <input value={creative.headline} maxLength={40} onChange={(event) => setSetup((current) => ({ ...current, creative: { ...current.creative, headline: event.target.value } }))}
                placeholder="Título do anúncio (máx. 40 caracteres)" className="w-full rounded-xl px-3 py-2.5 text-[13px] outline-none" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }} />
              <textarea value={creative.body} maxLength={300} onChange={(event) => setSetup((current) => ({ ...current, creative: { ...current.creative, body: event.target.value } }))}
                placeholder="Texto curto do anúncio" rows={3} className="w-full rounded-xl px-3 py-2.5 text-[13px] outline-none resize-none" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }} />
            </>
          ) : (
            <>
              <input ref={referenceInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                onChange={(event) => { void handleFile(event.target.files?.[0], "reference"); event.currentTarget.value = ""; }} />
              <button type="button" onClick={() => referenceInput.current?.click()} disabled={uploading !== null}
                className="w-full rounded-xl py-3 text-[13px] font-semibold"
                style={{ background: C.bg, color: C.green, border: `1px dashed ${C.green}` }}>
                {uploading === "reference" ? <Loader2 size={15} className="animate-spin inline mr-2" /> : <ImagePlus size={15} className="inline mr-2" />}
                {creative.referenceImagePath ? "Trocar imagem de referência" : "Adicionar referência (opcional)"}
              </button>
              {creative.referenceImagePath && <img src={objectStorageUrl(creative.referenceImagePath)} alt="Imagem de referência" className="w-full rounded-xl object-cover" style={{ maxHeight: 180 }} />}
              <textarea value={creative.prompt} onChange={(event) => setSetup((current) => ({ ...current, creative: { ...current.creative, prompt: event.target.value } }))}
                placeholder="Descreve o estilo, ambiente ou mensagem que queres ver na imagem (opcional)" rows={3} className="w-full rounded-xl px-3 py-2.5 text-[13px] outline-none resize-none" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }} />
              <button type="button" onClick={() => void generate()} disabled={busy !== null || campaign.creativeStatus === "a_gerar"}
                className="w-full rounded-full py-2.5 text-[13px] font-semibold flex items-center justify-center gap-2"
                style={{ background: C.green, color: "#fff", opacity: busy ? 0.7 : 1 }}>
                {busy === "generate" || campaign.creativeStatus === "a_gerar" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {campaign.creativeStatus === "a_gerar" ? "A criar a imagem…" : creativeReady ? "Gerar outra imagem" : "Gerar imagem com Gemini"}
              </button>
              {creativeReady && campaign.creativeJson && (
                <div className="space-y-2">
                  <img src={campaign.creativeJson.mediaUrl} alt="Criativo Meta" className="w-full rounded-xl" />
                  <p className="text-[13px] font-semibold" style={{ color: C.text }}>{campaign.creativeJson.headline}</p>
                  <p className="text-[12px]" style={{ color: C.text2 }}>{campaign.creativeJson.body}</p>
                </div>
              )}
              {campaign.creativeStatus === "erro" && <p className="text-[12px]" style={{ color: "#C62828" }}>{campaign.creativeError ?? "Erro ao gerar imagem"}</p>}
            </>
          )}

          <div className="flex gap-2">
            <BackButton onClick={() => setStep(0)} />
            <NextButton className="flex-1" label="Definir público" onClick={() => void saveSetup(2)}
              disabled={busy !== null || (creative.source === "upload" && (!creative.mediaPath || !creative.headline.trim() || !creative.body.trim())) || (creative.source === "gemini" && !creativeReady)} />
          </div>
        </WizardCard>
      )}

      {step === 2 && (
        <WizardCard title="Quem queres alcançar?" description="Começa simples. O Meta pode otimizar a entrega dentro deste público.">
          <label className="field-label">Localização</label>
          <input value={audience.location} onChange={(event) => setSetup((current) => ({ ...current, audience: { ...current.audience, location: event.target.value } }))}
            placeholder="Ex: Luanda" className="wizard-input" />
          <div className="grid grid-cols-2 gap-2">
            <div><label className="field-label">Idade mínima</label><input type="number" min={13} max={65} value={audience.ageMin} onChange={(event) => setSetup((current) => ({ ...current, audience: { ...current.audience, ageMin: Number(event.target.value) } }))} className="wizard-input" /></div>
            <div><label className="field-label">Idade máxima</label><input type="number" min={13} max={65} value={audience.ageMax} onChange={(event) => setSetup((current) => ({ ...current, audience: { ...current.audience, ageMax: Number(event.target.value) } }))} className="wizard-input" /></div>
          </div>
          <label className="field-label">Género</label>
          <select value={audience.gender} onChange={(event) => setSetup((current) => ({ ...current, audience: { ...current.audience, gender: event.target.value as CampaignSetup["audience"]["gender"] } }))} className="wizard-input">
            <option value="all">Todas as pessoas</option><option value="female">Mulheres</option><option value="male">Homens</option>
          </select>
          <label className="field-label">Interesses (separados por vírgulas)</label>
          <input value={audience.interests} onChange={(event) => setSetup((current) => ({ ...current, audience: { ...current.audience, interests: event.target.value } }))}
            placeholder="Ex: casa, tecnologia, empreendedorismo" className="wizard-input" />
          <label className="field-label">Excluir (opcional)</label>
          <input value={audience.excludedAudiences} onChange={(event) => setSetup((current) => ({ ...current, audience: { ...current.audience, excludedAudiences: event.target.value } }))}
            placeholder="Ex: clientes actuais" className="wizard-input" />
          <div className="flex gap-2"><BackButton onClick={() => setStep(1)} /><NextButton className="flex-1" label="Definir orçamento" onClick={() => void saveSetup(3)} disabled={busy !== null || !audience.location.trim() || audience.ageMax < audience.ageMin} /></div>
        </WizardCard>
      )}

      {step === 3 && (
        <WizardCard title="Quanto queres investir?" description="O orçamento é total para toda a duração da campanha.">
          <label className="field-label">Orçamento total (Kz)</label>
          <input value={budget} onChange={(event) => setBudget(event.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Ex: 50000" className="wizard-input text-[18px] font-semibold" />
          <label className="field-label">Duração (dias)</label>
          <input value={durationDays} onChange={(event) => setDurationDays(event.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="7" className="wizard-input" />
          {budget && quote && Number(budget) > 0 && <p className="text-[12px]" style={{ color: C.text2 }}>≈ <b style={{ color: C.text }}>${quote.budgetUsd.toFixed(2)}</b> para anúncios Meta · câmbio {quote.fxRateAoaPerUsd.toLocaleString("pt-AO")} Kz/USD</p>}
          <div className="flex gap-2"><BackButton onClick={() => setStep(2)} /><NextButton className="flex-1" label="Rever campanha" onClick={() => void saveBudget()} disabled={busy !== null || !budget} /></div>
        </WizardCard>
      )}

      {step === 4 && (
        <WizardCard title="Está tudo pronto?" description="Revisa antes de pagar. O anúncio só é enviado ao Meta depois da tua confirmação.">
          <ReviewRow label="Objetivo" value={selectedObjective?.label ?? objective} />
          <ReviewRow label="Criativo" value={creative.source === "gemini" ? "Imagem criada pela Gemini" : "Imagem própria carregada"} />
          <ReviewRow label="Público" value={`${audience.location} · ${audience.ageMin}-${audience.ageMax} anos`} />
          <ReviewRow label="Investimento" value={`${campaign.budget.toLocaleString("pt-AO")} Kz · ${campaign.durationDays} dias`} />
          {!paid ? (
            <>
              {quote?.simulated && <div className="rounded-xl px-3 py-2 text-[12px]" style={{ background: "#FFF8E1", color: "#E65100", border: "1px solid #FFE082" }}>Modo de teste: nenhum anúncio real será publicado.</div>}
              <div className="flex gap-2">
                {([["carteira", "Carteira", <Wallet key="wallet" size={13} />], ["multicaixa", "Multicaixa", <Smartphone key="phone" size={13} />]] as const).map(([method, label, icon]) => (
                  <button key={method} onClick={() => setPayMethod(method)} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-[12px] font-semibold"
                    style={{ background: payMethod === method ? "#E8F5E9" : C.bg, color: payMethod === method ? "#1B5E20" : C.text2, border: `1px solid ${payMethod === method ? "#A5D6A7" : C.border}` }}>{icon}{label}</button>
                ))}
              </div>
              {payMethod === "multicaixa" && <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Telemóvel (9XXXXXXXX)" inputMode="tel" className="wizard-input" />}
              <button onClick={() => void run("pay", () => api.payCampaign(campaign.id, payMethod === "carteira" ? { method: "carteira" } : { method: "multicaixa", phone }))} disabled={busy !== null || (payMethod === "multicaixa" && !/^9\d{8}$/.test(phone.replace(/\s/g, "")))}
                className="w-full flex items-center justify-center gap-2 rounded-full py-2.5 text-[13px] font-semibold" style={{ background: C.green, color: "#fff", opacity: busy ? 0.7 : 1 }}>
                {busy === "pay" ? <Loader2 size={14} className="animate-spin" /> : <DollarSign size={14} />} Pagar {campaign.budget.toLocaleString("pt-AO")} Kz
              </button>
            </>
          ) : published ? (
            <div className="rounded-xl px-3 py-2.5 text-[13px]" style={{ background: "#E8F5E9", color: "#1B5E20" }}>Campanha enviada para o Meta. Estado actual: {ps.label}.</div>
          ) : (
            <button onClick={() => void run("publish", () => api.publishCampaign(campaign.id))} disabled={busy !== null}
              className="w-full flex items-center justify-center gap-2 rounded-full py-2.5 text-[13px] font-semibold" style={{ background: "#111827", color: "#fff", opacity: busy ? 0.7 : 1 }}>
              {busy === "publish" ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />} Publicar no Meta
            </button>
          )}
          {!paid && <BackButton onClick={() => setStep(3)} label="Voltar e editar" />}
        </WizardCard>
      )}
    </div>
  );
}

function WizardCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: C.white, border: `1px solid ${C.border}` }}>
      <div><p className="text-[16px] font-bold" style={{ color: C.text }}>{title}</p><p className="text-[12px] mt-1 leading-relaxed" style={{ color: C.text2 }}>{description}</p></div>
      {children}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 py-2.5 border-b last:border-b-0" style={{ borderColor: C.border }}><span className="text-[11px] uppercase tracking-wide" style={{ color: C.text3 }}>{label}</span><span className="text-[13px] font-semibold text-right" style={{ color: C.text }}>{value}</span></div>;
}

function NextButton({ label, onClick, disabled, className = "" }: { label: string; onClick: () => void; disabled?: boolean; className?: string }) {
  return <button onClick={onClick} disabled={disabled} className={`rounded-full py-2.5 text-[13px] font-semibold ${className}`} style={{ background: C.green, color: "#fff", opacity: disabled ? 0.45 : 1 }}>{label}<ChevronDown size={14} className="inline ml-1 -rotate-90" /></button>;
}

function BackButton({ onClick, label = "Voltar" }: { onClick: () => void; label?: string }) {
  return <button onClick={onClick} className="rounded-full py-2.5 px-4 text-[13px] font-semibold" style={{ background: C.bg, color: C.text2, border: `1px solid ${C.border}` }}>{label}</button>;
}

// ─── Legacy publish flow (TikTok/Facebook/Instagram history) ──────────────────
const PUBLISH_LABEL: Record<CampaignPublishStatus, { label: string; color: string; bg: string }> = {
  nao_publicada: { label: "Não publicada", color: "#6B7280", bg: "#F3F4F6" },
  a_publicar:    { label: "A publicar…",   color: "#E65100", bg: "#FFF8E1" },
  em_revisao:    { label: "Em revisão",    color: "#E65100", bg: "#FFF8E1" },
  ativa:         { label: "Ativa",         color: "#1B5E20", bg: "#E8F5E9" },
  pausada:       { label: "Pausada",       color: "#E65100", bg: "#FFF8E1" },
  encerrada:     { label: "Encerrada",     color: "#6B7280", bg: "#F3F4F6" },
  rejeitada:     { label: "Rejeitada",     color: "#C62828", bg: "#FFEBEE" },
  erro:          { label: "Erro",          color: "#C62828", bg: "#FFEBEE" },
};

function StepCard({ n, title, done, active, children }: {
  n: number; title: string; done: boolean; active: boolean; children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl p-3.5 space-y-2.5"
      style={{ background: C.white, border: `1px solid ${done ? "#A5D6A7" : C.border}`, opacity: active || done ? 1 : 0.55 }}>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0"
          style={{ background: done ? C.green : C.bg, color: done ? "#fff" : C.text2, border: done ? "none" : `1px solid ${C.border}` }}>
          {done ? <Check size={13} /> : n}
        </div>
        <p className="text-[13px] font-semibold" style={{ color: C.text }}>{title}</p>
      </div>
      {(active || done) && children}
    </div>
  );
}

function LegacyPublishFlow({ api, campaign, onUpdate }: {
  api: ReturnType<typeof businessApi>;
  campaign: Campaign;
  onUpdate: (c: Campaign) => void;
}) {
  const [quote, setQuote] = useState<AdsQuote | null>(null);
  const [payMethod, setPayMethod] = useState<"carteira" | "multicaixa">("carteira");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.getAdsQuote(campaign.budget).then(setQuote).catch(() => {});
  }, [api, campaign.budget]);

  // Poll while payment pending or creative generating or a_publicar
  const polling = campaign.paymentStatus === "pendente" || campaign.creativeStatus === "a_gerar" || campaign.publishStatus === "a_publicar";
  useEffect(() => {
    if (!polling) return;
    const t = setInterval(() => {
      api.getCampaignById(campaign.id).then(({ campaign: c }) => onUpdate(c)).catch(() => {});
    }, 4000);
    return () => clearInterval(t);
  }, [polling, api, campaign.id, onUpdate]);

  const run = async (key: string, fn: () => Promise<{ campaign: Campaign }>) => {
    setBusy(key); setErr(null);
    try { const { campaign: c } = await fn(); onUpdate(c); }
    catch (e) { setErr(e instanceof Error ? e.message : "Erro inesperado"); }
    finally { setBusy(null); }
  };

  const paid = campaign.paymentStatus === "pago";
  const creativeReady = campaign.creativeStatus === "pronto" && !!campaign.creativeJson;
  const published = !["nao_publicada", "erro", "rejeitada"].includes(campaign.publishStatus);
  const ps = PUBLISH_LABEL[campaign.publishStatus];
  const isTikTok = campaign.platform === "tiktok";
  const unsupported = campaign.platform === "google";

  return (
    <div className="space-y-3 px-4 py-3">
      {/* Status banner */}
      <div className="rounded-2xl px-3.5 py-3 flex items-center justify-between"
        style={{ background: ps.bg, border: `1px solid ${ps.color}22` }}>
        <div>
          <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: ps.color }}>Anúncio real</p>
          <p className="text-[15px] font-bold" style={{ color: ps.color }}>{ps.label}</p>
        </div>
        {quote?.simulated && published && (
          <span className="text-[10px] px-2 py-1 rounded-full font-semibold" style={{ background: "#FFF", color: "#E65100" }}>
            SIMULAÇÃO
          </span>
        )}
      </div>

      {campaign.publishError && (
        <div className="rounded-xl px-3.5 py-2.5 text-[12px]" style={{ background: "#FFEBEE", color: "#C62828" }}>
          {campaign.publishError}
        </div>
      )}
      {err && (
        <div className="rounded-xl px-3.5 py-2.5 text-[12px] flex items-start gap-2" style={{ background: "#FFEBEE", color: "#C62828" }}>
          <AlertCircle size={13} className="shrink-0 mt-0.5" /> {err}
        </div>
      )}

      {unsupported ? (
        <div className="rounded-2xl p-4 text-[13px]" style={{ background: C.white, border: `1px solid ${C.border}`, color: C.text2 }}>
          Google Ads ainda não está disponível para publicação automática. Cria uma campanha TikTok, Facebook ou Instagram.
        </div>
      ) : (
        <>
          {/* Step 1 — Pay */}
          <StepCard n={1} title="Pagar o orçamento em Kz" done={paid} active={!paid}>
            {!paid ? (
              <>
                {quote?.simulated && (
                  <div className="rounded-xl px-3 py-2 text-[12px] font-medium flex items-start gap-1.5"
                    style={{ background: "#FFF8E1", color: "#E65100", border: "1px solid #FFE082" }}>
                    <AlertCircle size={13} className="shrink-0 mt-0.5" />
                    Modo de teste: nenhum anúncio real será publicado. Não uses dinheiro real neste modo.
                  </div>
                )}
                <p className="text-[12px]" style={{ color: C.text2 }}>
                  Orçamento: <b style={{ color: C.text }}>{campaign.budget.toLocaleString("pt-AO")} Kz</b> · {campaign.durationDays} dias
                  {quote && quote.budgetUsd > 0 && (
                    <> · ≈ <b style={{ color: C.text }}>${quote.budgetUsd.toFixed(2)}</b> em anúncios (câmbio {quote.fxRateAoaPerUsd.toLocaleString("pt-AO")} Kz/USD)</>
                  )}
                </p>
                {quote && campaign.budget < quote.minBudgetAoa && (
                  <p className="text-[12px]" style={{ color: "#C62828" }}>
                    Orçamento mínimo: {quote.minBudgetAoa.toLocaleString("pt-AO")} Kz — edita a campanha.
                  </p>
                )}
                {campaign.paymentStatus === "pendente" ? (
                  <div className="flex items-center gap-2 text-[13px]" style={{ color: "#E65100" }}>
                    <Loader2 size={14} className="animate-spin" /> Aguarda a confirmação no Multicaixa Express…
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      {([["carteira", "Carteira", <Wallet key="w" size={13} />], ["multicaixa", "Multicaixa", <Smartphone key="m" size={13} />]] as const).map(([m, label, icon]) => (
                        <button key={m} onClick={() => setPayMethod(m)}
                          className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-semibold rounded-xl py-2"
                          style={{
                            background: payMethod === m ? "#E8F5E9" : C.bg,
                            color: payMethod === m ? "#1B5E20" : C.text2,
                            border: `1px solid ${payMethod === m ? "#A5D6A7" : C.border}`,
                          }}>
                          {icon}{label}
                        </button>
                      ))}
                    </div>
                    {payMethod === "multicaixa" && (
                      <input value={phone} onChange={(e) => setPhone(e.target.value)}
                        placeholder="Telemóvel (9XXXXXXXX)" inputMode="tel"
                        className="w-full rounded-xl px-3 py-2 text-[14px] outline-none"
                        style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }} />
                    )}
                    {campaign.paymentStatus === "falhado" && (
                      <p className="text-[12px]" style={{ color: "#C62828" }}>O pagamento anterior falhou — tenta de novo.</p>
                    )}
                    <button
                      onClick={() => run("pay", () => api.payCampaign(campaign.id,
                        payMethod === "carteira" ? { method: "carteira" } : { method: "multicaixa", phone }))}
                      disabled={busy !== null || (payMethod === "multicaixa" && !/^9\d{8}$/.test(phone.replace(/\s/g, "")))}
                      className="w-full flex items-center justify-center gap-2 text-[13px] font-semibold rounded-full py-2.5"
                      style={{ background: C.green, color: "#fff", opacity: busy ? 0.7 : 1 }}>
                      {busy === "pay" ? <Loader2 size={14} className="animate-spin" /> : <DollarSign size={14} />}
                      Pagar {campaign.budget.toLocaleString("pt-AO")} Kz
                    </button>
                  </>
                )}
              </>
            ) : (
              <p className="text-[12px]" style={{ color: C.text2 }}>
                Pago {campaign.paymentMethod === "carteira" ? "com a carteira" : "por Multicaixa Express"} · ≈ ${Number(campaign.budgetUsd ?? 0).toFixed(2)} (câmbio {Number(campaign.fxRateAoaPerUsd ?? 0).toLocaleString("pt-AO")} Kz/USD)
              </p>
            )}
          </StepCard>

          {/* Step 2 — Creative */}
          <StepCard n={2} title={isTikTok ? "Gerar vídeo do anúncio com IA" : "Gerar imagem do anúncio com IA"}
            done={creativeReady} active={paid}>
            {campaign.creativeStatus === "a_gerar" && (
              <div className="flex items-center gap-2 text-[13px]" style={{ color: "#E65100" }}>
                <Loader2 size={14} className="animate-spin" />
                {isTikTok ? "A gerar o vídeo… pode demorar 1-3 minutos" : "A gerar a imagem…"}
              </div>
            )}
            {campaign.creativeStatus === "erro" && (
              <p className="text-[12px]" style={{ color: "#C62828" }}>{campaign.creativeError ?? "Erro ao gerar"}</p>
            )}
            {creativeReady && campaign.creativeJson && (
              <div className="space-y-2">
                {campaign.creativeJson.mediaType === "video" ? (
                  <video src={campaign.creativeJson.mediaUrl} controls playsInline
                    className="w-full rounded-xl" style={{ maxHeight: 320, background: "#000" }} />
                ) : (
                  <img src={campaign.creativeJson.mediaUrl} alt="Criativo do anúncio" className="w-full rounded-xl" />
                )}
                <p className="text-[14px] font-semibold" style={{ color: C.text }}>{campaign.creativeJson.headline}</p>
                <p className="text-[13px]" style={{ color: C.text2 }}>{campaign.creativeJson.body}</p>
                {campaign.creativeJson.productNames.length > 0 && (
                  <p className="text-[11px]" style={{ color: C.text3 }}>
                    Produtos: {campaign.creativeJson.productNames.join(", ")}
                  </p>
                )}
              </div>
            )}
            {paid && campaign.creativeStatus !== "a_gerar" && !published && (
              <button
                onClick={() => run("creative", () => api.generateCampaignCreative(campaign.id))}
                disabled={busy !== null}
                className="w-full flex items-center justify-center gap-2 text-[13px] font-semibold rounded-full py-2.5"
                style={{
                  background: creativeReady ? "#E8F5E9" : C.green,
                  color: creativeReady ? "#1B5E20" : "#fff",
                  border: creativeReady ? "1px solid #A5D6A7" : "none",
                  opacity: busy ? 0.7 : 1,
                }}>
                {busy === "creative" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {creativeReady ? "Regenerar criativo" : "Gerar criativo com IA"}
              </button>
            )}
          </StepCard>

          {/* Step 3 — Publish */}
          <StepCard n={3} title="Publicar o anúncio" done={published} active={paid && creativeReady}>
            {!published ? (
              <button
                onClick={() => run("publish", () => api.publishCampaign(campaign.id))}
                disabled={busy !== null || !paid || !creativeReady}
                className="w-full flex items-center justify-center gap-2 text-[13px] font-semibold rounded-full py-2.5"
                style={{ background: "#111827", color: "#fff", opacity: busy || !paid || !creativeReady ? 0.6 : 1 }}>
                {busy === "publish" ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                Publicar no {isTikTok ? "TikTok" : campaign.platform === "instagram" ? "Instagram" : "Facebook"}
              </button>
            ) : (
              <>
                {/* Real metrics */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Impressões", value: campaign.syncedImpressions.toLocaleString("pt-AO"), icon: <Eye size={13} /> },
                    { label: "Cliques", value: campaign.syncedClicks.toLocaleString("pt-AO"), icon: <MousePointerClick size={13} /> },
                    { label: "Gasto", value: `${campaign.totalSpend.toLocaleString("pt-AO")} Kz`, icon: <DollarSign size={13} /> },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl p-2.5" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                      <div className="flex items-center gap-1 mb-1" style={{ color: C.text3 }}>{s.icon}
                        <span className="text-[9px] uppercase tracking-wide">{s.label}</span></div>
                      <p className="text-[14px] font-bold" style={{ color: C.text }}>{s.value}</p>
                    </div>
                  ))}
                </div>
                {campaign.lastSyncAt && (
                  <p className="text-[11px]" style={{ color: C.text3 }}>
                    Atualizado {new Date(campaign.lastSyncAt).toLocaleString("pt-AO")}
                  </p>
                )}
                {/* Controls */}
                {["ativa", "pausada", "em_revisao"].includes(campaign.publishStatus) && (
                  <div className="flex gap-2">
                    {campaign.publishStatus === "ativa" ? (
                      <button onClick={() => run("ctl", () => api.controlCampaignAd(campaign.id, "pause"))}
                        disabled={busy !== null}
                        className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-semibold rounded-full py-2"
                        style={{ background: "#FFF8E1", color: "#E65100", border: "1px solid #FFE082" }}>
                        <Pause size={12} /> Pausar
                      </button>
                    ) : campaign.publishStatus === "pausada" ? (
                      <button onClick={() => run("ctl", () => api.controlCampaignAd(campaign.id, "resume"))}
                        disabled={busy !== null}
                        className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-semibold rounded-full py-2"
                        style={{ background: "#E8F5E9", color: "#1B5E20", border: "1px solid #A5D6A7" }}>
                        <Play size={12} /> Retomar
                      </button>
                    ) : null}
                    <button
                      onClick={() => { if (confirm("Encerrar o anúncio definitivamente?")) void run("ctl", () => api.controlCampaignAd(campaign.id, "end")); }}
                      disabled={busy !== null}
                      className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-semibold rounded-full py-2"
                      style={{ background: "#FFEBEE", color: "#C62828", border: "1px solid #FFCDD2" }}>
                      <StopCircle size={12} /> Encerrar
                    </button>
                  </div>
                )}
              </>
            )}
          </StepCard>
        </>
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
  const [tab, setTab]                     = useState<"kit" | "publicar" | "metricas">("kit");
  const [changingStatus, setChangingStatus] = useState(false);
  const [duplicating, setDuplicating]     = useState(false);
  const [, navigate]                      = useLocation();

  useEffect(() => {
    if (!api) return;
    Promise.all([api.getCampaignById(id), api.getCampaignMetrics(id)])
              .then(([{ campaign: c }, { metrics: m }]) => {
                setCampaign(c);
                setMetrics(m);
                if (c.platform === "meta") setTab("publicar");
              })
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
      <AppHeader
        title={campaign.name}
        subtitle={pm.label}
        onBack={() => window.history.back()}
        leading={
        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{ background: pm.bg, color: pm.color }}>
          {pm.icon}
        </div>
        }
        actions={
          <>
            <AppIconButton label="Duplicar campanha" onClick={handleDuplicate} disabled={duplicating}>
              {duplicating ? <Loader2 size={16} className="animate-spin" /> : <CopyPlus size={16} />}
            </AppIconButton>
            {nextStatus && (
              <button
                onClick={handleStatusToggle}
                disabled={changingStatus}
                className="app-status-badge"
                style={{
                  color: nextStatus === "ativa" ? "#15803D" : "#B45309",
                  background: nextStatus === "ativa" ? "#DCFCE7" : "#FFFBEB",
                }}
              >
                {changingStatus ? <Loader2 size={11} className="animate-spin" /> :
                  nextStatus === "ativa" ? <Play size={10} /> : <Pause size={10} />}
                <span className="ml-1">{nextStatus === "ativa" ? "Ativar" : "Pausar"}</span>
              </button>
            )}
          </>
        }
      />

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 flex items-center gap-2 text-[13px] rounded-xl px-3.5 py-2.5 shrink-0"
          style={{ background: "#FFEBEE", color: "#C62828", border: "1px solid #FFCDD2" }}>
          <AlertCircle size={13} className="shrink-0" /> {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex shrink-0" style={{ background: C.white, borderBottom: `1px solid ${C.border}` }}>
        {([["kit", "🎯 Kit IA"], ["publicar", "🚀 Publicar"], ["metricas", "📊 Métricas"]] as const).map(([key, label]) => (
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

        {/* Publish tab */}
        {tab === "publicar" && api && (
          campaign.platform === "meta"
            ? <MetaAdsWizard api={api} campaign={campaign} onUpdate={setCampaign} />
            : <LegacyPublishFlow api={api} campaign={campaign} onUpdate={setCampaign} />
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
