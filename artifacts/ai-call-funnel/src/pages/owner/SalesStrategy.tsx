import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, History, Play, Save, ShieldCheck, Target } from "lucide-react";
import { Link } from "wouter";
import { businessApi, confirmSensitiveAction, type Campaign, type SalesStrategyConfig, type SalesStrategyTemplate, type SalesStrategyVersion, type TrafficCreative } from "../../lib/api";
import { useBusinessSlug } from "../../hooks/useBusinessSlug";
import { OwnerNav } from "../../components/owner/OwnerNav";

const labels: Record<SalesStrategyTemplate, string> = {
  product_commerce: "Comércio de produtos",
  quote_service: "Serviços com orçamento",
  appointment_service: "Serviços com marcação",
  high_value: "Imóveis e vendas de alto valor",
  b2b_project: "B2B e projectos",
  consultative: "Consultivo genérico",
};
const split = (value: string) => value.split("\n").map((item) => item.trim()).filter(Boolean);
const join = (value: string[]) => value.join("\n");

export function SalesStrategy() {
  const slug = useBusinessSlug();
  const api = useMemo(() => slug ? businessApi(slug) : null, [slug]);
  const [templates, setTemplates] = useState<Array<{ id: SalesStrategyTemplate; config: SalesStrategyConfig }>>([]);
  const [versions, setVersions] = useState<SalesStrategyVersion[]>([]);
  const [draft, setDraft] = useState<SalesStrategyVersion | null>(null);
  const [name, setName] = useState("Estratégia principal");
  const [config, setConfig] = useState<SalesStrategyConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [previewInput, setPreviewInput] = useState("Quanto custa e qual opção recomenda?");
  const [preview, setPreview] = useState<{ intent: string; stage: string; action: string; strategyName: string; sourceOverrideApplied: boolean; expectedBehaviour: string } | null>(null);
  const [creatives, setCreatives] = useState<TrafficCreative[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [sourceKey, setSourceKey] = useState("");
  const [focusedOffer, setFocusedOffer] = useState("");
  const [sourceCta, setSourceCta] = useState("");

  const load = async () => {
    if (!api) return;
    const [t, v, creativeData, campaignData] = await Promise.all([
      api.getSalesStrategyTemplates(), api.listSalesStrategies(), api.listTrafficCreatives(), api.listCampaigns(),
    ]);
    setTemplates(t.templates); setVersions(v.strategies);
    setCreatives(creativeData.creatives.filter((item) => item.active === 1));
    setCampaigns(campaignData.campaigns);
    const editable = v.strategies.find((item) => item.status === "draft");
    const selected = editable ?? v.strategies.find((item) => item.status === "active");
    if (selected) { setDraft(editable ?? null); setName(selected.name); setConfig(structuredClone(selected.config)); }
    else if (t.templates[0]) setConfig(structuredClone(t.templates[0].config));
  };
  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : "Erro ao carregar")); }, [api]);

  const useTemplate = (id: SalesStrategyTemplate) => {
    const found = templates.find((item) => item.id === id);
    if (found) setConfig(structuredClone(found.config));
  };
  const setList = (field: keyof SalesStrategyConfig, value: string) => {
    if (!config) return;
    setConfig({ ...config, [field]: split(value) });
  };
  const save = async () => {
    if (!api || !config) return;
    setBusy(true); setMessage("");
    try {
      const result = draft
        ? await api.updateSalesStrategy(draft.id, name, config)
        : await api.createSalesStrategy(name, config, versions.find((item) => item.status === "active")?.id);
      setDraft(result.strategy); setMessage("Rascunho guardado."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível guardar"); }
    finally { setBusy(false); }
  };
  const activate = async (id: string) => {
    if (!api) return;
    if (!(await confirmSensitiveAction())) return;
    setBusy(true);
    try { await api.activateSalesStrategy(id); setMessage("Versão aprovada e activa."); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível activar"); }
    finally { setBusy(false); }
  };
  const approve = async (id: string) => {
    if (!api) return;
    if (!(await confirmSensitiveAction())) return;
    setBusy(true);
    try { await api.approveSalesStrategy(id); setMessage("Versão aprovada. Podes activá-la quando estiveres pronto."); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível aprovar"); }
    finally { setBusy(false); }
  };
  const simulate = async () => {
    if (!api || !config || !previewInput.trim()) return;
    const [type, id] = sourceKey.split(":") as ["campaign" | "traffic_creative", string];
    setPreview((await api.simulateSalesStrategy(config, previewInput, false, id ? { type, id } : undefined)).result);
  };
  const saveOverride = async () => {
    if (!api || !sourceKey || !config) return;
    const [sourceType, sourceId] = sourceKey.split(":") as ["campaign" | "traffic_creative", string];
    const active = versions.find((item) => item.status === "active");
    if (!sourceId || !active) { setMessage("Activa primeiro uma estratégia principal."); return; }
    if (!(await confirmSensitiveAction())) return;
    setBusy(true);
    try {
      await api.saveSalesStrategyOverride({
        sourceType, sourceId, strategyVersionId: active.id,
        config: { focusedOffer: focusedOffer || undefined, objective: config.objective, cta: sourceCta || undefined },
      });
      setMessage("Variação aprovada para esta origem.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível guardar a variação"); }
    finally { setBusy(false); }
  };
  if (!slug || !api || !config) return <div className="app-page flex items-center justify-center">A carregar estratégia…</div>;

  const field = (label: string, value: string, onChange: (value: string) => void, hint?: string) => (
    <label className="block">
      <span className="block text-sm font-semibold text-[var(--ink)] mb-1.5">{label}</span>
      {hint && <span className="block text-xs text-[var(--ink-soft)] mb-2">{hint}</span>}
      <textarea value={value} onChange={(event) => onChange(event.target.value)}
        className="w-full min-h-24 rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--green)]" />
    </label>
  );

  return (
    <div className="app-page flex h-full min-h-0 flex-col bg-[var(--app-bg)]">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--border)] bg-white px-4 py-3">
        <Link href={`/e/${slug}/dono`}><ArrowLeft size={20} /></Link>
        <div className="flex-1"><h1 className="font-bold text-[var(--ink)]">Estratégia de vendas</h1><p className="text-xs text-[var(--ink-soft)]">Regras comerciais aprovadas, executadas no chat</p></div>
        <ShieldCheck size={22} className="text-[var(--green)]" />
      </header>
      <main className="page-scroll-container mx-auto w-full max-w-3xl flex-1 space-y-4 p-4 pb-28">
        <section className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <div className="mb-3 flex items-center gap-2"><Target size={18} className="text-[var(--green)]" /><h2 className="font-bold">Escolhe um ponto de partida</h2></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {templates.map((item) => <button key={item.id} onClick={() => useTemplate(item.id)}
              className={`rounded-xl border p-3 text-left text-sm font-medium transition ${config.template === item.id ? "border-[var(--green)] bg-[var(--green-light)] text-[var(--green-dark)]" : "border-[var(--border)] bg-white"}`}>
              {labels[item.id]}
            </button>)}
          </div>
          <p className="mt-3 text-xs text-[var(--ink-soft)]">O modelo orienta o atendimento, mas não é inferido rigidamente pelo sector.</p>
        </section>

        <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-white p-4">
          <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Nome da estratégia"
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 font-semibold outline-none focus:border-[var(--green)]" />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="mb-1.5 block text-sm font-semibold">Objectivo</span>
              <select value={config.objective} onChange={(event) => setConfig({ ...config, objective: event.target.value as SalesStrategyConfig["objective"] })}
                className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm">
                <option value="purchase">Compra</option><option value="quote">Orçamento</option><option value="appointment_request">Pedido de marcação</option><option value="visit_request">Pedido de visita</option><option value="contact">Contacto</option>
              </select>
            </label>
            <label className="block"><span className="mb-1.5 block text-sm font-semibold">Público</span>
              <input value={config.audience} onChange={(event) => setConfig({ ...config, audience: event.target.value })}
                className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm" />
            </label>
          </div>
          {field("Ofertas prioritárias", join(config.priorityOffers), (v) => setList("priorityOffers", v), "Uma por linha. Só serão usadas ofertas existentes no catálogo.")}
          {field("Perguntas essenciais", join(config.essentialQuestions), (v) => setList("essentialQuestions", v), "Uma por linha; o assistente fará no máximo uma por turno.")}
          {field("Diferenciais comprovados", join(config.verifiedDifferentials), (v) => setList("verifiedDifferentials", v))}
          {field("Respostas a objecções", config.objectionResponses.map((item) => `${item.objection} | ${item.response}`).join("\n"), (v) => setConfig({ ...config, objectionResponses: split(v).map((line) => { const [objection, ...rest] = line.split("|"); return { objection: objection?.trim() ?? "", response: rest.join("|").trim() }; }).filter((item) => item.objection && item.response) }), "Formato: objecção | resposta factual")}
          {field("Limites de negociação", join(config.negotiationLimits), (v) => setList("negotiationLimits", v))}
          {field("Quando chamar o dono", join(config.escalationRules), (v) => setList("escalationRules", v))}
          {field("Condições de passagem de etapa", join(config.stageConditions), (v) => setList("stageConditions", v))}
          {message && <p role="status" className="rounded-xl bg-[var(--subtle)] px-3 py-2 text-sm">{message}</p>}
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => void save()} className="flex items-center gap-2 rounded-xl bg-[var(--green)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Save size={16} /> Guardar rascunho</button>
            {draft && <button disabled={busy} onClick={() => void approve(draft.id)} className="flex items-center gap-2 rounded-xl border border-[var(--green)] px-4 py-2.5 text-sm font-semibold text-[var(--green-dark)]"><CheckCircle2 size={16} /> Aprovar versão</button>}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <h2 className="font-bold">Campanhas e links de tráfego</h2>
          <p className="mt-1 text-xs text-[var(--ink-soft)]">Por defeito, cada origem herda a estratégia activa. Uma variação só entra em vigor depois de aprovação.</p>
          <select value={sourceKey} onChange={(event) => setSourceKey(event.target.value)} className="mt-3 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm">
            <option value="">Escolher origem</option>
            {creatives.map((item) => <option key={item.id} value={`traffic_creative:${item.id}`}>Link: {item.description.slice(0, 70)}</option>)}
            {campaigns.map((item) => <option key={item.id} value={`campaign:${item.id}`}>Campanha: {item.name}</option>)}
          </select>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">Oferta focada<input value={focusedOffer} onChange={(event) => setFocusedOffer(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--border)] px-3 py-2.5 font-normal" /></label>
            <label className="text-sm font-semibold">CTA aprovado<input value={sourceCta} onChange={(event) => setSourceCta(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--border)] px-3 py-2.5 font-normal" /></label>
          </div>
          <button disabled={!sourceKey || busy} onClick={() => void saveOverride()} className="mt-3 rounded-xl border border-[var(--green)] px-4 py-2.5 text-sm font-semibold text-[var(--green-dark)] disabled:opacity-40">Aprovar variação</button>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <div className="mb-3 flex items-center gap-2"><Play size={18} /><h2 className="font-bold">Simulador isolado</h2></div>
          <p className="mb-3 text-xs text-[var(--ink-soft)]">Não cria lead, mensagem, cobrança nem notificação.</p>
          <textarea value={previewInput} onChange={(event) => setPreviewInput(event.target.value)} className="w-full rounded-xl border border-[var(--border)] p-3 text-sm" />
          <button onClick={() => void simulate()} className="mt-2 rounded-xl bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-white">Simular próxima acção</button>
          {preview && <div className="mt-3 rounded-xl bg-[var(--subtle)] p-3 text-sm">
            <p><b>Versão:</b> {preview.strategyName}{preview.sourceOverrideApplied ? " · variação aprovada aplicada" : ""}</p>
            <p><b>Intenção:</b> {preview.intent} · <b>Etapa:</b> {preview.stage} · <b>Acção:</b> {preview.action}</p>
            <p className="mt-1 text-xs text-[var(--ink-soft)]">{preview.expectedBehaviour}</p>
          </div>}
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <div className="mb-3 flex items-center gap-2"><History size={18} /><h2 className="font-bold">Histórico de versões</h2></div>
          <div className="divide-y divide-[var(--border)]">
            {versions.map((version) => <div key={version.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{version.name}</p><p className="text-xs text-[var(--ink-soft)]">v{version.version} · {version.status} {version.gaps.length ? `· ${version.gaps.join(", ")}` : "· sem lacunas essenciais"}</p></div>
              {version.status === "approved" && <button onClick={() => void activate(version.id)} className="rounded-lg border border-[var(--green)] px-3 py-1.5 text-xs font-semibold text-[var(--green-dark)]">Activar</button>}
              {version.status === "archived" && <button onClick={() => void activate(version.id)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold">Restaurar</button>}
            </div>)}
          </div>
        </section>
      </main>
      <OwnerNav />
    </div>
  );
}