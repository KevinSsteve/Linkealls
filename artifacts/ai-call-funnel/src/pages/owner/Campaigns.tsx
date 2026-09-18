import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { AlertCircle, ChevronRight, History, Loader2 } from "lucide-react";
import { businessApi, type Campaign } from "../../lib/api";
import { useBusinessSlug } from "../../hooks/useBusinessSlug";
import { OwnerNav } from "../../components/owner/OwnerNav";
import { AppHeader } from "../../components/app/AppHeader";

const STATUS: Record<Campaign["status"], { label: string; color: string; bg: string }> = {
  rascunho: { label: "Rascunho", color: "var(--ink-soft)", bg: "var(--subtle)" },
  ativa: { label: "Activa", color: "#176B55", bg: "#E8F7F1" },
  pausada: { label: "Pausada", color: "#B45309", bg: "#FFFBEB" },
  encerrada: { label: "Encerrada", color: "#6B7280", bg: "#F3F4F6" },
};

function paymentLabel(campaign: Campaign) {
  if (campaign.paymentStatus === "pago") return `Pago${campaign.paidAt ? ` em ${new Date(campaign.paidAt).toLocaleDateString("pt-AO")}` : ""}`;
  if (campaign.paymentStatus === "pendente") return "Pagamento em confirmação";
  if (campaign.paymentStatus === "falhado") return "Pagamento falhado";
  return "Não pago";
}

export function LaunchCampaigns() {
  const slug = useBusinessSlug();
  const api = useMemo(() => (slug ? businessApi(slug) : null), [slug]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);

  useEffect(() => {
    if (!api) return;
    let current = true;
    setLoading(true);
    setError(null);
    api.listCampaigns()
      .then(({ campaigns: rows }) => { if (current) setCampaigns(rows); })
      .catch(() => { if (current) setError("Não foi possível carregar o histórico de campanhas."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [api, retryAttempt]);

  if (!slug || !api) return null;

  return (
    <div className="owner-view-root">
      <header className="owner-header">
        <div className="owner-header-title">Histórico de campanhas</div>
      </header>
      <main className="owner-content-scroll px-4 py-4">
        <div className="mb-4 rounded-2xl border border-[var(--border)] bg-white px-4 py-4">
          <div className="flex items-start gap-3">
            <History size={19} className="mt-0.5 shrink-0 text-[var(--green)]" />
            <div>
              <p className="text-[14px] font-semibold text-[var(--ink)]">Apenas acompanhamento histórico</p>
              <p className="mt-1 text-[12px] leading-5 text-[var(--ink-soft)]">
                A criação, duplicação, pagamento e publicação de novas campanhas estão suspensos neste lançamento.
                Os registos e compromissos anteriores continuam visíveis.
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div role="alert" className="mb-3 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-3 text-[13px] text-[#B91C1C]">
            <div className="flex items-start gap-2">
              <AlertCircle size={15} aria-hidden="true" className="mt-0.5 shrink-0" /> {error}
            </div>
            <button
              type="button"
              onClick={() => setRetryAttempt((attempt) => attempt + 1)}
              disabled={loading}
              className="mt-2 min-h-11 rounded-lg border border-[#FECACA] bg-white px-4 font-semibold disabled:opacity-50"
            >
              Tentar novamente
            </button>
          </div>
        )}
        {loading && <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-[var(--green)]" /></div>}
        {!loading && !error && campaigns.length === 0 && (
          <div className="rounded-2xl border border-[var(--border)] bg-white px-5 py-10 text-center">
            <History size={28} className="mx-auto text-[var(--ink-faint)]" />
            <p className="mt-3 text-[14px] font-semibold text-[var(--ink)]">Sem campanhas anteriores</p>
            <p className="mt-1 text-[12px] text-[var(--ink-soft)]">Não há histórico para acompanhar.</p>
          </div>
        )}
        {!loading && campaigns.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
            {campaigns.map((campaign) => {
              const status = STATUS[campaign.status];
              const suspendedPaid = campaign.paymentStatus === "pago" && ["nao_publicada", "erro", "rejeitada"].includes(campaign.publishStatus);
              const inFlightPaid = campaign.paymentStatus === "pago" && ["a_publicar", "em_revisao"].includes(campaign.publishStatus);
              return (
                <Link key={campaign.id} href={`/e/${slug}/dono/campanhas/${campaign.id}`} className="block border-b border-[#F1F4F8] px-4 py-4 last:border-0">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-[14px] font-semibold text-[var(--ink)]">{campaign.name}</p>
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: status.color, background: status.bg }}>{status.label}</span>
                      </div>
                      <p className="mt-1 text-[12px] text-[var(--ink-soft)]">{paymentLabel(campaign)} · {campaign.budget.toLocaleString("pt-AO")} Kz</p>
                      {suspendedPaid && <p className="mt-1 text-[11px] font-medium leading-4 text-[#B45309]">Pagamento mantido. Publicação suspensa; requer revisão separada.</p>}
                      {inFlightPaid && <p className="mt-1 text-[11px] font-medium leading-4 text-[#1D4ED8]">Pagamento registado. Publicação já em processamento ou revisão.</p>}
                    </div>
                    <ChevronRight size={17} className="mt-1 shrink-0 text-[var(--ink-faint)]" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
      <OwnerNav />
    </div>
  );
}