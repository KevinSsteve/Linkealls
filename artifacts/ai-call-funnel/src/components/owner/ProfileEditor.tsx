import { useState, useRef, useCallback, useEffect } from "react";
import { Plus, Trash2, Save, RefreshCw, Loader2, Camera, X, Phone, Bell, BellOff, BellRing, Store, Copy, Check, ExternalLink, Link, GripVertical, Star } from "lucide-react";
import { useNotifications } from "../../hooks/useNotifications";
import { toggleCatalog, saveCatalogSlug, checkSlugAvailability } from "../../lib/api";
import type { BusinessProfile, ProfileDraft, Offering, FaqItem } from "../../lib/api";

const inputCls =
  "w-full bg-[#0D1826] border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-[#00A884]/60 transition-colors";
const labelCls = "block text-[13px] font-medium text-slate-400 mb-1.5";
const sectionCls =
  "bg-[#101B29] border border-white/[0.06] rounded-xl p-4 space-y-4";

interface Props {
  profile: BusinessProfile;
  draft: ProfileDraft | null;
  saving: boolean;
  reanalyzing: boolean;
  onSave: (fields: ProfileDraft & { websiteUrl?: string | null }) => void;
  onReanalyze: (url: string) => void;
}

/** Validate slug format client-side: 3-60 chars, only lowercase letters, digits, hyphens. */
function isValidSlugFormat(s: string) {
  return /^[a-z0-9-]{3,60}$/.test(s);
}

function CatalogSection({ profile }: { profile: BusinessProfile }) {
  const [enabled, setEnabled] = useState(profile.catalogEnabled ?? true);
  const [toggling, setToggling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [slugCopied, setSlugCopied] = useState(false);

  // Slug state
  const [slug, setSlug] = useState(profile.catalogSlug ?? "");
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid" | "saved">("idle");
  const [slugSaving, setSlugSaving] = useState(false);
  const slugDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const base = import.meta.env.BASE_URL;

  const genericUrl = `${origin}${base}catalogo`;
  const slugUrl = slug && isValidSlugFormat(slug) ? `${origin}${base}c/${slug}` : null;

  const productCount = profile.offerings?.length ?? 0;
  const isReady = profile.name?.trim().length > 0 && productCount > 0;

  // Debounced slug availability check
  useEffect(() => {
    const trimmed = slug.trim().toLowerCase();
    if (!trimmed) { setSlugStatus("idle"); return; }
    if (!isValidSlugFormat(trimmed)) { setSlugStatus("invalid"); return; }
    // Skip check if it's the same as what's already saved
    if (trimmed === (profile.catalogSlug ?? "")) { setSlugStatus("idle"); return; }

    setSlugStatus("checking");
    if (slugDebounceRef.current) clearTimeout(slugDebounceRef.current);
    slugDebounceRef.current = setTimeout(async () => {
      try {
        const res = await checkSlugAvailability(trimmed);
        setSlugStatus(res.available ? "available" : "taken");
      } catch {
        setSlugStatus("idle");
      }
    }, 500);
    return () => { if (slugDebounceRef.current) clearTimeout(slugDebounceRef.current); };
  }, [slug, profile.catalogSlug]);

  const handleToggle = async () => {
    const next = !enabled;
    setToggling(true);
    try {
      await toggleCatalog(next);
      setEnabled(next);
    } catch {
      // revert on error — state stays unchanged
    } finally {
      setToggling(false);
    }
  };

  const handleCopy = async (url: string, setFlag: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(url);
      setFlag(true);
      setTimeout(() => setFlag(false), 2000);
    } catch { /* ignore */ }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Auto-lowercase and strip invalid chars
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setSlug(val);
    setSlugStatus("idle");
  };

  const handleSaveSlug = async () => {
    const trimmed = slug.trim().toLowerCase();
    setSlugSaving(true);
    try {
      await saveCatalogSlug(trimmed || null);
      setSlugStatus("saved");
      setTimeout(() => setSlugStatus("idle"), 2500);
    } catch {
      setSlugStatus("idle");
    } finally {
      setSlugSaving(false);
    }
  };

  const canSaveSlug =
    !slugSaving &&
    (slugStatus === "available" || (slug.trim() === "" && profile.catalogSlug));

  const slugHint = (() => {
    if (slugStatus === "checking") return { text: "A verificar…", color: "#94A3B8" };
    if (slugStatus === "available") return { text: "✓ Disponível", color: "#4ADE80" };
    if (slugStatus === "taken") return { text: "✗ Já está em uso", color: "#F87171" };
    if (slugStatus === "invalid") return { text: "Usa apenas letras, números e hífens (mín. 3)", color: "#FBBF24" };
    if (slugStatus === "saved") return { text: "✓ Guardado!", color: "#4ADE80" };
    return null;
  })();

  return (
    <div className={sectionCls}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#1D4ED8" }}>
            <Store size={15} className="text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Catálogo público</h3>
            <p className="text-[12px] mt-0.5" style={{ color: enabled && isReady ? "#4ADE80" : "#94A3B8" }}>
              {!isReady
                ? "Incompleto — adiciona pelo menos 1 produto"
                : enabled
                ? `Activo · ${productCount} produto${productCount !== 1 ? "s" : ""}`
                : "Desactivado"}
            </p>
          </div>
        </div>
        <button
          onClick={handleToggle}
          disabled={toggling}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold border transition-colors disabled:opacity-50 ${
            enabled
              ? "bg-[#1D4ED8]/15 text-blue-400 border-blue-500/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-400/20"
              : "bg-white/[0.06] text-slate-400 border-white/10 hover:bg-white/10"
          }`}
        >
          {toggling ? <Loader2 size={13} className="animate-spin" /> : null}
          {enabled ? "Activo" : "Inactivo"}
        </button>
      </div>

      {/* Generic catalog URL */}
      <div>
        <p className="text-[11px] text-slate-500 mb-1.5 uppercase tracking-wide font-medium">Link genérico</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 flex items-center gap-2 bg-[#0D1826] border border-white/10 rounded-lg px-3 py-2">
            <span className="text-[12px] text-slate-400 truncate flex-1 font-mono">{genericUrl}</span>
          </div>
          <button
            onClick={() => handleCopy(genericUrl, setCopied)}
            className="shrink-0 flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[12px] font-medium transition-colors bg-white/[0.06] text-slate-300 hover:bg-white/10 border border-white/10"
            title="Copiar link genérico"
          >
            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
          </button>
          <a
            href={genericUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[12px] font-medium transition-colors bg-white/[0.06] text-slate-300 hover:bg-white/10 border border-white/10"
            title="Ver catálogo"
          >
            <ExternalLink size={14} />
          </a>
        </div>
      </div>

      {/* Vanity slug */}
      <div>
        <p className="text-[11px] text-slate-500 mb-1.5 uppercase tracking-wide font-medium">Link personalizado</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 flex items-center bg-[#0D1826] border border-white/10 rounded-lg px-3 py-2 gap-1.5 focus-within:border-[#00A884]/60 transition-colors">
            <span className="text-[12px] text-slate-500 font-mono shrink-0">{`${base}c/`}</span>
            <input
              className="flex-1 min-w-0 bg-transparent text-[12px] text-slate-200 font-mono outline-none placeholder:text-slate-600"
              placeholder="nome-do-negocio"
              value={slug}
              onChange={handleSlugChange}
              maxLength={60}
              spellCheck={false}
            />
          </div>
          <button
            onClick={handleSaveSlug}
            disabled={!canSaveSlug}
            className="shrink-0 flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[12px] font-medium transition-colors bg-white/[0.06] text-slate-300 hover:bg-white/10 border border-white/10 disabled:opacity-40"
            title="Guardar slug"
          >
            {slugSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          </button>
        </div>
        {slugHint && (
          <p className="text-[11px] mt-1.5" style={{ color: slugHint.color }}>{slugHint.text}</p>
        )}
        {/* Slug preview & copy */}
        {slugUrl && (
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 min-w-0 flex items-center gap-2 bg-[#0D1826] border border-white/[0.06] rounded-lg px-3 py-2">
              <Link size={12} className="text-[#00A884] shrink-0" />
              <span className="text-[12px] text-[#00A884] truncate flex-1 font-mono">{slugUrl}</span>
            </div>
            <button
              onClick={() => handleCopy(slugUrl, setSlugCopied)}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[12px] font-medium transition-colors bg-[#00A884]/10 text-[#00A884] hover:bg-[#00A884]/20 border border-[#00A884]/20"
              title="Copiar link personalizado"
            >
              {slugCopied ? <Check size={14} /> : <Copy size={14} />}
            </button>
            <a
              href={slugUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[12px] font-medium transition-colors bg-[#00A884]/10 text-[#00A884] hover:bg-[#00A884]/20 border border-[#00A884]/20"
              title="Abrir link personalizado"
            >
              <ExternalLink size={14} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function NotificationsSection() {
  const { status, subscribe, unsubscribe } = useNotifications();

  if (status === "unsupported") return null;

  const isLoading = status === "loading";
  const isSubscribed = status === "subscribed";
  const isDenied = status === "denied";

  return (
    <div className={sectionCls}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Notificações no telemóvel</h3>
          <p className="text-[13px] text-slate-500 mt-0.5">
            {isDenied
              ? "Bloqueaste as notificações neste browser. Activa nas definições do browser."
              : isSubscribed
              ? "Vais receber alertas quando chegar um lead qualificado e o resumo diário às 08h00."
              : "Recebe um alerta quando chegar um lead qualificado e um resumo diário às 08h00."}
          </p>
        </div>
        {!isDenied && (
          <button
            onClick={isSubscribed ? unsubscribe : subscribe}
            disabled={isLoading}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
              isSubscribed
                ? "bg-[#00A884]/10 text-[#00A884] border-[#00A884]/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-400/20"
                : "bg-white/[0.06] text-slate-300 border-white/10 hover:bg-white/10"
            }`}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isSubscribed ? (
              <><BellRing className="w-4 h-4" /> Activado</>
            ) : (
              <><Bell className="w-4 h-4" /> Activar</>
            )}
          </button>
        )}
        {isDenied && <BellOff className="w-5 h-5 text-slate-600 shrink-0 mt-0.5" />}
      </div>
    </div>
  );
}

export function ProfileEditor({ profile, draft, saving, reanalyzing, onSave, onReanalyze }: Props) {
  const init = <K extends keyof ProfileDraft>(key: K, fallback: NonNullable<ProfileDraft[K]>) =>
    (draft?.[key] ?? (profile[key as keyof BusinessProfile] as ProfileDraft[K]) ?? fallback) as NonNullable<ProfileDraft[K]>;

  const [name, setName] = useState<string>(init("name", ""));
  const [sector, setSector] = useState<string>(init("sector", ""));
  const [description, setDescription] = useState<string>(init("description", ""));
  const [targetAudience, setTargetAudience] = useState<string>(init("targetAudience", ""));
  const [toneOfVoice, setToneOfVoice] = useState<string>(init("toneOfVoice", ""));
  const [differentials, setDifferentials] = useState<string[]>(init("differentials", []));
  const [offerings, setOfferings] = useState<Offering[]>(init("offerings", []));
  const [faq, setFaq] = useState<FaqItem[]>(init("faq", []));
  const [qualificationGoals, setQualificationGoals] = useState<string[]>(init("qualificationGoals", []));
  const [siteUrl, setSiteUrl] = useState<string>(profile.websiteUrl ?? "");

  const handleSave = () => {
    onSave({
      name: name.trim(),
      sector: sector.trim(),
      description: description.trim(),
      targetAudience: targetAudience.trim(),
      toneOfVoice: toneOfVoice.trim(),
      differentials: differentials.map((d) => d.trim()).filter(Boolean),
      offerings: offerings.filter((o) => o.name.trim()),
      faq: faq.filter((f) => f.question.trim()),
      qualificationGoals: qualificationGoals.map((g) => g.trim()).filter(Boolean),
      websiteUrl: siteUrl.trim() || null,
    });
  };

  return (
    <div className="space-y-4 pb-48">
      {/* Identity */}
      <div className={sectionCls}>
        <h3 className="text-sm font-semibold text-slate-200">Identidade</h3>
        <div>
          <label className={labelCls}>Nome do negócio *</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Óptica Luanda Premium" />
        </div>
        <div>
          <label className={labelCls}>Setor</label>
          <input className={inputCls} value={sector} onChange={(e) => setSector(e.target.value)} placeholder="Ex.: Óptica e saúde visual" />
        </div>
        <div>
          <label className={labelCls}>Descrição</label>
          <textarea className={`${inputCls} min-h-[90px] resize-y`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="O que o negócio faz, para quem e onde" />
        </div>
        <div>
          <label className={labelCls}>Público-alvo</label>
          <input className={inputCls} value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} placeholder="Quem são os clientes ideais" />
        </div>
        <div>
          <label className={labelCls}>Tom de voz</label>
          <input className={inputCls} value={toneOfVoice} onChange={(e) => setToneOfVoice(e.target.value)} placeholder="Ex.: profissional e acolhedor" />
        </div>
      </div>

      {/* Offerings */}
      <OfferingsSection offerings={offerings} setOfferings={setOfferings} />

      {/* Differentials */}
      <div className={sectionCls}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Diferenciais</h3>
          <AddBtn onClick={() => setDifferentials([...differentials, ""])} />
        </div>
        {differentials.length === 0 && <EmptyHint text="O que torna o negócio único (entrega rápida, garantia, etc.)." />}
        {differentials.map((d, i) => (
          <div key={i} className="flex gap-2">
            <input className={inputCls} value={d} placeholder="Ex.: Entrega em 24h em Luanda" onChange={(e) => setDifferentials(differentials.map((x, j) => (j === i ? e.target.value : x)))} />
            <RemoveBtn inline onClick={() => setDifferentials(differentials.filter((_, j) => j !== i))} />
          </div>
        ))}
      </div>

      {/* FAQ */}
      <div className={sectionCls}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Perguntas frequentes</h3>
          <AddBtn onClick={() => setFaq([...faq, { question: "", answer: "" }])} />
        </div>
        {faq.length === 0 && <EmptyHint text="Respostas prontas que a IA usa nas chamadas." />}
        {faq.map((f, i) => (
          <div key={i} className="border border-white/[0.06] rounded-lg p-3 space-y-2 relative">
            <RemoveBtn onClick={() => setFaq(faq.filter((_, j) => j !== i))} />
            <input className={inputCls} value={f.question} placeholder="Pergunta" onChange={(e) => setFaq(faq.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))} />
            <textarea className={`${inputCls} min-h-[60px] resize-y`} value={f.answer} placeholder="Resposta" onChange={(e) => setFaq(faq.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} />
          </div>
        ))}
      </div>

      {/* Qualification goals */}
      <div className={sectionCls}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Objetivos de qualificação</h3>
          <AddBtn onClick={() => setQualificationGoals([...qualificationGoals, ""])} />
        </div>
        <EmptyHint text="O que a IA deve descobrir em cada chamada (orçamento, prazo, contacto...)." />
        {qualificationGoals.map((g, i) => (
          <div key={i} className="flex gap-2">
            <input className={inputCls} value={g} placeholder="Ex.: Orçamento disponível" onChange={(e) => setQualificationGoals(qualificationGoals.map((x, j) => (j === i ? e.target.value : x)))} />
            <RemoveBtn inline onClick={() => setQualificationGoals(qualificationGoals.filter((_, j) => j !== i))} />
          </div>
        ))}
      </div>

      {/* Public catalog */}
      <CatalogSection profile={profile} />

      {/* Push notifications */}
      <NotificationsSection />

      {/* Test call */}
      <div className={sectionCls}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Testar a chamada</h3>
            <p className="text-[13px] text-slate-500 mt-0.5">Simula o que um lead vai ouvir com o perfil actual.</p>
          </div>
          <a
            href={`${import.meta.env.BASE_URL}?test=1`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-[#00A884]/10 text-[#00A884] hover:bg-[#00A884]/20 border border-[#00A884]/20 transition-colors"
          >
            <Phone className="w-4 h-4" />
            Testar
          </a>
        </div>
      </div>

      {/* Re-analysis */}
      <div className={sectionCls}>
        <h3 className="text-sm font-semibold text-slate-200">Reanalisar o site</h3>
        <p className="text-[13px] text-slate-500">Substitui o perfil pelo resultado de uma nova análise do site.</p>
        <div className="flex gap-2">
          <input className={inputCls} value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://oteusite.co.ao" />
          <button
            onClick={() => siteUrl.trim() && onReanalyze(siteUrl.trim())}
            disabled={reanalyzing || !siteUrl.trim()}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-white/[0.06] text-slate-300 hover:bg-white/10 disabled:opacity-40 transition-colors"
          >
            {reanalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Reanalisar
          </button>
        </div>
      </div>

      {/* Sticky save bar */}
      <div className="fixed left-0 right-0 p-3 bg-gradient-to-t from-[#080E18] via-[#080E18]/95 to-transparent flex justify-center z-10" style={{ bottom: "calc(60px + env(safe-area-inset-bottom, 0px))" }}>
        <div className="w-full max-w-2xl">
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="w-full flex items-center justify-center gap-2 bg-[#00A884] hover:bg-[#02BD7E] disabled:opacity-40 text-[#06251C] font-semibold rounded-xl px-4 py-3 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "A guardar..." : "Guardar perfil"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Image upload helpers ────────────────────────────────────────────────────

async function requestUploadUrl(file: File): Promise<{ uploadURL: string; objectPath: string }> {
  const res = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "image/jpeg" }),
  });
  if (!res.ok) throw new Error("Erro ao obter URL de upload");
  return res.json() as Promise<{ uploadURL: string; objectPath: string }>;
}

async function uploadToGcs(file: File, uploadURL: string): Promise<void> {
  const res = await fetch(uploadURL, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type || "image/jpeg" },
  });
  if (!res.ok) throw new Error("Erro ao enviar imagem");
}

// ─── Offering card with image upload ─────────────────────────────────────────

function OfferingCard({
  offering, onChange, onRemove, featuredCount,
}: {
  offering: Offering;
  onChange: (o: Offering) => void;
  onRemove: () => void;
  featuredCount: number;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canFeature = offering.featured || featuredCount < 3;

  const handleImagePick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const { uploadURL, objectPath } = await requestUploadUrl(file);
      await uploadToGcs(file, uploadURL);
      // Build the serving URL: /api/storage + objectPath
      const imageUrl = `/api/storage${objectPath}`;
      onChange({ ...offering, imageUrl });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Falha no upload");
    } finally {
      setUploading(false);
      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [offering, onChange]);

  const inputCls = "w-full bg-[#0D1826] border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-[#00A884]/60 transition-colors";

  return (
    <div className="border border-white/[0.06] rounded-lg p-3 space-y-2 relative"
      style={offering.featured ? { borderColor: "rgba(250,204,21,0.35)", background: "rgba(250,204,21,0.03)" } : {}}>
      {/* Top bar: drag handle + featured toggle + remove */}
      <div className="flex items-center gap-2 mb-1">
        {/* Drag handle */}
        <div
          className="cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-400 transition-colors shrink-0"
          title="Arrastar para reordenar"
        >
          <GripVertical size={16} />
        </div>

        {/* Featured toggle */}
        <button
          onClick={() => onChange({ ...offering, featured: !offering.featured })}
          disabled={!canFeature}
          title={
            offering.featured
              ? "Remover destaque"
              : featuredCount >= 3
              ? "Máximo de 3 destaques atingido"
              : "Marcar como destaque"
          }
          className={`flex items-center gap-1 text-[12px] font-medium rounded-md px-2 py-1 transition-colors disabled:opacity-40 ${
            offering.featured
              ? "text-yellow-400 bg-yellow-400/10 border border-yellow-400/20"
              : "text-slate-500 hover:text-yellow-400 hover:bg-yellow-400/10 border border-transparent"
          }`}
        >
          <Star size={12} className={offering.featured ? "fill-yellow-400" : ""} />
          {offering.featured ? "Destaque" : "Destacar"}
        </button>

        <div className="flex-1" />
        <RemoveBtn inline onClick={onRemove} />
      </div>

      {/* Image area */}
      <div className="flex items-start gap-3">
        {/* Thumbnail or placeholder */}
        <div className="relative flex-shrink-0">
          <div
            className="w-20 h-20 rounded-xl overflow-hidden flex items-center justify-center"
            style={{ background: "#0D1826", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {offering.imageUrl ? (
              <img
                src={offering.imageUrl}
                alt={offering.name || "Produto"}
                className="w-full h-full object-cover"
              />
            ) : (
              <Camera size={22} className="text-slate-600" />
            )}
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(8,14,24,0.7)" }}>
                <Loader2 size={18} className="animate-spin text-[#00A884]" />
              </div>
            )}
          </div>

          {/* Remove image button */}
          {offering.imageUrl && !uploading && (
            <button
              onClick={() => onChange({ ...offering, imageUrl: undefined })}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: "#EF4444" }}
              aria-label="Remover imagem"
            >
              <X size={10} className="text-white" />
            </button>
          )}
        </div>

        {/* Upload button */}
        <div className="flex flex-col gap-1.5 pt-1">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 text-[12px] font-medium text-[#00A884] hover:text-[#02BD7E] disabled:opacity-50 transition-colors"
          >
            <Camera size={13} />
            {offering.imageUrl ? "Alterar foto" : "Adicionar foto"}
          </button>
          <p className="text-[11px] text-slate-600">JPG ou PNG · máx. 5 MB</p>
          {uploadError && <p className="text-[11px] text-red-400">{uploadError}</p>}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleImagePick}
        />
      </div>

      <input
        className={inputCls}
        value={offering.name}
        placeholder="Nome"
        onChange={(e) => onChange({ ...offering, name: e.target.value })}
      />
      <input
        className={inputCls}
        value={offering.price}
        placeholder="Preço (ex.: 45.000 Kz, sob consulta)"
        onChange={(e) => onChange({ ...offering, price: e.target.value })}
      />
      <textarea
        className={`${inputCls} min-h-[60px] resize-y`}
        value={offering.description}
        placeholder="Descrição curta"
        onChange={(e) => onChange({ ...offering, description: e.target.value })}
      />
    </div>
  );
}

// ─── Offerings section with drag-and-drop reordering ─────────────────────────

function OfferingsSection({
  offerings,
  setOfferings,
}: {
  offerings: Offering[];
  setOfferings: React.Dispatch<React.SetStateAction<Offering[]>>;
}) {
  const dragSrcIdx = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const featuredCount = offerings.filter((o) => o.featured).length;

  const handleAdd = () => {
    setOfferings((prev) => [
      ...prev,
      { name: "", description: "", price: "", sortOrder: prev.length },
    ]);
  };

  const handleChange = (i: number, updated: Offering) => {
    setOfferings((prev) => prev.map((x, j) => (j === i ? updated : x)));
  };

  const handleRemove = (i: number) => {
    setOfferings((prev) => prev.filter((_, j) => j !== i));
  };

  const handleDragStart = (i: number) => {
    dragSrcIdx.current = i;
  };

  const handleDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (dragSrcIdx.current === null || dragSrcIdx.current === i) return;
    setDragOverIdx(i);
  };

  const handleDrop = (i: number) => {
    const src = dragSrcIdx.current;
    if (src === null || src === i) {
      dragSrcIdx.current = null;
      setDragOverIdx(null);
      return;
    }
    setOfferings((prev) => {
      const next = [...prev];
      const [moved] = next.splice(src, 1);
      next.splice(i, 0, moved);
      return next.map((o, idx) => ({ ...o, sortOrder: idx }));
    });
    dragSrcIdx.current = null;
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    dragSrcIdx.current = null;
    setDragOverIdx(null);
  };

  return (
    <div className={sectionCls}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Produtos & serviços</h3>
        <AddBtn onClick={handleAdd} />
      </div>
      {offerings.length === 0 && (
        <EmptyHint text="Adiciona os produtos/serviços que a IA pode oferecer nas chamadas." />
      )}
      {offerings.map((o, i) => (
        <div
          key={i}
          draggable
          onDragStart={() => handleDragStart(i)}
          onDragOver={(e) => handleDragOver(e, i)}
          onDrop={() => handleDrop(i)}
          onDragEnd={handleDragEnd}
          style={{
            opacity: dragSrcIdx.current === i ? 0.4 : 1,
            outline: dragOverIdx === i ? "2px solid #00A884" : "none",
            borderRadius: 8,
            transition: "opacity 0.15s",
          }}
        >
          <OfferingCard
            offering={o}
            onChange={(updated) => handleChange(i, updated)}
            onRemove={() => handleRemove(i)}
            featuredCount={featuredCount}
          />
        </div>
      ))}
      {offerings.length > 0 && (
        <p className="text-[11px] text-slate-600 mt-1">
          Arrasta os produtos para reordenar · Até 3 destaques (⭐)
        </p>
      )}
    </div>
  );
}

function AddBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-[13px] font-medium text-[#00A884] hover:text-[#02BD7E] transition-colors">
      <Plus className="w-4 h-4" /> Adicionar
    </button>
  );
}

function RemoveBtn({ onClick, inline }: { onClick: () => void; inline?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={
        inline
          ? "shrink-0 p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-white/[0.04] transition-colors"
          : "absolute top-2 right-2 p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-white/[0.04] transition-colors"
      }
      aria-label="Remover"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-[13px] text-slate-500">{text}</p>;
}
