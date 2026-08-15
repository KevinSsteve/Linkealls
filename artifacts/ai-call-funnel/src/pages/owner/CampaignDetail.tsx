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
  Wallet, Smartphone, Rocket, Eye, MousePointerClick, StopCircle,
} from "lucide-react";
import { OwnerNav } from "../../components/owner/OwnerNav";
import {
  businessApi, type Campaign, type CampaignKit,
  type CampaignMetrics, type CampaignPlatform,
  type AdsQuote, type CampaignPublishStatus,
} from "../../lib/api";
import { useBusinessSlug } from "../../hooks/useBusinessSlug";

// ─── Colours ─────────────────────────────────────────────────────────────────
const C = {
  bg:     "#F3F4F6",
  white:  "#FFFFFF",
  text:   "#111827",
  text2:  "#6B7280",
  text3:  "#9CA3AF",
  green:  "#00A884",
  border: "#E5E7EB",
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

// ─── Publish flow (real ads via Zernio, paid in Kz) ──────────────────────────
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

function PublishFlow({ api, campaign, onUpdate }: {
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
          <PublishFlow api={api} campaign={campaign} onUpdate={setCampaign} />
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
