import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  Globe, Sparkles, Loader2, AlertCircle, CheckCircle2,
  Zap, Grid3x3, Megaphone, Users, ChevronRight, X, Store,
  MessageSquare, Phone, RefreshCw, Edit2, Share2, MoreHorizontal,
  MapPin, Clock, Mail, Star, Image,
} from "lucide-react";
import { OwnerNav } from "../components/owner/OwnerNav";
import {
  businessApi,
  type BusinessProfile,
  type ProfileDraft,
  type Offering,
} from "../lib/api";
import { useBusinessSlug } from "../hooks/useBusinessSlug";
import { ProfileEditor } from "../components/owner/ProfileEditor";
import { WaSkeletonList } from "../components/wa/WaSkeletonList";
import { C } from "../theme";

type View = "loading" | "start" | "analyzing" | "editor";

const POLL_MS = 2500;

// ─── Avatar palette (deterministic from name) ─────────────────────────────────
const PALETTES = [
  { bg: "#DFF2E0", text: "#1B7A3E" },
  { bg: "#D9F0FD", text: "#0369A1" },
  { bg: "#FEE2E2", text: "#991B1B" },
  { bg: "#FEF3C7", text: "#92400E" },
  { bg: "#EDE9FE", text: "#5B21B6" },
  { bg: "#FCE7F3", text: "#9D174D" },
  { bg: "#ECFDF5", text: "#065F46" },
  { bg: "#FFF7ED", text: "#9A3412" },
];
function avatarPalette(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return PALETTES[Math.abs(h) % PALETTES.length]!;
}

// ─── Section header — WA Business "Ferramentas" uppercase label ───────────────
function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-4 pt-5 pb-1.5">
      <p className="text-[11px] font-bold tracking-wider uppercase" style={{ color: C.text3 }}>
        {label}
      </p>
    </div>
  );
}

// ─── Tool row — navigation link ───────────────────────────────────────────────
function ToolRow({ icon: Icon, title, description, href, border = true }: {
  icon: React.ElementType; title: string; description: string; href: string; border?: boolean;
}) {
  return (
    <Link href={href}>
      <div
        className="flex items-center gap-4 px-4 py-3.5 cursor-pointer active:bg-[#F5F6F6] transition-colors"
        style={{ background: C.white, borderBottom: border ? `1px solid ${C.border}` : "none" }}
      >
        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: C.inputBg }}>
          <Icon size={18} style={{ color: "#3B4A54" }} strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold leading-tight" style={{ color: C.text }}>{title}</p>
          <p className="text-[13px] mt-0.5 leading-snug" style={{ color: C.text2 }}>{description}</p>
        </div>
        <ChevronRight size={16} style={{ color: C.text3 }} className="shrink-0" />
      </div>
    </Link>
  );
}

// ─── Action row — button (no navigation) ─────────────────────────────────────
function ActionRow({ icon: Icon, title, description, onClick, loading = false, border = true }: {
  icon: React.ElementType; title: string; description: string;
  onClick: () => void; loading?: boolean; border?: boolean;
}) {
  return (
    <button
      onClick={onClick} disabled={loading}
      className="w-full flex items-center gap-4 px-4 py-3.5 cursor-pointer active:bg-[#F5F6F6] transition-colors text-left disabled:opacity-50"
      style={{ background: C.white, borderBottom: border ? `1px solid ${C.border}` : "none" }}
    >
      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: C.inputBg }}>
        {loading ? <Loader2 size={18} style={{ color: "#3B4A54" }} className="animate-spin" />
          : <Icon size={18} style={{ color: "#3B4A54" }} strokeWidth={1.8} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-semibold leading-tight" style={{ color: C.text }}>{title}</p>
        <p className="text-[13px] mt-0.5 leading-snug" style={{ color: C.text2 }}>{description}</p>
      </div>
      <ChevronRight size={16} style={{ color: C.text3 }} className="shrink-0" />
    </button>
  );
}

// ─── Section group wrapper ────────────────────────────────────────────────────
function SectionGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-4 rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
      {children}
    </div>
  );
}

// ─── Info row (profile view) ──────────────────────────────────────────────────
function InfoRow({
  icon: Icon, label, value, placeholder, last = false,
}: {
  icon: React.ElementType; label: string; value?: string | null;
  placeholder: string; last?: boolean;
}) {
  const isEmpty = !value?.trim();
  return (
    <div
      className="flex items-start gap-4 px-4 py-3.5"
      style={{
        background: C.white,
        borderBottom: last ? "none" : `1px solid ${C.border}`,
      }}
    >
      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: C.inputBg }}>
        <Icon size={17} style={{ color: isEmpty ? C.text3 : "#3B4A54" }} strokeWidth={1.8} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold tracking-wide uppercase mb-0.5" style={{ color: C.text3 }}>{label}</p>
        <p className="text-[14px] leading-relaxed whitespace-pre-wrap"
          style={{ color: isEmpty ? C.text3 : C.text }}>
          {isEmpty ? placeholder : value}
        </p>
      </div>
    </div>
  );
}

// ─── Destaques tile ───────────────────────────────────────────────────────────
function DestaqueTile({ offering }: { offering: Offering }) {
  const pal = avatarPalette(offering.name);
  return (
    <div className="flex flex-col items-center gap-1.5 w-20 shrink-0">
      <div className="w-16 h-16 rounded-xl overflow-hidden flex items-center justify-center"
        style={{ background: offering.imageUrl ? "transparent" : pal.bg }}>
        {offering.imageUrl
          ? <img src={offering.imageUrl} alt={offering.name} className="w-full h-full object-cover" />
          : <span className="text-[22px] font-bold" style={{ color: pal.text }}>
              {offering.name[0]?.toUpperCase() ?? "·"}
            </span>
        }
      </div>
      <p className="text-[11px] text-center leading-tight line-clamp-2" style={{ color: C.text2 }}>
        {offering.name}
      </p>
    </div>
  );
}

// ─── Catalog product row ──────────────────────────────────────────────────────
function CatalogRow({ offering, last = false }: { offering: Offering; last?: boolean }) {
  const pal = avatarPalette(offering.name);
  return (
    <div className="flex items-center gap-3 px-4 py-3"
      style={{ borderBottom: last ? "none" : `1px solid ${C.border}`, background: C.white }}>
      <div className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center shrink-0"
        style={{ background: offering.imageUrl ? "transparent" : pal.bg }}>
        {offering.imageUrl
          ? <img src={offering.imageUrl} alt={offering.name} className="w-full h-full object-cover" />
          : <Image size={18} style={{ color: pal.text }} />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold leading-tight truncate" style={{ color: C.text }}>{offering.name}</p>
        {offering.price && (
          <p className="text-[13px] mt-0.5 font-medium" style={{ color: C.green }}>{offering.price}</p>
        )}
      </div>
    </div>
  );
}

// ─── WA Business Profile View ─────────────────────────────────────────────────
function ProfileView({
  profile, slug, onEdit, onReanalyze, reanalyzing,
}: {
  profile: BusinessProfile;
  slug: string;
  onEdit: () => void;
  onReanalyze: (url: string) => void;
  reanalyzing: boolean;
}) {
  const pal = avatarPalette(profile.name || "N");
  const initials = profile.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "N";
  const isActive = profile.catalogEnabled && profile.offerings.length > 0;
  const featured = profile.offerings.filter((o) => o.featured);
  const previewOfferings = profile.offerings.slice(0, 3);
  const catalogUrl = `${typeof window !== "undefined" ? window.location.origin : ""}${import.meta.env.BASE_URL}e/${slug}/catalogo`;

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: profile.name, url: catalogUrl });
        return;
      } catch { /* user dismissed */ }
    }
    try {
      await navigator.clipboard.writeText(catalogUrl);
    } catch { /* ignore */ }
  };

  return (
    <div>
      {/* ── Profile card ───────────────────────────────────────────────── */}
      <div className="mx-4 rounded-2xl overflow-hidden mb-1" style={{ border: `1px solid ${C.border}`, background: C.white }}>
        {/* Avatar + name + badge */}
        <div className="flex items-center gap-4 px-4 pt-5 pb-4">
          {/* Avatar */}
          <div
            className="w-[72px] h-[72px] rounded-full flex items-center justify-center shrink-0 text-[28px] font-bold"
            style={{ background: pal.bg, color: pal.text }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[18px] font-bold leading-tight" style={{ color: C.text }}>{profile.name}</h2>
            {profile.sector && (
              <p className="text-[13px] mt-0.5 leading-snug line-clamp-1" style={{ color: C.text2 }}>{profile.sector}</p>
            )}
            <span
              className="inline-flex items-center gap-1 mt-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
              style={isActive
                ? { background: "#D9FDD3", color: "#128C7E" }
                : { background: "#F0F2F5", color: "#8696A0" }}
            >
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: isActive ? "#128C7E" : "#8696A0" }} />
              {isActive ? "Ativo" : "Inativo"}
            </span>
          </div>
        </div>

        {/* 4 action buttons */}
        <div className="grid grid-cols-4 gap-0 px-2 pb-4" style={{ borderTop: `1px solid ${C.border}` }}>
          {[
            { icon: Edit2, label: "Editar", action: onEdit },
            { icon: Grid3x3, label: "Catálogo", href: `/e/${slug}/catalogo` },
            { icon: Share2, label: "Partilhar", action: handleShare },
            { icon: MoreHorizontal, label: "Mais", href: `/e/${slug}/dono/assistente` },
          ].map(({ icon: Icon, label, action, href }) => {
            const inner = (
              <div className="flex flex-col items-center gap-1.5 pt-3 pb-1 px-1">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: C.inputBg }}>
                  <Icon size={18} style={{ color: "#3B4A54" }} strokeWidth={1.8} />
                </div>
                <span className="text-[11px] font-medium" style={{ color: C.text2 }}>{label}</span>
              </div>
            );
            return href ? (
              <Link key={label} href={href}>{inner}</Link>
            ) : (
              <button key={label} onClick={action} className="w-full">{inner}</button>
            );
          })}
        </div>
      </div>

      {/* ── Info rows ──────────────────────────────────────────────────── */}
      <div className="mx-4 rounded-2xl overflow-hidden mb-3" style={{ border: `1px solid ${C.border}` }}>
        <InfoRow icon={Sparkles} label="Descrição" value={profile.description} placeholder="Adicionar descrição…" />
        <InfoRow icon={MapPin} label="Endereço" value={profile.address} placeholder="Adicionar endereço…" />
        <InfoRow icon={Clock} label="Horário" value={profile.hours} placeholder="Adicionar horário…" />
        <InfoRow icon={Phone} label="Contacto" value={profile.phone} placeholder="Adicionar telemóvel…" />
        <InfoRow icon={Mail} label="E-mail" value={profile.email} placeholder="Adicionar e-mail…" />
        <InfoRow icon={Globe} label="Website" value={profile.websiteUrl} placeholder="Adicionar website…" last />
      </div>

      {/* ── Destaques ──────────────────────────────────────────────────── */}
      {featured.length > 0 && (
        <>
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <p className="text-[13px] font-bold" style={{ color: C.text }}>Destaques</p>
            <button
              onClick={onEdit}
              className="text-[13px] font-semibold"
              style={{ color: C.green }}
            >
              Gerir
            </button>
          </div>
          <div className="mx-4 rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.border}`, background: C.white }}>
            <div className="flex gap-4 px-4 py-4 overflow-x-auto scrollbar-none">
              {featured.map((o, i) => <DestaqueTile key={i} offering={o} />)}
            </div>
          </div>
        </>
      )}

      {/* ── Catálogo preview ───────────────────────────────────────────── */}
      {previewOfferings.length > 0 && (
        <>
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <p className="text-[13px] font-bold" style={{ color: C.text }}>Catálogo</p>
            <Link href={`/e/${slug}/catalogo`}>
              <span className="text-[13px] font-semibold" style={{ color: C.green }}>Ver tudo</span>
            </Link>
          </div>
          <div className="mx-4 rounded-2xl overflow-hidden mb-3" style={{ border: `1px solid ${C.border}` }}>
            {previewOfferings.map((o, i) => (
              <CatalogRow key={i} offering={o} last={i === previewOfferings.length - 1} />
            ))}
            <Link href={`/e/${slug}/catalogo`}>
              <div className="flex items-center justify-center gap-1.5 py-3 px-4"
                style={{ borderTop: `1px solid ${C.border}`, background: C.white }}>
                <span className="text-[13px] font-semibold" style={{ color: C.green }}>
                  Ver catálogo completo →
                </span>
              </div>
            </Link>
          </div>
        </>
      )}

      {/* ── Ferramentas — O teu negócio ────────────────────────────────── */}
      <SectionHeader label="O teu negócio" />
      <SectionGroup>
        <ToolRow icon={Grid3x3} title="Catálogo" description="Exibe os teus produtos e serviços" href={`/e/${slug}/catalogo`} />
        <ToolRow icon={Zap} title="Assistente IA" description="Responde aos clientes 24 h por dia, 7 dias por semana" href={`/e/${slug}/dono/assistente`} />
        <ToolRow icon={Megaphone} title="Campanhas" description="Cria anúncios para trazer mais clientes" href={`/e/${slug}/dono/campanhas`} border={false} />
      </SectionGroup>

      {/* ── Leads & conversas ──────────────────────────────────────────── */}
      <SectionHeader label="Leads & conversas" />
      <SectionGroup>
        <ToolRow icon={Users} title="Leads" description="Gere todos os contactos qualificados" href={`/e/${slug}/dono/leads`} />
        <ToolRow icon={MessageSquare} title="Conversas" description="Historial de conversas com os clientes" href={`/e/${slug}/dono/conversas`} border={false} />
      </SectionGroup>

      {/* ── Configura ──────────────────────────────────────────────────── */}
      <SectionHeader label="Configura" />
      <SectionGroup>
        <ToolRow icon={Phone} title="Testar chamada" description="Fala com o teu assistente IA como um cliente" href={`/e/${slug}`} />
        {profile.websiteUrl && (
          <ActionRow
            icon={RefreshCw}
            title="Reanalisar site"
            description="Actualiza o perfil com as últimas informações do site"
            onClick={() => onReanalyze(profile.websiteUrl ?? "")}
            loading={reanalyzing}
            border={false}
          />
        )}
      </SectionGroup>

      <div className="h-6" />
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function Owner() {
  const slug = useBusinessSlug();
  const api = useMemo(() => (slug ? businessApi(slug) : null), [slug]);

  const [view, setView] = useState<View>("loading");
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const [mode, setMode] = useState<"site" | "manual">("site");
  const [url, setUrl] = useState("");
  const [descriptionText, setDescriptionText] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [promoVisible, setPromoVisible] = useState(true);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const load = useCallback(async () => {
    if (!api) return;
    try {
      const { profile: p, filled } = await api.getProfile();
      setProfile(p);
      setUrl(p.websiteUrl ?? "");
      if (p.analysisStatus === "running") setView("analyzing");
      else if (filled) setView("editor");
      else {
        if (p.analysisStatus === "error" && p.analysisError) setError(p.analysisError);
        setView("start");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
      setView("start");
    }
  }, [api]);

  useEffect(() => { void load(); return stopPolling; }, [load, stopPolling]);

  useEffect(() => {
    if (view !== "analyzing" || !api) { stopPolling(); return; }
    pollRef.current = setInterval(async () => {
      try {
        const { profile: p, filled } = await api.getProfile();
        setProfile(p);
        if (p.analysisStatus === "done" && filled) {
          stopPolling(); setDraft(null); setEditorKey((k) => k + 1);
          setNotice("Análise concluída! Revê o perfil e guarda."); setView("editor");
          setEditing(true); // go straight to editor after analysis
        } else if (p.analysisStatus === "done" && !filled) {
          stopPolling();
          setError("A análise terminou mas não consegui identificar o negócio. Tenta outro endereço ou preenche manualmente.");
          setView("start");
        } else if (p.analysisStatus === "error") {
          stopPolling();
          setError(p.analysisError ?? "A análise falhou. Tenta de novo.");
          setView(p.name.trim().length > 0 ? "editor" : "start");
        }
      } catch { /* transient */ }
    }, POLL_MS);
    return stopPolling;
  }, [view, stopPolling, api]);

  const handleAnalyze = async () => {
    if (!url.trim() || !api) return;
    setBusy(true); setError(null);
    try { await api.startAnalysis(url.trim()); setView("analyzing"); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível iniciar a análise"); }
    finally { setBusy(false); }
  };

  const handleAssist = async () => {
    if (descriptionText.trim().length < 20) {
      setError("Descreve o negócio com um pouco mais de detalhe (mínimo 20 caracteres)."); return;
    }
    if (!api) return;
    setBusy(true); setError(null);
    try {
      const { draft: d } = await api.assistFromDescription(descriptionText.trim());
      setDraft(d); setEditorKey((k) => k + 1);
      setNotice("A IA estruturou o teu negócio. Revê os campos e guarda."); setView("editor");
      setEditing(true);
    } catch (err) { setError(err instanceof Error ? err.message : "A IA não conseguiu estruturar a descrição"); }
    finally { setBusy(false); }
  };

  const handleSave = async (fields: ProfileDraft & { websiteUrl?: string | null }) => {
    if (!api) return;
    setSaving(true); setError(null);
    try {
      const { profile: p } = await api.saveProfile(fields);
      setProfile(p); setDraft(null);
      setNotice("Perfil guardado ✅");
      setEditing(false); // return to profile view after saving
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível guardar"); }
    finally { setSaving(false); }
  };

  const handleReanalyze = async (u: string) => {
    if (!api) return;
    setReanalyzing(true); setError(null); setNotice(null);
    try { await api.startAnalysis(u); setView("analyzing"); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível iniciar a análise"); }
    finally { setReanalyzing(false); }
  };

  if (!slug) {
    return (
      <div className="h-full flex items-center justify-center text-sm" style={{ color: C.text2, background: C.bg }}>
        Negócio não encontrado.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col wa-page" style={{ background: C.bg }}>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <header
        className="shrink-0 flex items-center justify-between px-4 pt-6 pb-3"
        style={{ background: C.white }}
      >
        <h1 className="text-[20px] font-bold tracking-tight" style={{ color: "#0B141A" }}>
          {editing ? "Editar perfil" : "Perfil do negócio"}
        </h1>
        <div className="flex items-center gap-3" style={{ color: C.text2 }}>
          {!editing && (
            <Link href={`/e/${slug}`} title="Ver página pública">
              <Store size={20} strokeWidth={1.8} style={{ color: C.text2 }} />
            </Link>
          )}
        </div>
      </header>

      {/* ── Alerts ─────────────────────────────────────────────────────── */}
      {(error || notice) && (
        <div className="shrink-0 px-4 pt-3">
          {error && (
            <div className="flex items-start gap-2 text-[13px] rounded-xl px-3.5 py-2.5"
              style={{ background: "#FFF0F0", border: "1px solid #FFCDD2", color: "#C62828" }}>
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-auto shrink-0"><X size={14} /></button>
            </div>
          )}
          {notice && !error && (
            <div className="flex items-start gap-2 text-[13px] rounded-xl px-3.5 py-2.5"
              style={{ background: "#F0FFF8", border: "1px solid #C3E6D5", color: "#1B7A55" }}>
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{notice}</span>
              <button onClick={() => setNotice(null)} className="ml-auto shrink-0"><X size={14} /></button>
            </div>
          )}
        </div>
      )}

      <main className="flex-1 overflow-y-auto">

        {/* ── Loading ─────────────────────────────────────────────────── */}
        {view === "loading" && (
          <div className="pt-4">
            <WaSkeletonList count={4} showAvatar={false} />
          </div>
        )}

        {/* ── Start: setup form ───────────────────────────────────────── */}
        {view === "start" && (
          <>
            {promoVisible && (
              <>
                <SectionHeader label="Para você" />
                <div className="mx-4">
                  <div className="rounded-2xl p-4 flex gap-3 relative" style={{ background: C.white, border: `1px solid ${C.border}` }}>
                    <button onClick={() => setPromoVisible(false)} className="absolute top-3 right-3" style={{ color: C.text3 }}>
                      <X size={16} />
                    </button>
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#E8F5E9" }}>
                      <Sparkles size={22} style={{ color: C.green }} />
                    </div>
                    <div className="flex-1 min-w-0 pr-4">
                      <p className="font-semibold text-[14px] leading-snug" style={{ color: C.text }}>Configura o teu assistente IA</p>
                      <p className="text-[12px] mt-1 leading-relaxed" style={{ color: C.text2 }}>
                        Ensina a IA sobre o teu negócio para atender clientes automaticamente, 24h por dia.
                      </p>
                      <button
                        onClick={() => { setPromoVisible(false); setTimeout(() => { document.querySelector<HTMLInputElement>("input[inputmode='url'], textarea")?.focus(); }, 100); }}
                        className="mt-3 px-4 py-1.5 rounded-full text-[13px] font-semibold"
                        style={{ background: C.text, color: "#FFFFFF" }}
                      >
                        Começar agora
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            <SectionHeader label="Configurar negócio" />
            <div className="mx-4 rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.border}`, background: C.white }}>
              <div className="flex" style={{ borderBottom: `1px solid ${C.border}` }}>
                <button
                  onClick={() => setMode("site")}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 text-[14px] font-medium transition-colors"
                  style={{ color: mode === "site" ? C.green : C.text2, borderBottom: mode === "site" ? `2px solid ${C.green}` : "2px solid transparent" }}
                >
                  <Globe className="w-4 h-4" /> Tenho site
                </button>
                <button
                  onClick={() => setMode("manual")}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 text-[14px] font-medium transition-colors"
                  style={{ color: mode === "manual" ? C.green : C.text2, borderBottom: mode === "manual" ? `2px solid ${C.green}` : "2px solid transparent" }}
                >
                  <Sparkles className="w-4 h-4" /> Sem site
                </button>
              </div>
              <div className="p-4 space-y-3">
                {mode === "site" ? (
                  <>
                    <input
                      className="w-full rounded-xl px-4 py-3 text-[15px] outline-none transition-colors"
                      style={{ background: C.inputBg, border: `1px solid ${C.border}`, color: C.text }}
                      value={url} onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                      placeholder="https://oteusite.co.ao" inputMode="url" autoCapitalize="none"
                    />
                    <button
                      onClick={handleAnalyze} disabled={busy || !url.trim()}
                      className="w-full flex items-center justify-center gap-2 rounded-full py-3 text-[14px] font-semibold transition-opacity"
                      style={{ background: C.green, color: "#fff", opacity: busy || !url.trim() ? 0.5 : 1 }}
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                      Analisar o meu site
                    </button>
                  </>
                ) : (
                  <>
                    <textarea
                      className="w-full rounded-xl px-4 py-3 text-[15px] outline-none resize-y min-h-[120px]"
                      style={{ background: C.inputBg, border: `1px solid ${C.border}`, color: C.text }}
                      value={descriptionText} onChange={(e) => setDescriptionText(e.target.value)}
                      placeholder="Descreve o teu negócio: o que vendes, preços, quem são os clientes..."
                    />
                    <button
                      onClick={handleAssist} disabled={busy || descriptionText.trim().length < 20}
                      className="w-full flex items-center justify-center gap-2 rounded-full py-3 text-[14px] font-semibold transition-opacity"
                      style={{ background: C.green, color: "#fff", opacity: busy || descriptionText.trim().length < 20 ? 0.5 : 1 }}
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      Estruturar com IA
                    </button>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Analyzing ───────────────────────────────────────────────── */}
        {view === "analyzing" && (
          <div className="flex flex-col items-center justify-center py-20 gap-5 px-8 text-center">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-full" style={{ border: `2px solid ${C.green}20` }} />
              <div className="absolute inset-0 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: C.green }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <Globe className="w-8 h-8" style={{ color: C.green }} />
              </div>
            </div>
            <div>
              <h2 className="text-[18px] font-semibold" style={{ color: C.text }}>A estudar o teu site...</h2>
              <p className="text-[14px] mt-1.5 leading-relaxed" style={{ color: C.text2 }}>
                Estou a ler as páginas, identificar produtos e preços. Isto leva alguns segundos.
              </p>
            </div>
            <p className="text-[12px] flex items-center gap-1.5" style={{ color: C.text3 }}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {profile?.websiteUrl}
            </p>
          </div>
        )}

        {/* ── Editor: profile view ────────────────────────────────────── */}
        {view === "editor" && profile && !editing && (
          <div className="pt-3">
            <ProfileView
              profile={profile}
              slug={slug}
              onEdit={() => setEditing(true)}
              onReanalyze={handleReanalyze}
              reanalyzing={reanalyzing}
            />
          </div>
        )}

        {/* ── Editor: editing form ────────────────────────────────────── */}
        {view === "editor" && profile && editing && (
          <div className="mx-4 pt-3">
            <ProfileEditor
              key={editorKey}
              profile={profile}
              draft={draft}
              saving={saving}
              reanalyzing={reanalyzing}
              onSave={handleSave}
              onReanalyze={handleReanalyze}
              onBack={() => setEditing(false)}
            />
          </div>
        )}

      </main>

      <OwnerNav />
    </div>
  );
}
