import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  ImagePlus,
  Loader2,
  MessageCircle,
  MoveHorizontal,
  PackageOpen,
  Pencil,
  Rocket,
  Smartphone,
  Sparkles,
  Wallet,
} from "lucide-react";
import {
  businessApi,
  confirmSensitiveAction,
  type Campaign,
  type CampaignDestination,
  type CampaignImageVariant,
  type CampaignSetup,
  type AdsQuote,
  uploadPrivateImage,
} from "../../lib/api";

const GREEN = "var(--green)";
const INK = "var(--ink)";
const MUTED = "var(--ink-soft)";
const BORDER = "var(--border)";
const SOFT = "var(--app-bg)";
const SEP = "1px solid var(--border)";

const DESTINATIONS: Array<{
  value: CampaignDestination;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  { value: "whatsapp", label: "Conversa no WhatsApp", description: "Receber mensagens de pessoas interessadas.", icon: <MessageCircle size={21} /> },
  { value: "download_app", label: "Baixar a app", description: "Levar pessoas para descarregar a Linkealls.", icon: <Smartphone size={21} /> },
  { value: "linkealls_chat", label: "Mensagem no chat Linkealls", description: "Abrir uma conversa com o teu negócio.", icon: <MessageCircle size={21} /> },
  { value: "catalog", label: "Acesso ao catálogo", description: "Mostrar os teus produtos e serviços.", icon: <PackageOpen size={21} /> },
  { value: "product", label: "Link directo de um produto", description: "Levar a pessoa para um produto específico.", icon: <ChevronRight size={21} /> },
];

function destinationFor(campaign: Campaign): CampaignDestination {
  return campaign.campaignSetup?.destination ??
    (campaign.objective === "engagement" ? "linkealls_chat" : "catalog");
}

function setupFor(campaign: Campaign): CampaignSetup {
  const existing = campaign.campaignSetup;
  return {
    destination: destinationFor(campaign),
    destinationUrl: existing?.destinationUrl ?? null,
    imageAnalysis: existing?.imageAnalysis ?? null,
    aiRecommendation: existing?.aiRecommendation ?? null,
    audience: {
      location: existing?.audience?.location ?? "Luanda",
      locationId: existing?.audience?.locationId ?? null,
      ageMin: existing?.audience?.ageMin ?? 18,
      ageMax: existing?.audience?.ageMax ?? 55,
      gender: existing?.audience?.gender ?? "all",
      interests: existing?.audience?.interests ?? "",
      interestIds: existing?.audience?.interestIds ?? [],
      excludedAudiences: existing?.audience?.excludedAudiences ?? "",
    },
    creative: {
      source: existing?.creative?.source ?? "upload",
      referenceImagePath: existing?.creative?.referenceImagePath ?? null,
      mediaPath: existing?.creative?.mediaPath ?? null,
      mediaMimeType: existing?.creative?.mediaMimeType ?? null,
      originalMediaPath: existing?.creative?.originalMediaPath ?? existing?.creative?.mediaPath ?? null,
      suggestedMediaPath: existing?.creative?.suggestedMediaPath ?? null,
      selectedVariant: existing?.creative?.selectedVariant ?? "original",
      prompt: existing?.creative?.prompt ?? "",
      headline: existing?.creative?.headline ?? "",
      body: existing?.creative?.body ?? "",
      callToAction: existing?.creative?.callToAction ?? "LEARN_MORE",
    },
  };
}

function storageUrl(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${base}api/storage${path}`;
}

function destinationLabel(value: CampaignDestination | undefined): string {
  return DESTINATIONS.find((item) => item.value === value)?.label ?? "Acesso ao catálogo";
}

function StepHeader({ step }: { step: number }) {
  const labels = ["Objectivo", "Imagem e descrição", "Pré-visualização", "Pagamento"];
  return (
    <div style={{ padding: "12px 20px 11px", background: "#FFF", borderBottom: SEP }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
        {labels.map((label, index) => (
          <div key={label} style={{
            height: 4, borderRadius: 4,
            background: index <= step ? INK : "#E9EDF1",
            transition: "background .2s ease",
          }} aria-label={label} />
        ))}
      </div>
      <p style={{ color: INK, fontSize: 12, fontWeight: 700, marginTop: 8 }}>
        {labels[Math.min(step, labels.length - 1)]}
      </p>
    </div>
  );
}

function PrimaryButton({ label, onClick, disabled, loading }: {
  label: string; onClick: () => void; disabled?: boolean; loading?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled || loading}
      style={{
        width: "100%", height: 50, border: 0, borderRadius: 25,
        background: disabled || loading ? "#B8C0C8" : INK, color: "#FFF",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        fontSize: 15, fontWeight: 700, cursor: disabled || loading ? "not-allowed" : "pointer",
      }}>
      {loading && <Loader2 size={17} className="animate-spin" />}
      {label}
    </button>
  );
}

function OutlineButton({ label, onClick, disabled, loading }: {
  label: string; onClick: () => void; disabled?: boolean; loading?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled || loading}
      style={{
        width: "100%", height: 46, border: `1px solid ${BORDER}`, borderRadius: 23,
        background: "#FFF", color: INK, display: "flex", alignItems: "center",
        justifyContent: "center", gap: 8, fontSize: 14, fontWeight: 650,
        opacity: disabled || loading ? 0.6 : 1,
      }}>
      {loading && <Loader2 size={16} className="animate-spin" />}
      {label}
    </button>
  );
}

function SimpleMetaAdsWizard({ api, campaign, onUpdate, onExit }: {
  api: ReturnType<typeof businessApi>;
  campaign: Campaign;
  onUpdate: (campaign: Campaign) => void;
  onExit: () => void;
}) {
  const [step, setStep] = useState(() => campaign.paymentStatus === "nao_pago" ? 0 : 3);
  const [setup, setSetup] = useState<CampaignSetup>(() => setupFor(campaign));
  const [destination, setDestination] = useState<CampaignDestination>(() => destinationFor(campaign));
  const [destinationUrl, setDestinationUrl] = useState(() => setupFor(campaign).destinationUrl ?? "");
  const [activeVariant, setActiveVariant] = useState<CampaignImageVariant>(
    () => setupFor(campaign).creative.selectedVariant ?? "original",
  );
  const [budget, setBudget] = useState(campaign.budget || 15_000);
  const [durationDays, setDurationDays] = useState(campaign.durationDays || 30);
  const [quote, setQuote] = useState<AdsQuote | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"carteira" | "multicaixa">("carteira");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);

  const paid = campaign.paymentStatus === "pago";
  const paymentPending = campaign.paymentStatus === "pendente";
  const published = ["em_revisao", "ativa", "pausada", "encerrada"].includes(campaign.publishStatus);
  const creativeReady = campaign.creativeStatus === "pronto" && !!campaign.creativeJson;
  const imagePath = setup.creative.mediaPath ?? setup.creative.referenceImagePath;
  const aiRecommendation = setup.aiRecommendation;
  const minBudget = quote?.minBudgetAoa ?? 5_000;
  const budgetUsd = quote ? (budget / quote.fxRateAoaPerUsd).toFixed(2) : null;
  const selectedDestination = useMemo(
    () => DESTINATIONS.find((item) => item.value === destination) ?? DESTINATIONS[3],
    [destination],
  );

  useEffect(() => {
    const next = setupFor(campaign);
    setSetup(next);
    setDestination(next.destination ?? destinationFor(campaign));
    setDestinationUrl(next.destinationUrl ?? "");
    setActiveVariant(next.creative.selectedVariant ?? "original");
    if (campaign.budget > 0) setBudget(campaign.budget);
    setDurationDays(campaign.durationDays || 30);
    if (campaign.paymentStatus !== "nao_pago") setStep(3);
  }, [campaign.campaignSetup, campaign.objective, campaign.budget, campaign.durationDays, campaign.paymentStatus]);

  useEffect(() => {
    api.getAdsQuote(budget).then(setQuote).catch(() => {});
  }, [api, budget]);

  useEffect(() => {
    if (!setup.creative.suggestedMediaPath || !carouselRef.current) return;
    setShowSwipeHint(true);
    const frame = window.requestAnimationFrame(() => {
      const carousel = carouselRef.current;
      if (carousel) {
        carousel.scrollTo({ left: carousel.clientWidth + 10, behavior: "smooth" });
      }
    });
    const timeout = window.setTimeout(() => setShowSwipeHint(false), 8_000);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [setup.creative.suggestedMediaPath]);

  const run = async (key: string, action: () => Promise<{ campaign: Campaign }>) => {
    if (key === "pay" || key === "publish") {
      if (!(await confirmSensitiveAction())) return;
    }
    setBusy(key); setError(null);
    try {
      const { campaign: updated } = await action();
      onUpdate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo correu mal. Tenta novamente.");
    } finally {
      setBusy(null);
    }
  };

  const chooseDestination = (value: CampaignDestination) => {
    if (paid) return;
    setDestination(value);
    setSetup((current) => ({ ...current, destination: value }));
  };

  const goFromObjective = async () => {
    if (destination === "product" && !/^https?:\/\/\S+$/i.test(destinationUrl.trim())) {
      setError("Cola o link directo do produto para continuar.");
      return;
    }
    const nextSetup = {
      ...setup,
      destination,
      destinationUrl: destination === "product" ? destinationUrl.trim() : null,
    };
    await run("objective", async () => {
      const savedSetup = await api.updateCampaignSetup(campaign.id, nextSetup);
      const savedCampaign = await api.updateCampaignStatus(campaign.id, {
        objective: destination === "linkealls_chat" ? "engagement" : "traffic",
      });
      setSetup(nextSetup);
      setStep(1);
      onUpdate(savedSetup.campaign);
      return savedCampaign;
    });
  };

  const handleImage = async (file: File | undefined) => {
    if (!file) return;
    setBusy("upload"); setError(null);
    try {
      const path = await uploadPrivateImage(file, api.slug);
      const withImage: CampaignSetup = {
        ...setup,
        destination,
        destinationUrl: destination === "product" ? destinationUrl.trim() : null,
        imageAnalysis: null,
        creative: {
          ...setup.creative,
          source: "upload",
          mediaPath: path,
          mediaMimeType: file.type,
          originalMediaPath: path,
          suggestedMediaPath: null,
          selectedVariant: "original",
        },
      };
      setSetup(withImage);
      const saved = await api.updateCampaignSetup(campaign.id, withImage);
      onUpdate(saved.campaign);
      setAnalysing(true);
      try {
        const { recommendations } = await api.analyzeCampaignImage(campaign.id);
        const enriched: CampaignSetup = {
          ...withImage,
          audience: recommendations.audience,
          imageAnalysis: recommendations.imageAnalysis,
          aiRecommendation: {
            audienceReason: recommendations.audienceReason,
            budgetReason: recommendations.budget.budgetReason,
            expectedReach: recommendations.budget.expectedReach,
            expectedReturn: recommendations.budget.expectedReturn,
            recommendedBudgetAoa: recommendations.budget.recommendedBudgetAoa,
          },
          creative: {
            ...withImage.creative,
            headline: recommendations.description.headline,
            body: recommendations.description.body,
            prompt: recommendations.description.prompt,
            callToAction: recommendations.description.callToAction as CampaignSetup["creative"]["callToAction"],
            suggestedMediaPath: recommendations.suggestedImagePath,
            selectedVariant: "original",
          },
        };
        setSetup(enriched);
        const savedWithRecommendations = await api.updateCampaignSetup(campaign.id, enriched);
        onUpdate(savedWithRecommendations.campaign);
        setBudget(recommendations.budget.recommendedBudgetAoa);
      } catch (err) {
      setError(err instanceof Error ? err.message : "A imagem foi carregada, mas não foi possível concluir a análise.");
      } finally {
        setAnalysing(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar a imagem.");
    } finally {
      setBusy(null);
    }
  };

  const selectImageVariant = async (variant: CampaignImageVariant) => {
    const path = variant === "suggested"
      ? setup.creative.suggestedMediaPath
      : setup.creative.originalMediaPath ?? setup.creative.mediaPath;
    if (!path || path === setup.creative.mediaPath) {
      setActiveVariant(variant);
      return;
    }
    const nextSetup: CampaignSetup = {
      ...setup,
      creative: {
        ...setup.creative,
        mediaPath: path,
        selectedVariant: variant,
      },
    };
    setActiveVariant(variant);
    setSetup(nextSetup);
    try {
      const saved = await api.updateCampaignSetup(campaign.id, nextSetup);
      onUpdate(saved.campaign);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível seleccionar esta imagem.");
    }
  };

  const saveDescriptionAndContinue = async () => {
    if (!setup.creative.mediaPath && !setup.creative.referenceImagePath) {
      setError("Adiciona uma imagem para continuar.");
      return;
    }
    if (setup.imageAnalysis?.policyStatus !== "approved") {
      setError("A imagem precisa de uma verificação concluída antes de continuar.");
      return;
    }
    await run("description", async () => {
      const saved = await api.updateCampaignSetup(campaign.id, {
        ...setup,
        destination,
        destinationUrl: destination === "product" ? destinationUrl.trim() : null,
      });
      setStep(2);
      return saved;
    });
  };

  const savePreviewAndContinue = async () => {
    if (budget < minBudget) {
      setError(`O orçamento mínimo é ${minBudget.toLocaleString("pt-AO")} Kz.`);
      return;
    }
    if (!setup.audience.locationId) {
      setError("Ainda não foi possível confirmar uma localização Meta válida para este público. Tenta novamente.");
      return;
    }
    await run("preview", async () => {
      const savedSetup = await api.updateCampaignSetup(campaign.id, {
        ...setup,
        destination,
        destinationUrl: destination === "product" ? destinationUrl.trim() : null,
      });
      const savedCampaign = await api.updateCampaignStatus(campaign.id, {
        budget,
        durationDays,
      });
      setStep(3);
      onUpdate(savedSetup.campaign);
      return savedCampaign;
    });
  };

  const currentImage = imagePath
    ? storageUrl(imagePath)
    : creativeReady && campaign.creativeJson
      ? campaign.creativeJson.mediaUrl
      : null;
  const originalImagePath = setup.creative.originalMediaPath ?? setup.creative.mediaPath;
  const originalImageSrc = originalImagePath ? storageUrl(originalImagePath) : currentImage;
  const suggestedImageSrc = setup.creative.suggestedMediaPath
    ? storageUrl(setup.creative.suggestedMediaPath)
    : null;

  return (
    <div style={{ height: "100%", minHeight: 0, overflowY: "auto", background: "#FFF", WebkitOverflowScrolling: "touch" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 5, background: "#FFF" }}>
        <div style={{ height: 60, display: "flex", alignItems: "center", gap: 10, padding: "0 18px", borderBottom: SEP }}>
          <button type="button" onClick={onExit} aria-label="Voltar às campanhas"
            style={{ width: 38, height: 38, border: 0, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: INK }}>
            <ArrowLeft size={22} />
          </button>
          <div style={{ flex: 1 }}>
            <p style={{ color: INK, fontSize: 18, fontWeight: 750 }}>Criar campanha</p>
            <p style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>A Linkealls ajuda-te a decidir</p>
          </div>
          <Sparkles size={20} style={{ color: GREEN }} />
        </div>
        <StepHeader step={step} />
      </div>

      {error && (
        <div style={{ margin: "14px 18px 0", padding: "11px 13px", borderRadius: 12, background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, lineHeight: 1.4 }}>
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} /> <span>{error}</span>
        </div>
      )}

      <div style={{ padding: "0 18px 36px" }}>
        {step === 0 && (
          <div style={{ paddingTop: 24 }}>
            <p style={{ color: GREEN, fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" }}>Objectivo</p>
            <h1 style={{ color: INK, fontSize: 27, lineHeight: 1.15, margin: "8px 0 8px", fontWeight: 800 }}>O que queres que aconteça?</h1>
            <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>Escolhe uma coisa. A Linkealls trata do resto.</p>

            <p style={{ color: INK, fontSize: 14, fontWeight: 750, marginBottom: 9 }}>Cliques</p>
            <div style={{ display: "grid", gap: 8 }}>
              {DESTINATIONS.slice(0, 2).map((item) => (
                <button key={item.value} type="button" onClick={() => chooseDestination(item.value)}
                  style={{
                    width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 13,
                    padding: "14px 14px", borderRadius: 15, background: destination === item.value ? "var(--green-light)" : "#FFF",
                    border: `1.5px solid ${destination === item.value ? "#86EFAC" : BORDER}`, color: INK,
                  }}>
                  <span style={{ width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: destination === item.value ? "var(--green-light)" : SOFT, color: destination === item.value ? "var(--green-dark)" : MUTED }}>{item.icon}</span>
                  <span style={{ flex: 1 }}>
                    <strong style={{ display: "block", fontSize: 14 }}>{item.label}</strong>
                    <span style={{ display: "block", color: MUTED, fontSize: 12, marginTop: 3 }}>{item.description}</span>
                  </span>
                  {destination === item.value && <Check size={18} style={{ color: GREEN }} />}
                </button>
              ))}
            </div>

            <p style={{ color: INK, fontSize: 14, fontWeight: 750, margin: "22px 0 9px" }}>Caminhos da Linkealls</p>
            <div style={{ display: "grid", gap: 8 }}>
              {DESTINATIONS.slice(2).map((item) => (
                <button key={item.value} type="button" onClick={() => chooseDestination(item.value)}
                  style={{
                    width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 13,
                    padding: "13px 14px", borderRadius: 15, background: destination === item.value ? "var(--green-light)" : "#FFF",
                    border: `1.5px solid ${destination === item.value ? "#86EFAC" : BORDER}`, color: INK,
                  }}>
                  <span style={{ width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: destination === item.value ? "var(--green-light)" : SOFT, color: destination === item.value ? "var(--green-dark)" : MUTED }}>{item.icon}</span>
                  <span style={{ flex: 1 }}>
                    <strong style={{ display: "block", fontSize: 14 }}>{item.label}</strong>
                    <span style={{ display: "block", color: MUTED, fontSize: 12, marginTop: 3 }}>{item.description}</span>
                  </span>
                  {destination === item.value && <Check size={18} style={{ color: GREEN }} />}
                </button>
              ))}
            </div>
            {destination === "product" && (
              <div style={{ marginTop: 12 }}>
                <label style={{ display: "block", color: INK, fontSize: 13, fontWeight: 700, marginBottom: 7 }}>
                  Link directo do produto
                </label>
                <input
                  value={destinationUrl}
                  onChange={(event) => {
                    setDestinationUrl(event.target.value);
                    setSetup((current) => ({ ...current, destinationUrl: event.target.value }));
                  }}
                  placeholder="https://…"
                  inputMode="url"
                  style={{ width: "100%", height: 46, boxSizing: "border-box", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "0 13px", fontSize: 14, color: INK, outline: "none" }}
                />
              </div>
            )}
            <div style={{ marginTop: 24 }}>
              <PrimaryButton label="Continuar" onClick={() => void goFromObjective()} loading={busy === "objective"} disabled={!destination} />
            </div>
          </div>
        )}

        {step === 1 && (
          <div style={{ paddingTop: 24 }}>
            <h1 style={{ color: INK, fontSize: 27, lineHeight: 1.15, margin: "8px 0 8px", fontWeight: 800 }}>Mostra-nos a tua imagem</h1>
            <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.5, marginBottom: 18 }}>A imagem ajuda-nos a preparar o texto, o público e o orçamento da campanha.</p>
            <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
              onChange={(event) => { void handleImage(event.target.files?.[0]); event.currentTarget.value = ""; }} />
            {currentImage ? (
              <div style={{ marginBottom: 14 }}>
                <div style={{
                  position: "relative", display: "flex", gap: 10, overflowX: "auto", scrollSnapType: "x mandatory",
                  overscrollBehaviorX: "contain", scrollbarWidth: "none", borderRadius: 18,
                }} ref={carouselRef}>
                  {([
                    { variant: "original" as const, path: setup.creative.originalMediaPath ?? setup.creative.mediaPath, label: "Imagem carregada" },
                    ...(setup.creative.suggestedMediaPath
                      ? [{ variant: "suggested" as const, path: setup.creative.suggestedMediaPath, label: "Sugestão de anúncio" }]
                      : []),
                  ]).map((slide) => (
                    <div key={slide.variant} style={{ minWidth: "100%", position: "relative", scrollSnapAlign: "start", borderRadius: 18, overflow: "hidden", background: "#F3F4F6" }}>
                      <img src={slide.variant === "suggested" ? suggestedImageSrc ?? currentImage ?? "" : originalImageSrc ?? ""} alt={slide.label} style={{ display: "block", width: "100%", aspectRatio: "1 / 1", objectFit: "cover" }} />
                      <div style={{ position: "absolute", top: 11, left: 11, padding: "6px 10px", borderRadius: 16, background: "rgba(17,24,39,.78)", color: "#FFF", fontSize: 12, fontWeight: 700 }}>
                        {slide.label}
                      </div>
                      <button type="button" onClick={() => void selectImageVariant(slide.variant)} disabled={busy !== null || analysing}
                        style={{ position: "absolute", right: 11, bottom: 11, border: 0, borderRadius: 20, background: activeVariant === slide.variant ? GREEN : "rgba(17,24,39,.86)", color: "#FFF", padding: "8px 13px", fontSize: 12, fontWeight: 700 }}>
                        {activeVariant === slide.variant ? <Check size={13} style={{ verticalAlign: "middle", marginRight: 5 }} /> : <Pencil size={13} style={{ verticalAlign: "middle", marginRight: 5 }} />}
                        {activeVariant === slide.variant ? "Seleccionada" : "Usar esta"}
                      </button>
                    </div>
                  ))}
                  {showSwipeHint && (
                    <div style={{
                      position: "absolute", top: 12, right: 12, zIndex: 2,
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "8px 11px", borderRadius: 18,
                      background: GREEN, color: "#FFF", fontSize: 12, fontWeight: 800,
                      boxShadow: "0 4px 12px rgba(22,163,74,.28)",
                      pointerEvents: "none",
                    }}>
                      <MoveHorizontal size={15} /> Desliza →
                    </div>
                  )}
                </div>
                {setup.creative.suggestedMediaPath && (
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                    color: showSwipeHint ? INK : MUTED, fontSize: 12, fontWeight: showSwipeHint ? 800 : 600,
                    marginTop: 8, transition: "color .2s ease",
                  }}>
                    <MoveHorizontal size={16} style={{ color: showSwipeHint ? GREEN : MUTED }} />
                    {showSwipeHint ? "Desliza agora para ver a imagem sugerida" : "Desliza para comparar as duas imagens"}
                  </div>
                )}
                <button type="button" onClick={() => imageInput.current?.click()} disabled={busy !== null || analysing}
                  style={{ width: "100%", height: 42, marginTop: 7, border: `1px solid ${BORDER}`, borderRadius: 21, background: "#FFF", color: INK, fontSize: 13, fontWeight: 700 }}>
                  <Pencil size={14} style={{ verticalAlign: "middle", marginRight: 5 }} /> Trocar imagem
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => imageInput.current?.click()} disabled={busy !== null}
                style={{ width: "100%", minHeight: 220, border: "2px dashed #CBD5E1", borderRadius: 18, background: SOFT, color: INK, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 9 }}>
                {busy === "upload" ? <Loader2 size={30} className="animate-spin" style={{ color: GREEN }} /> : <ImagePlus size={30} style={{ color: GREEN }} />}
                <strong style={{ fontSize: 15 }}>Adicionar imagem</strong>
                <span style={{ color: MUTED, fontSize: 13 }}>PNG, JPG ou WebP até 10 MB</span>
              </button>
            )}
            {analysing && (
              <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 14px", borderRadius: 12, background: "#F0FDF4", color: "#166534", fontSize: 13, marginBottom: 14 }}>
                <Loader2 size={16} className="animate-spin" /> A preparar a tua campanha…
              </div>
            )}
            {setup.imageAnalysis && (
              <div style={{
                padding: "13px 14px", borderRadius: 14, marginBottom: 14,
                background: setup.imageAnalysis.policyStatus === "approved" ? "#F0FDF4" : "#FFF7ED",
                border: `1px solid ${setup.imageAnalysis.policyStatus === "approved" ? "#BBF7D0" : "#FED7AA"}`,
                color: setup.imageAnalysis.policyStatus === "approved" ? "#166534" : "#9A3412",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 800 }}>
                  {setup.imageAnalysis.policyStatus === "approved" ? <Check size={16} /> : <AlertCircle size={16} />}
                  {setup.imageAnalysis.policyStatus === "approved" ? "Imagem pronta para o anúncio" : "Imagem precisa de atenção"}
                </div>
                <p style={{ fontSize: 12, lineHeight: 1.45, marginTop: 6 }}>{setup.imageAnalysis.summary}</p>
                {setup.imageAnalysis.detectedObjects.length > 0 && (
                  <p style={{ fontSize: 12, lineHeight: 1.45, marginTop: 5 }}><strong>Identificado:</strong> {setup.imageAnalysis.detectedObjects.join(", ")}</p>
                )}
                {setup.imageAnalysis.detectedText.length > 0 && (
                  <p style={{ fontSize: 12, lineHeight: 1.45, marginTop: 5 }}><strong>Texto na imagem:</strong> {setup.imageAnalysis.detectedText.join(" · ")}</p>
                )}
                {setup.imageAnalysis.policyIssues.length > 0 && (
                  <ul style={{ fontSize: 12, lineHeight: 1.45, margin: "6px 0 0 17px" }}>
                    {setup.imageAnalysis.policyIssues.map((issue) => <li key={issue}>{issue}</li>)}
                  </ul>
                )}
              </div>
            )}
            <label style={{ display: "block", color: INK, fontSize: 14, fontWeight: 750, margin: "18px 0 8px" }}>Descrição do anúncio</label>
            <input value={setup.creative.headline} maxLength={40}
              onChange={(event) => setSetup((current) => ({ ...current, creative: { ...current.creative, headline: event.target.value } }))}
              placeholder="Título sugerido" disabled={analysing}
              style={{ width: "100%", height: 46, boxSizing: "border-box", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "0 13px", fontSize: 14, color: INK, outline: "none", marginBottom: 8 }} />
            <textarea value={setup.creative.body} maxLength={300}
              onChange={(event) => setSetup((current) => ({ ...current, creative: { ...current.creative, body: event.target.value } }))}
              placeholder="Texto sugerido" rows={4} disabled={analysing}
              style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 13px", fontSize: 14, color: INK, outline: "none", resize: "vertical" }} />
            <div style={{ marginTop: 20 }}>
              <PrimaryButton label="Ver pré-visualização" onClick={() => void saveDescriptionAndContinue()} loading={busy === "description"} disabled={busy !== null || analysing || !imagePath || setup.imageAnalysis?.policyStatus !== "approved"} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ paddingTop: 24 }}>
            <p style={{ color: GREEN, fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" }}>Pré-visualização</p>
            <h1 style={{ color: INK, fontSize: 27, lineHeight: 1.15, margin: "8px 0 8px", fontWeight: 800 }}>Está tudo bem assim?</h1>
            <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.5, marginBottom: 18 }}>A campanha foi preparada para começares com uma configuração simples.</p>
            {currentImage && <img src={currentImage} alt="Pré-visualização do anúncio" style={{ display: "block", width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 18, marginBottom: 13 }} />}
            <div style={{ padding: "14px 15px", border: `1px solid ${BORDER}`, borderRadius: 15, marginBottom: 11 }}>
              <p style={{ color: INK, fontWeight: 750, fontSize: 16 }}>{setup.creative.headline || "O teu anúncio"}</p>
              <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.5, marginTop: 5 }}>{setup.creative.body || "Adiciona uma descrição para o anúncio."}</p>
              <p style={{ color: GREEN, fontSize: 12, fontWeight: 700, marginTop: 10 }}>{selectedDestination.label}</p>
            </div>
             <div style={{ padding: "14px 15px", borderRadius: 15, background: "var(--subtle)", border: `1px solid ${BORDER}`, marginBottom: 11 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                <Sparkles size={16} style={{ color: GREEN }} />
                <p style={{ color: INK, fontSize: 14, fontWeight: 750 }}>Público recomendado</p>
              </div>
              <p style={{ color: INK, fontSize: 13 }}>{setup.audience.location} · {setup.audience.ageMin}–{setup.audience.ageMax}+ anos · {setup.audience.gender === "all" ? "Todos" : setup.audience.gender === "female" ? "Mulheres" : "Homens"}</p>
              {setup.audience.interests && <p style={{ color: MUTED, fontSize: 12, lineHeight: 1.45, marginTop: 4 }}>Interesses: {setup.audience.interests}</p>}
              {aiRecommendation?.audienceReason && <p style={{ color: MUTED, fontSize: 12, lineHeight: 1.45, marginTop: 7 }}>{aiRecommendation.audienceReason}</p>}
            </div>
              <div style={{ padding: "14px 15px", borderRadius: 15, background: "var(--green-light)", border: "1px solid var(--green)", marginBottom: 11 }}>
               <p style={{ color: "var(--green-dark)", fontSize: 12, fontWeight: 750, textTransform: "uppercase", letterSpacing: ".05em" }}>Orçamento sugerido</p>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7 }}>
                <input type="number" min={minBudget} step={500} value={budget}
                  onChange={(event) => setBudget(Math.max(0, Number(event.target.value) || 0))}
                   style={{ width: 145, height: 42, border: "1px solid var(--green)", borderRadius: 10, background: "var(--surface)", padding: "0 10px", fontSize: 18, fontWeight: 800, color: INK, outline: "none" }} />
                 <span style={{ color: "var(--green-dark)", fontSize: 14, fontWeight: 700 }}>Kz</span>
              </div>
              {aiRecommendation && (
                <>
                   <p style={{ color: "var(--green-dark)", fontSize: 12, lineHeight: 1.45, marginTop: 8 }}>{aiRecommendation.budgetReason}</p>
                   <p style={{ color: "var(--green-dark)", fontSize: 12, lineHeight: 1.45, marginTop: 4 }}><strong>Alcance provável:</strong> {aiRecommendation.expectedReach}</p>
                   <p style={{ color: "var(--green-dark)", fontSize: 12, lineHeight: 1.45, marginTop: 4 }}><strong>Retorno esperado:</strong> {aiRecommendation.expectedReturn}</p>
                </>
              )}
               {budgetUsd && <p style={{ color: "var(--green)", fontSize: 12, marginTop: 7 }}>≈ ${budgetUsd} em anúncios · {durationDays} dias</p>}
            </div>
            <div style={{ marginTop: 20 }}>
              <PrimaryButton label="Continuar para pagamento" onClick={() => void savePreviewAndContinue()} loading={busy === "preview"} disabled={busy !== null || !creativeReady} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ paddingTop: 24 }}>
            <p style={{ color: GREEN, fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" }}>Pagamento</p>
            <h1 style={{ color: INK, fontSize: 27, lineHeight: 1.15, margin: "8px 0 8px", fontWeight: 800 }}>{paid ? "Campanha paga" : "Vamos lançar?"}</h1>
            <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.5, marginBottom: 18 }}>{paid ? "O pagamento foi registado. Publica quando quiseres." : "Confirma o valor e escolhe como pagar em Kwanzas."}</p>
            <div style={{ padding: "14px 15px", border: `1px solid ${BORDER}`, borderRadius: 15, marginBottom: 15 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, paddingBottom: 10, borderBottom: SEP }}>
                <span style={{ color: MUTED, fontSize: 13 }}>Objectivo</span>
                <strong style={{ color: INK, fontSize: 13, textAlign: "right" }}>{destinationLabel(destination)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: SEP }}>
                <span style={{ color: MUTED, fontSize: 13 }}>Público</span>
                <strong style={{ color: INK, fontSize: 13, textAlign: "right" }}>{setup.audience.location} · {setup.audience.ageMin}–{setup.audience.ageMax}+</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, paddingTop: 10 }}>
                <span style={{ color: MUTED, fontSize: 13 }}>Orçamento</span>
                <strong style={{ color: INK, fontSize: 14 }}>{budget.toLocaleString("pt-AO")} Kz</strong>
              </div>
            </div>
            {quote?.simulated && (
              <div style={{ padding: "11px 13px", borderRadius: 12, background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E", fontSize: 12, lineHeight: 1.45, marginBottom: 15 }}>
                Modo de teste: nenhum anúncio real será publicado nem será usado dinheiro real.
              </div>
            )}
            {!paid && !paymentPending && (
              <>
                <p style={{ color: INK, fontSize: 14, fontWeight: 750, marginBottom: 8 }}>Forma de pagamento</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                  <button type="button" onClick={() => setPaymentMethod("carteira")}
                    style={{ height: 58, borderRadius: 13, border: `1.5px solid ${paymentMethod === "carteira" ? INK : BORDER}`, background: paymentMethod === "carteira" ? INK : "#FFF", color: paymentMethod === "carteira" ? "#FFF" : MUTED, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 12, fontWeight: 700 }}>
                    <Wallet size={17} /> Carteira Linkealls
                  </button>
                  <button type="button" onClick={() => setPaymentMethod("multicaixa")}
                    style={{ height: 58, borderRadius: 13, border: `1.5px solid ${paymentMethod === "multicaixa" ? INK : BORDER}`, background: paymentMethod === "multicaixa" ? INK : "#FFF", color: paymentMethod === "multicaixa" ? "#FFF" : MUTED, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 12, fontWeight: 700 }}>
                    <Smartphone size={17} /> Multicaixa Express
                  </button>
                </div>
                {paymentMethod === "multicaixa" && (
                  <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Telemóvel 9XXXXXXXX" inputMode="tel"
                    style={{ width: "100%", height: 45, boxSizing: "border-box", border: `1px solid ${BORDER}`, borderRadius: 11, padding: "0 13px", fontSize: 14, color: INK, outline: "none", marginBottom: 10 }} />
                )}
              </>
            )}
            {paymentPending && <div style={{ padding: "13px 14px", borderRadius: 12, background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E", fontSize: 13, lineHeight: 1.45 }}>Pagamento em confirmação. Não repitas o pagamento.</div>}
            <div style={{ marginTop: 22 }}>
              {!paid && !paymentPending ? (
                <PrimaryButton label={`Pagar ${budget.toLocaleString("pt-AO")} Kz`} onClick={() => void run("pay", () => api.payCampaign(campaign.id, paymentMethod === "carteira" ? { method: "carteira" } : { method: "multicaixa", phone }))} loading={busy === "pay"} disabled={busy !== null || (paymentMethod === "multicaixa" && !/^9\d{8}$/.test(phone.replace(/\s/g, "")))} />
              ) : paid && !published ? (
                <PrimaryButton label="Publicar no Meta" onClick={() => void run("publish", () => api.publishCampaign(campaign.id))} loading={busy === "publish"} disabled={busy !== null} />
              ) : published ? (
                <div style={{ padding: "13px 14px", borderRadius: 12, background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#166534", fontSize: 13, textAlign: "center", fontWeight: 700 }}>
                  A campanha está publicada no Meta.
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { SimpleMetaAdsWizard };