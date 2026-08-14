import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  Globe, Sparkles, Loader2, AlertCircle, CheckCircle2,
  Zap, Grid3x3, Megaphone, Users, ChevronRight, X, Store,
  MessageSquare, Phone, RefreshCw, Edit2, Share2, MoreHorizontal,
  MapPin, Clock, Mail, Image, ShoppingCart, Wallet, Crown,
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
  { bg: "#DCFCE7", text: "#15803D" },
  { bg: "#DBEAFE", text: "#1D4ED8" },
  { bg: "#FEE2E2", text: "#B91C1C" },
  { bg: "#FEF3C7", text: "#B45309" },
  { bg: "#EDE9FE", text: "#6D28D9" },
  { bg: "#FCE7F3", text: "#9D174D" },
  { bg: "#CCFBF1", text: "#0F766E" },
  { bg: "#FEF9C3", text: "#A16207" },
];
function avatarPalette(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return PALETTES[Math.abs(h) % PALETTES.length]!;
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-4 pt-8 pb-2">
      <p className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: C.text3 }}>
        {label}
      </p>
    </div>
  );
}

// ─── Section list — full-width list, iOS settings style ──────────────────────
function SectionList({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, background: C.white }}>
      {children}
    </div>
  );
}

// ─── Tool row — navigation link ───────────────────────────────────────────────
function ToolRow({ icon: Icon, title, description, href, last = false }: {
  icon: React.ElementType; title: string; description: string; href: string; last?: boolean;
}) {
  return (
    <Link href={href}>
      <div
        className="flex items-center gap-4 px-4 py-4 cursor-pointer transition-colors active:bg-gray-50"
        style={{ borderBottom: last ? "none" : `1px solid ${C.border}` }}
      >
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: C.inputBg }}>
          <Icon size={18} style={{ color: C.text2 }} strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-medium leading-tight" style={{ color: C.text }}>{title}</p>
          <p className="text-[13px] mt-0.5 leading-snug" style={{ color: C.text3 }}>{description}</p>
        </div>
        <ChevronRight size={16} style={{ color: C.text3 }} className="shrink-0" />
      </div>
    </Link>
  );
}

// ─── Action row — button ──────────────────────────────────────────────────────
function ActionRow({ icon: Icon, title, description, onClick, loading = false, last = false }: {
  icon: React.ElementType; title: string; description: string;
  onClick: () => void; loading?: boolean; last?: boolean;
}) {
  return (
    <button
      onClick={onClick} disabled={loading}
      className="w-full flex items-center gap-4 px-4 py-4 transition-colors active:bg-gray-50 text-left disabled:opacity-50"
      style={{ borderBottom: last ? "none" : `1px solid ${C.border}` }}
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: C.inputBg }}>
        {loading
          ? <Loader2 size={18} style={{ color: C.text2 }} className="animate-spin" />
          : <Icon size={18} style={{ color: C.text2 }} strokeWidth={1.8} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium leading-tight" style={{ color: C.text }}>{title}</p>
        <p className="text-[13px] mt-0.5 leading-snug" style={{ color: C.text3 }}>{description}</p>
      </div>
      <ChevronRight size={16} style={{ color: C.text3 }} className="shrink-0" />
    </button>
  );
}

// ─── Info row — flat list, icon inline with label ────────────────────────────
function InfoRow({
  icon: Icon, label, value, placeholder, last = false,
}: {
  icon: React.ElementType; label: string; value?: string | null;
  placeholder: string; last?: boolean;
}) {
  const isEmpty = !value?.trim();
  return (
    <div
      className="px-4 py-4"
      style={{ borderBottom: last ? "none" : `1px solid ${C.border}` }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={13} style={{ color: C.text3 }} strokeWidth={2} />
        <p className="text-[11px] font-semibold tracking-wider uppercase" style={{ color: C.text3 }}>{label}</p>
      </div>
      <p
        className="text-[15px] leading-relaxed pl-5 whitespace-pre-wrap"
        style={{ color: isEmpty ? C.text3 : C.text }}
      >
        {isEmpty ? placeholder : value}
      </p>
    </div>
  );
}

// ─── Destaque tile ─────────────────────────────────────────────────────────────
function DestaqueTile({ offering }: { offering: Offering }) {
  const pal = avatarPalette(offering.name);
  return (
    <div className="flex flex-col items-center gap-2 w-20 shrink-0">
      <div
        className="w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center"
        style={{ background: offering.imageUrl ? "transparent" : pal.bg }}
      >
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

// ─── Catalog product row ───────────────────────────────────────────────────────
function CatalogRow({ offering, last = false }: { offering: Offering; last?: boolean }) {
  const pal = avatarPalette(offering.name);
  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{ borderBottom: last ? "none" : `1px solid ${C.border}` }}
    >
      <div
        className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center shrink-0"
        style={{ background: offering.imageUrl ? "transparent" : pal.bg }}
      >
        {offering.imageUrl
          ? <img src={offering.imageUrl} alt={offering.name} className="w-full h-full object-cover" />
          : <Image size={18} style={{ color: pal.text }} />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium leading-tight truncate" style={{ color: C.text }}>{offering.name}</p>
        {offering.price && (
          <p className="text-[13px] mt-0.5 font-semibold" style={{ color: C.green }}>{offering.price}</p>
        )}
      </div>
    </div>
  );
}

// ─── Profile View ─────────────────────────────────────────────────────────────
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
      try { await navigator.share({ title: profile.name, url: catalogUrl }); return; }
      catch { /* dismissed */ }
    }
    try { await navigator.clipboard.writeText(catalogUrl); } catch { /* ignore */ }
  };

  return (
    <div className="wa-page">

      {/* ── Identity ─────────────────────────────────────────────────────── */}
      <div style={{ background: C.white, borderBottom: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-4 px-4 pt-6 pb-4">
          <div
            className="w-[72px] h-[72px] rounded-full flex items-center justify-center shrink-0 text-[28px] font-bold"
            style={{ background: pal.bg, color: pal.text }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[19px] font-bold leading-tight" style={{ color: C.text }}>{profile.name}</h2>
            {profile.sector && (
              <p className="text-[13px] mt-1 leading-snug line-clamp-1" style={{ color: C.text2 }}>{profile.sector}</p>
            )}
            <span
              className="inline-flex items-center gap-1.5 mt-2 px-2 py-0.5 rounded-full text-[11px] font-semibold"
              style={isActive
                ? { background: C.greenLight, color: C.greenDark }
                : { background: C.inputBg, color: C.text3 }}
            >
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: isActive ? C.green : C.text3 }} />
              {isActive ? "Ativo" : "Inativo"}
            </span>
          </div>
        </div>

        {/* 4 action buttons */}
        <div className="grid grid-cols-4 px-2 pt-2 pb-4" style={{ borderTop: `1px solid ${C.border}` }}>
          {[
            { icon: Edit2,          label: "Editar",    action: onEdit },
            { icon: Grid3x3,        label: "Catálogo",  href: `/e/${slug}/catalogo` },
            { icon: Share2,         label: "Partilhar", action: handleShare },
            { icon: MoreHorizontal, label: "Mais",      href: `/e/${slug}/dono/assistente` },
          ].map(({ icon: Icon, label, action, href }) => {
            const inner = (
              <div className="flex flex-col items-center gap-2 pt-3 pb-1 px-1">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: C.inputBg }}>
                  <Icon size={18} style={{ color: C.text2 }} strokeWidth={1.8} />
                </div>
                <span className="text-[11px] font-medium" style={{ color: C.text2 }}>{label}</span>
              </div>
            );
            return href ? (
              <Link key={label} href={href}>{inner}</Link>
            ) : (
              <button key={label} onClick={action} className="w-full active:opacity-70 transition-opacity">{inner}</button>
            );
          })}
        </div>
      </div>

      {/* ── Info list ───────────────────────────────────────────────────── */}
      <div className="mt-6">
        <SectionList>
          <InfoRow icon={Sparkles} label="Descrição" value={profile.description} placeholder="Adicionar descrição…" />
          <InfoRow icon={MapPin}   label="Endereço"  value={profile.address}     placeholder="Adicionar endereço…" />
          <InfoRow icon={Clock}    label="Horário"   value={profile.hours}       placeholder="Adicionar horário…" />
          <InfoRow icon={Phone}    label="Contacto"  value={profile.phone}       placeholder="Adicionar contacto…" />
          <InfoRow icon={Mail}     label="E-mail"    value={profile.email}       placeholder="Adicionar e-mail…" />
          <InfoRow icon={Globe}    label="Website"   value={profile.websiteUrl}  placeholder="Adicionar website…" last />
        </SectionList>
      </div>

      {/* ── Destaques ───────────────────────────────────────────────────── */}
      {featured.length > 0 && (
        <>
          <div className="flex items-center justify-between px-4 pt-8 pb-3">
            <p className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: C.text3 }}>Destaques</p>
            <button onClick={onEdit} className="text-[13px] font-semibold" style={{ color: C.green }}>
              Gerir
            </button>
          </div>
          <SectionList>
            <div className="flex gap-4 px-4 py-4 overflow-x-auto scrollbar-none">
              {featured.map((o, i) => <DestaqueTile key={i} offering={o} />)}
            </div>
          </SectionList>
        </>
      )}

      {/* ── Catálogo preview ─────────────────────────────────────────────── */}
      {previewOfferings.length > 0 && (
        <>
          <div className="flex items-center justify-between px-4 pt-8 pb-3">
            <p className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: C.text3 }}>Catálogo</p>
            <Link href={`/e/${slug}/catalogo`}>
              <span className="text-[13px] font-semibold" style={{ color: C.green }}>Ver tudo</span>
            </Link>
          </div>
          <SectionList>
            {previewOfferings.map((o, i) => (
              <CatalogRow key={i} offering={o} last={i === previewOfferings.length - 1} />
            ))}
            <Link href={`/e/${slug}/catalogo`}>
              <div
                className="flex items-center justify-center py-3 px-4"
                style={{ borderTop: `1px solid ${C.border}` }}
              >
                <span className="text-[13px] font-semibold" style={{ color: C.green }}>
                  Ver catálogo completo →
                </span>
              </div>
            </Link>
          </SectionList>
        </>
      )}

      {/* ── O teu negócio ───────────────────────────────────────────────── */}
      <SectionHeader label="O teu negócio" />
      <SectionList>
        <ToolRow icon={Grid3x3}   title="Catálogo"      description="Exibe os teus produtos e serviços"     href={`/e/${slug}/catalogo`} />
        <ToolRow icon={Zap}       title="Assistente IA" description="Responde automaticamente, 24h por dia"  href={`/e/${slug}/dono/assistente`} />
        <ToolRow icon={Megaphone} title="Campanhas"     description="Cria anúncios para trazer mais clientes" href={`/e/${slug}/dono/campanhas`} last />
      </SectionList>

      {/* ── Pagamentos ────────────────────────────────────────────────────── */}
      <SectionHeader label="Pagamentos" />
      <SectionList>
        <ToolRow icon={ShoppingCart} title="Vendas"   description="Encomendas pagas no catálogo"              href={`/e/${slug}/dono/vendas`} />
        <ToolRow icon={Wallet}       title="Carteira" description="Saldo, extracto e saques"                  href={`/e/${slug}/dono/carteira`} />
        <ToolRow icon={Crown}        title="Plano"    description="Subscrição Linkealls — 10.000 Kz / 30 dias" href={`/e/${slug}/dono/plano`} last />
      </SectionList>

      {/* ── Leads & conversas ─────────────────────────────────────────────── */}
      <SectionHeader label="Leads & conversas" />
      <SectionList>
        <ToolRow icon={Users}        title="Leads"     description="Gere todos os contactos qualificados"       href={`/e/${slug}/dono/leads`} />
        <ToolRow icon={MessageSquare} title="Conversas" description="Historial de conversas com os clientes"    href={`/e/${slug}/dono/conversas`} last />
      </SectionList>

      {/* ── Configurar ───────────────────────────────────────────────────── */}
      <SectionHeader label="Configurar" />
      <SectionList>
        <ToolRow
          icon={Phone}
          title="Testar chamada"
          description="Fala com o teu assistente IA como um cliente"
          href={`/e/${slug}`}
          last={!profile.websiteUrl}
        />
        {profile.websiteUrl && (
          <ActionRow
            icon={RefreshCw}
            title="Reanalisar site"
            description="Actualiza o perfil com as últimas informações do site"
            onClick={() => onReanalyze(profile.websiteUrl ?? "")}
            loading={reanalyzing}
            last
          />
        )}
      </SectionList>

      <div className="h-8" />
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
          setNotice("Análise concluída. Revê o perfil e guarda.");
          setView("editor"); setEditing(true);
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
      setNotice("A IA estruturou o teu negócio. Revê os campos e guarda.");
      setView("editor"); setEditing(true);
    } catch (err) { setError(err instanceof Error ? err.message : "A IA não conseguiu estruturar a descrição"); }
    finally { setBusy(false); }
  };

  const handleSave = async (fields: ProfileDraft & { websiteUrl?: string | null }) => {
    if (!api) return;
    setSaving(true); setError(null);
    try {
      const { profile: p } = await api.saveProfile(fields);
      setProfile(p); setDraft(null);
      setNotice("Perfil guardado com sucesso.");
      setEditing(false);
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
    <div className="h-full flex flex-col" style={{ background: C.bg }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header
        className="shrink-0 flex items-center justify-between px-4 pt-6 pb-3"
        style={{ background: C.white, borderBottom: `1px solid ${C.border}` }}
      >
        <h1 className="text-[22px] font-bold tracking-tight" style={{ color: C.text }}>
          {editing ? "Editar perfil" : "Perfil do negócio"}
        </h1>
        {!editing && (
          <Link href={`/e/${slug}`} title="Ver página pública">
            <Store size={20} strokeWidth={1.8} style={{ color: C.text3 }} />
          </Link>
        )}
      </header>

      {/* ── Alerts ────────────────────────────────────────────────────────── */}
      {(error || notice) && (
        <div className="shrink-0 px-4 pt-3">
          {error && (
            <div
              className="flex items-start gap-2 text-[13px] rounded-xl px-4 py-3"
              style={{ background: C.errorBg, border: `1px solid ${C.errorBorder}`, color: C.errorText }}
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} className="shrink-0"><X size={14} /></button>
            </div>
          )}
          {notice && !error && (
            <div
              className="flex items-start gap-2 text-[13px] rounded-xl px-4 py-3"
              style={{ background: C.successBg, border: `1px solid ${C.successBorder}`, color: C.successText }}
            >
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="flex-1">{notice}</span>
              <button onClick={() => setNotice(null)} className="shrink-0"><X size={14} /></button>
            </div>
          )}
        </div>
      )}

      <main className="flex-1 overflow-y-auto">

        {/* ── Loading ─────────────────────────────────────────────────────── */}
        {view === "loading" && (
          <div className="pt-4">
            <WaSkeletonList count={4} showAvatar={false} />
          </div>
        )}

        {/* ── Start: setup form ───────────────────────────────────────────── */}
        {view === "start" && (
          <div className="wa-page">
            {promoVisible && (
              <div className="mx-4 mt-6">
                <div
                  className="rounded-2xl p-4 flex gap-3 relative"
                  style={{ background: C.white, border: `1px solid ${C.border}` }}
                >
                  <button
                    onClick={() => setPromoVisible(false)}
                    className="absolute top-3 right-3"
                    style={{ color: C.text3 }}
                  >
                    <X size={16} />
                  </button>
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: C.greenMuted }}
                  >
                    <Sparkles size={20} style={{ color: C.green }} />
                  </div>
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="font-semibold text-[14px] leading-snug" style={{ color: C.text }}>
                      Configura o teu assistente IA
                    </p>
                    <p className="text-[12px] mt-1 leading-relaxed" style={{ color: C.text2 }}>
                      Ensina a IA sobre o teu negócio para atender clientes automaticamente, 24h por dia.
                    </p>
                    <button
                      onClick={() => {
                        setPromoVisible(false);
                        setTimeout(() => {
                          document.querySelector<HTMLInputElement>("input[inputmode='url'], textarea")?.focus();
                        }, 100);
                      }}
                      className="mt-3 px-4 py-1.5 rounded-full text-[13px] font-semibold"
                      style={{ background: C.green, color: "#fff" }}
                    >
                      Começar agora
                    </button>
                  </div>
                </div>
              </div>
            )}

            <SectionHeader label="Configurar negócio" />
            <SectionList>
              <div className="flex" style={{ borderBottom: `1px solid ${C.border}` }}>
                <button
                  onClick={() => setMode("site")}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 text-[14px] font-medium transition-colors"
                  style={{
                    color: mode === "site" ? C.green : C.text2,
                    borderBottom: mode === "site" ? `2px solid ${C.green}` : "2px solid transparent",
                  }}
                >
                  <Globe className="w-4 h-4" /> Tenho site
                </button>
                <button
                  onClick={() => setMode("manual")}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 text-[14px] font-medium transition-colors"
                  style={{
                    color: mode === "manual" ? C.green : C.text2,
                    borderBottom: mode === "manual" ? `2px solid ${C.green}` : "2px solid transparent",
                  }}
                >
                  <Sparkles className="w-4 h-4" /> Sem site
                </button>
              </div>
              <div className="p-4 space-y-3">
                {mode === "site" ? (
                  <>
                    <input
                      className="w-full rounded-xl px-4 py-3 text-[15px] outline-none"
                      style={{ background: C.inputBg, border: `1px solid ${C.border}`, color: C.text }}
                      value={url} onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                      placeholder="https://oteusite.co.ao"
                      inputMode="url" autoCapitalize="none"
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
                      className="w-full rounded-xl px-4 py-3 text-[15px] outline-none resize-y"
                      style={{ background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, minHeight: 120 }}
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
            </SectionList>
          </div>
        )}

        {/* ── Analyzing ───────────────────────────────────────────────────── */}
        {view === "analyzing" && (
          <div className="flex flex-col items-center justify-center py-20 gap-6 px-8 text-center wa-page">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-full" style={{ border: `2px solid ${C.green}20` }} />
              <div className="absolute inset-0 rounded-full border-2 border-transparent animate-spin"
                style={{ borderTopColor: C.green }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <Globe className="w-8 h-8" style={{ color: C.green }} />
              </div>
            </div>
            <div>
              <h2 className="text-[18px] font-semibold" style={{ color: C.text }}>A estudar o teu site…</h2>
              <p className="text-[14px] mt-2 leading-relaxed" style={{ color: C.text2 }}>
                Estou a ler as páginas, identificar produtos e preços. Aguarda um momento.
              </p>
            </div>
            <p className="text-[12px] flex items-center gap-1.5" style={{ color: C.text3 }}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {profile?.websiteUrl}
            </p>
          </div>
        )}

        {/* ── Profile view ────────────────────────────────────────────────── */}
        {view === "editor" && profile && !editing && (
          <ProfileView
            profile={profile}
            slug={slug}
            onEdit={() => setEditing(true)}
            onReanalyze={handleReanalyze}
            reanalyzing={reanalyzing}
          />
        )}

        {/* ── Editing form ────────────────────────────────────────────────── */}
        {view === "editor" && profile && editing && (
          <div className="mx-4 pt-4">
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
