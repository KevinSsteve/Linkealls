import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { AlertCircle, Check, Copy, ExternalLink, Loader2, Pause, RefreshCw, StopCircle } from "lucide-react";
import { businessApi, confirmSensitiveAction, type Campaign } from "../../lib/api";
import { useBusinessSlug } from "../../hooks/useBusinessSlug";
import { OwnerNav } from "../../components/owner/OwnerNav";
import { AppHeader, AppIconButton } from "../../components/app/AppHeader";

const PUBLISH_LABEL: Record<Campaign["publishStatus"], string> = {
  nao_publicada: "Não publicada",
  a_publicar: "Publicação pendente",
  em_revisao: "Em revisão",
  ativa: "Activa",
  pausada: "Pausada",
  encerrada: "Encerrada",
  rejeitada: "Rejeitada",
  erro: "Erro",
};

const PAYMENT_LABEL: Record<Campaign["paymentStatus"], string> = {
  nao_pago: "Não pago",
  pendente: "Pagamento em confirmação",
  pago: "Pago",
  falhado: "Pagamento falhado",
};

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#F1F4F8] px-4 py-3 last:border-0">
      <span className="text-[12px] text-[#8898AA]">{label}</span>
      <span className="text-right text-[13px] font-semibold text-[#0A2540]">{value}</span>
    </div>
  );
}

export function LaunchCampaignDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const slug = useBusinessSlug();
  const api = useMemo(() => (slug ? businessApi(slug) : null), [slug]);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const requestRef = useRef(0);
  const [, navigate] = useLocation();

  const load = useCallback(async (manual = false) => {
    if (!api) return;
    const request = ++requestRef.current;
    if (manual) setRefreshing(true);
    try {
      const result = await api.getCampaignById(id);
      if (request !== requestRef.current) return;
      setCampaign(result.campaign);
      setError(null);
    } catch {
      if (request !== requestRef.current) return;
      setError("Não foi possível carregar esta campanha.");
    } finally {
      if (request === requestRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [api, id]);

  useEffect(() => {
    requestRef.current += 1;
    setCampaign(null);
    setError(null);
    setLoading(true);
    void load();
    return () => { requestRef.current += 1; };
  }, [load]);
  useEffect(() => {
    if (!campaign) return;
    const watched = ["a_publicar", "em_revisao", "ativa", "pausada", "erro", "rejeitada"].includes(campaign.publishStatus)
      || campaign.paymentStatus === "pendente";
    if (!watched) return;
    const timer = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(timer);
  }, [campaign, load]);

  const control = async (action: "pause" | "end") => {
    if (!api || !campaign || busy) return;
    if (!(await confirmSensitiveAction())) return;
    if (action === "end" && !window.confirm("Encerrar este anúncio definitivamente?")) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.controlCampaignAd(campaign.id, action);
      setCampaign(result.campaign);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível actualizar o anúncio.");
    } finally {
      setBusy(false);
    }
  };

  if (!slug || !api) return null;
  if (loading) return <div className="flex h-full items-center justify-center bg-[#F6F9FC]"><Loader2 size={24} className="animate-spin text-[#635BFF]" /></div>;
  if (!campaign) return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#F6F9FC] px-5 text-center">
      <AlertCircle size={24} className="text-[#B91C1C]" />
      <p className="text-[14px] text-[#0A2540]">Campanha não encontrada</p>
      <Link href={`/e/${slug}/dono/campanhas`} className="text-[13px] font-semibold text-[#635BFF]">Voltar ao histórico</Link>
    </div>
  );

  const publicationNeedsReview = campaign.paymentStatus === "pago" && ["nao_publicada", "erro", "rejeitada"].includes(campaign.publishStatus);
  const publicationInFlight = campaign.paymentStatus === "pago" && ["a_publicar", "em_revisao"].includes(campaign.publishStatus);
  const canPause = campaign.publishStatus === "ativa";
  const canEnd = ["ativa", "pausada", "em_revisao"].includes(campaign.publishStatus);
  const trackingUrl = `${window.location.origin}${import.meta.env.BASE_URL}e/${slug}/captacao?utm_source=${campaign.platform}&utm_medium=paid&utm_campaign=${campaign.utmSlug}`;
  const kit = campaign.kitJson;

  return (
    <div className="flex h-full flex-col bg-[#F6F9FC]">
      <AppHeader
        title={campaign.name}
        subtitle="Histórico de campanha"
        onBack={() => navigate(`/e/${slug}/dono/campanhas`)}
        actions={
          <AppIconButton label="Actualizar estado" onClick={() => void load(true)} disabled={refreshing}>
            <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
          </AppIconButton>
        }
      />
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-4 rounded-2xl border border-[#E6EBF1] bg-white px-4 py-4">
          <p className="text-[14px] font-semibold text-[#0A2540]">Acompanhamento de compromisso anterior</p>
          <p className="mt-1 text-[12px] leading-5 text-[#425466]">
            Novas configurações, cobranças, conteúdos e publicações estão suspensas. Aqui podes consultar o estado e impedir novos gastos num anúncio existente.
          </p>
        </div>

        {publicationNeedsReview && (
          <div className="mb-4 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 text-[13px] leading-5 text-[#92400E]">
            <strong>Pagamento mantido:</strong> {campaign.budget.toLocaleString("pt-AO")} Kz registados
            {campaign.paidAt ? ` em ${new Date(campaign.paidAt).toLocaleDateString("pt-AO")}` : ""}.
            A publicação está suspensa e requer revisão separada antes de qualquer resolução.
          </div>
        )}
        {publicationInFlight && (
          <div className="mb-4 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 text-[13px] leading-5 text-[#1D4ED8]">
            O pagamento está registado e a publicação já estava {campaign.publishStatus === "em_revisao" ? "em revisão" : "em processamento"}.
            Este estado continua a ser acompanhado; não inicies outra publicação.
          </div>
        )}
        {campaign.paymentStatus === "pendente" && (
          <div className="mb-4 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 text-[13px] leading-5 text-[#92400E]">
            O pagamento continua em confirmação. O estado será actualizado quando a confirmação existente for recebida; não inicies outro pagamento.
          </div>
        )}
        {error && <div className="mb-4 flex gap-2 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[13px] text-[#B91C1C]"><AlertCircle size={15} className="shrink-0" />{error}</div>}

        <div className="overflow-hidden rounded-2xl border border-[#E6EBF1] bg-white">
          <DetailRow label="Plataforma" value={campaign.platform.toUpperCase()} />
          <DetailRow label="Estado da publicação" value={PUBLISH_LABEL[campaign.publishStatus]} />
          <DetailRow label="Pagamento" value={PAYMENT_LABEL[campaign.paymentStatus]} />
          {campaign.paidAt && <DetailRow label="Pago em" value={new Date(campaign.paidAt).toLocaleString("pt-AO")} />}
          <DetailRow label="Orçamento registado" value={`${campaign.budget.toLocaleString("pt-AO")} Kz`} />
          <DetailRow label="Duração" value={`${campaign.durationDays} dias`} />
          {campaign.paymentMethod && <DetailRow label="Método de pagamento" value={campaign.paymentMethod === "carteira" ? "Carteira Linkealls" : "Multicaixa Express"} />}
          <DetailRow label="Gasto sincronizado" value={`${campaign.totalSpend.toLocaleString("pt-AO")} Kz`} />
          <DetailRow label="Impressões" value={campaign.syncedImpressions.toLocaleString("pt-AO")} />
          <DetailRow label="Cliques" value={campaign.syncedClicks.toLocaleString("pt-AO")} />
          <DetailRow label="Criada em" value={new Date(campaign.createdAt).toLocaleDateString("pt-AO")} />
          {campaign.lastSyncAt && <DetailRow label="Última sincronização" value={new Date(campaign.lastSyncAt).toLocaleString("pt-AO")} />}
          {campaign.zernioAdId && <DetailRow label="Identificador externo" value={campaign.zernioAdId} />}
        </div>

        {campaign.publishError && <p className="mt-3 break-words text-[12px] leading-5 text-[#B91C1C]">{campaign.publishError}</p>}

        <section className="mt-4 rounded-2xl border border-[#E6EBF1] bg-white px-4 py-4">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-[#425466]">Link rastreado existente</p>
          <div className="mt-2 flex items-center gap-2">
            <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#635BFF]">{trackingUrl}</a>
            <button type="button" onClick={async () => { await navigator.clipboard.writeText(trackingUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }} className="app-icon-button" aria-label="Copiar link rastreado">
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
            <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="app-icon-button" aria-label="Abrir link rastreado"><ExternalLink size={16} /></a>
          </div>
        </section>

        {campaign.creativeJson && (
          <section className="mt-4 overflow-hidden rounded-2xl border border-[#E6EBF1] bg-white">
            {campaign.creativeJson.mediaType === "video" ? (
              <video src={campaign.creativeJson.mediaUrl} controls playsInline className="max-h-[360px] w-full bg-black" />
            ) : (
              <img src={campaign.creativeJson.mediaUrl} alt="Criativo guardado da campanha" className="max-h-[420px] w-full object-contain bg-[#F1F5F9]" />
            )}
            <div className="px-4 py-4">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-[#425466]">Criativo guardado</p>
              <p className="mt-2 text-[15px] font-semibold text-[#0A2540]">{campaign.creativeJson.headline}</p>
              <p className="mt-1 whitespace-pre-wrap text-[13px] leading-5 text-[#425466]">{campaign.creativeJson.body}</p>
              <a href={campaign.creativeJson.mediaUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#635BFF]">
                Abrir ficheiro guardado <ExternalLink size={13} />
              </a>
            </div>
          </section>
        )}

        {kit && (
          <section className="mt-4 rounded-2xl border border-[#E6EBF1] bg-white px-4 py-4">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[#425466]">Kit histórico guardado</p>
            <div className="mt-3 space-y-4 text-[13px] leading-5 text-[#425466]">
              <div>
                <p className="font-semibold text-[#0A2540]">Público</p>
                <p>{kit.audience.demographics}</p>
                {kit.audience.interests && <p>Interesses: {kit.audience.interests}</p>}
              </div>
              <div>
                <p className="font-semibold text-[#0A2540]">Orçamento planeado</p>
                <p>{kit.budgetAllocation.suggestion}</p>
                <p>{kit.budgetAllocation.dailyBudget} · {kit.budgetAllocation.bidStrategy}</p>
              </div>
              {kit.copies.length > 0 && (
                <div>
                  <p className="font-semibold text-[#0A2540]">Textos guardados</p>
                  <div className="mt-2 space-y-3">
                    {kit.copies.map((copy, index) => (
                      <div key={index} className="rounded-xl bg-[#F6F9FC] px-3 py-3">
                        <p className="font-semibold text-[#0A2540]">{copy.headline}</p>
                        <p className="mt-1 whitespace-pre-wrap">{copy.body}</p>
                        <p className="mt-1 text-[11px] font-semibold text-[#635BFF]">{copy.cta}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="font-semibold text-[#0A2540]">Conceito criativo</p>
                <p>{kit.creativeBrief.visualConcept}</p>
                <p className="mt-1">Formato: {kit.creativeBrief.format}</p>
              </div>
            </div>
          </section>
        )}
        {(canPause || canEnd) && (
          <div className="mt-4 flex gap-2">
            {canPause && (
              <button type="button" onClick={() => void control("pause")} disabled={busy} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] text-[13px] font-semibold text-[#92400E] disabled:opacity-50">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Pause size={14} />} Pausar anúncio
              </button>
            )}
            {canEnd && (
              <button type="button" onClick={() => void control("end")} disabled={busy} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-[#FECACA] bg-[#FEF2F2] text-[13px] font-semibold text-[#B91C1C] disabled:opacity-50">
                <StopCircle size={14} /> Encerrar anúncio
              </button>
            )}
          </div>
        )}
      </main>
      <OwnerNav />
    </div>
  );
}