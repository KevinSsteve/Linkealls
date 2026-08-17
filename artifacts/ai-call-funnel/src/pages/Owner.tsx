import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  Globe, Sparkles, Loader2, AlertCircle, CheckCircle2,
  Zap, Grid3x3, Megaphone, Users, ChevronRight, X, Store,
  MessageSquare, Phone, RefreshCw, Edit2, Share2, MoreVertical,
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
import { AppHeader, AppIconButton } from "../components/app/AppHeader";
import { ViewField } from "../components/app/ViewField";
import { SettingsSectionHeader } from "../components/app/Section";
import { SettingsListItem } from "../components/app/SettingsListItem";
import { ProductListItem } from "../components/app/ProductListItem";
import { ListFooterAction } from "../components/app/ListFooterAction";

type View = "loading" | "start" | "analyzing" | "editor";
const POLL_MS = 2500;

// ─── Design tokens (alinhados com o brief premium) ───────────────────────────
const D = {
  bg:            "#F8F9FA",
  surface:       "#FFFFFF",
  ink:           "#111111",
  inkSoft:       "#6B7280",
  inkFaint:      "#9CA3AF",
  border:        "#E5E7EB",
  borderSoft:    "#F3F4F6",
  subtle:        "#F3F4F6",
  green:         "#16A34A",
  greenDk:       "#15803D",
  greenLt:       "#DCFCE7",
  greenMuted:    "#F0FDF4",
  errorBg:       "#FEF2F2",
  errorText:     "#DC2626",
  errorBorder:   "#FECACA",
  successBg:     "#F0FDF4",
  successText:   "#15803D",
  successBorder: "#BBF7D0",
  rCard:         16,   // px number for template literals
  rInput:        12,
} as const;

// ─── Avatar palette ───────────────────────────────────────────────────────────
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
function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "N";
}

// ─── Section header — small caps label ───────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <SettingsSectionHeader>{children}</SettingsSectionHeader>;
}

// ─── Tool row (navigation) ────────────────────────────────────────────────────
function ToolRow({ icon: Icon, title, description, href, last = false }: {
  icon: React.ElementType; title: string; description: string; href: string; last?: boolean;
}) {
  return (
    <SettingsListItem
      icon={<Icon size={19} strokeWidth={1.7} />}
      title={title}
      description={description}
      href={href}
      last={last}
    />
  );
}

// ─── Action row (button) ──────────────────────────────────────────────────────
function ActionRow({ icon: Icon, title, description, onClick, loading = false, last = false }: {
  icon: React.ElementType; title: string; description: string;
  onClick: () => void; loading?: boolean; last?: boolean;
}) {
  return (
    <SettingsListItem
      icon={loading ? <Loader2 size={19} strokeWidth={1.7} className="animate-spin" /> : <Icon size={19} strokeWidth={1.7} />}
      title={title}
      description={description}
      onClick={onClick}
      loading={loading}
      last={last}
    />
  );
}

// ─── Info field (section row) — continuous content style ─────────────────────
function InfoField({
  label, value, placeholder, link = false, onAdd, last = false,
}: {
  label: string;
  value?: string | null;
  placeholder: string;
  link?: boolean;
  onAdd?: () => void;
  last?: boolean;
}) {
  return (
    <ViewField
      label={label}
      value={value}
      onAdd={onAdd}
      emptyActionLabel={placeholder}
      className={last ? "app-view-field-last" : ""}
      href={link && value ? (value.startsWith("http") ? value : `https://${value}`) : undefined}
    />
  );
}

// ─── Offering tile (featured) ─────────────────────────────────────────────────
function FeaturedTile({ offering }: { offering: Offering }) {
  const pal = avatarPalette(offering.name);
  return (
    <div className="flex flex-col items-center gap-2" style={{ width: 72 }}>
      <div
        className="flex items-center justify-center overflow-hidden"
        style={{
          width: 60, height: 60,
          borderRadius: 14,
          background: offering.imageUrl ? "transparent" : pal.bg,
          border: `1px solid ${D.border}`,
        }}
      >
        {offering.imageUrl
          ? <img src={offering.imageUrl} alt={offering.name} className="w-full h-full object-cover" />
          : <span style={{ color: pal.text, fontSize: 20, fontWeight: 700 }}>{offering.name[0]?.toUpperCase()}</span>}
      </div>
      <p style={{ color: D.inkSoft, fontSize: 11, textAlign: "center", lineHeight: 1.3 }} className="line-clamp-2">
        {offering.name}
      </p>
    </div>
  );
}

// ─── Catalog row ──────────────────────────────────────────────────────────────
function CatalogRow({ offering, last = false }: { offering: Offering; last?: boolean }) {
  return <ProductListItem name={offering.name} price={offering.price} imageUrl={offering.imageUrl} last={last} />;
}

// ─── Profile View (main view of the owner panel) ──────────────────────────────
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
  const inits = initials(profile.name);
  const isActive = profile.catalogEnabled && profile.offerings.length > 0;
  const featured = profile.offerings.filter((o) => o.featured);
  const previewOfferings = profile.offerings.slice(0, 4);

  const catalogUrl = `${typeof window !== "undefined" ? window.location.origin : ""}${import.meta.env.BASE_URL}e/${slug}/catalogo`;
  const handleShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: profile.name, url: catalogUrl }); return; } catch { /* dismissed */ }
    }
    try { await navigator.clipboard.writeText(catalogUrl); } catch { /* ignore */ }
  };

  return (
    <div style={{ paddingBottom: 32 }}>

      {/* ─── Identity block ──────────────────────────────────────────────────── */}
      <div style={{ background: D.surface, borderBottom: `1px solid ${D.border}`, paddingBottom: 4 }}>
        {/* Avatar + name + sector */}
        <div
          className="flex items-start gap-4"
          style={{ padding: "20px 20px 16px" }}
        >
          {/* Avatar */}
          <div
            className="flex items-center justify-center shrink-0 font-bold"
            style={{
              width: 68, height: 68,
              borderRadius: "50%",
              background: pal.bg,
              color: pal.text,
              fontSize: 24,
              border: `1.5px solid ${D.border}`,
            }}
          >
            {inits}
          </div>

          {/* Name + sector + status */}
          <div className="flex-1 min-w-0" style={{ paddingTop: 4 }}>
            <h2
              className="leading-tight"
              style={{ color: D.ink, fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px" }}
            >
              {profile.name}
            </h2>
            {profile.sector && (
              <p
                className="mt-1 leading-snug"
                style={{ color: D.inkSoft, fontSize: 14 }}
              >
                {profile.sector}
              </p>
            )}
            <div className="flex items-center gap-1.5 mt-2">
              <span
                className="inline-block rounded-full"
                style={{
                  width: 7,
                  height: 7,
                  background: isActive ? D.green : D.inkFaint,
                  flexShrink: 0,
                }}
              />
              <span style={{ color: D.inkSoft, fontSize: 13 }}>
                {isActive ? "Ativo" : "Inativo"}
              </span>
            </div>
          </div>
        </div>

        {/* Action toolbar — 4 compact actions */}
        <div
          className="grid grid-cols-4"
          style={{ borderTop: `1px solid ${D.borderSoft}`, margin: "0 20px" }}
        >
          {[
            { icon: Edit2,        label: "Editar",    action: onEdit,      href: undefined },
            { icon: Grid3x3,      label: "Catálogo",  action: undefined,   href: `/e/${slug}/catalogo` },
            { icon: Share2,       label: "Partilhar", action: handleShare, href: undefined },
            { icon: MoreVertical, label: "Mais",      action: onEdit,      href: undefined },
          ].map(({ icon: Icon, label, action, href }) => {
            const inner = (
              <div
                className="flex flex-col items-center gap-1.5 transition-opacity active:opacity-50"
                style={{ paddingTop: 14, paddingBottom: 12 }}
              >
                <Icon size={20} strokeWidth={1.75} style={{ color: D.inkSoft }} />
                <span style={{ color: D.inkSoft, fontSize: 11.5, fontWeight: 500 }}>{label}</span>
              </div>
            );
            return href ? (
              <Link key={label} href={href}>{inner}</Link>
            ) : (
              <button key={label} className="w-full" onClick={action}>{inner}</button>
            );
          })}
        </div>
      </div>

      {/* ─── Info section — continuous content, no wrapping card ─────────────── */}
      <SectionLabel>Informações</SectionLabel>
      <div style={{ background: D.surface, borderTop: `1px solid ${D.border}`, borderBottom: `1px solid ${D.border}` }}>
        <InfoField label="Descrição"  value={profile.description} placeholder="Adicionar descrição"  onAdd={onEdit} />
        <InfoField label="Endereço"   value={profile.address}     placeholder="Adicionar endereço"   onAdd={onEdit} />
        <InfoField label="Horário"    value={profile.hours}       placeholder="Adicionar horário"    onAdd={onEdit} />
        <InfoField label="Contacto"   value={profile.phone}       placeholder="Adicionar contacto"   onAdd={onEdit} />
        <InfoField label="E-mail"     value={profile.email}       placeholder="Adicionar e-mail"     onAdd={onEdit} />
        <InfoField label="Website"    value={profile.websiteUrl}  placeholder="Adicionar website"    onAdd={onEdit} link last />
      </div>

      {/* ─── Destaques ───────────────────────────────────────────────────────── */}
      {featured.length > 0 && (
        <>
          <div className="flex items-center justify-between" style={{ padding: "28px 20px 8px" }}>
            <p style={{ color: D.inkFaint, fontSize: 11, fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase" }}>
              Destaques
            </p>
            <button onClick={onEdit} style={{ color: D.green, fontSize: 13, fontWeight: 600 }}>Gerir</button>
          </div>
          <div style={{ background: D.surface, borderTop: `1px solid ${D.border}`, borderBottom: `1px solid ${D.border}` }}>
            <div className="flex gap-4 px-5 py-4 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              {featured.map((o, i) => <FeaturedTile key={i} offering={o} />)}
            </div>
          </div>
        </>
      )}

      {/* ─── Catálogo preview ─────────────────────────────────────────────────── */}
      {previewOfferings.length > 0 && (
        <>
          <div className="flex items-center justify-between" style={{ padding: "28px 20px 8px" }}>
            <p style={{ color: D.inkFaint, fontSize: 11, fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase" }}>
              Catálogo
            </p>
            <Link href={`/e/${slug}/catalogo`}>
              <span style={{ color: D.green, fontSize: 13, fontWeight: 600 }}>Ver tudo</span>
            </Link>
          </div>
          <div style={{ background: D.surface, borderTop: `1px solid ${D.border}`, borderBottom: `1px solid ${D.border}` }}>
            {previewOfferings.map((o, i) => (
              <CatalogRow key={i} offering={o} last={i === previewOfferings.length - 1} />
            ))}
              <ListFooterAction href={`/e/${slug}/catalogo`}>Ver catálogo completo</ListFooterAction>
          </div>
        </>
      )}

      {/* ─── O teu negócio ───────────────────────────────────────────────────── */}
      <SectionLabel>O teu negócio</SectionLabel>
      <div style={{ background: D.surface, borderTop: `1px solid ${D.border}`, borderBottom: `1px solid ${D.border}` }}>
        <ToolRow icon={Grid3x3}   title="Catálogo"      description="Exibe produtos e serviços"                href={`/e/${slug}/catalogo`} />
        <ToolRow icon={Zap}       title="Assistente IA" description="Responde automaticamente, 24h por dia"   href={`/e/${slug}/dono/assistente`} />
        <ToolRow icon={Megaphone} title="Campanhas"     description="Anúncios para trazer mais clientes"      href={`/e/${slug}/dono/campanhas`} last />
      </div>

      {/* ─── Pagamentos ──────────────────────────────────────────────────────── */}
      <SectionLabel>Pagamentos</SectionLabel>
      <div style={{ background: D.surface, borderTop: `1px solid ${D.border}`, borderBottom: `1px solid ${D.border}` }}>
        <ToolRow icon={ShoppingCart} title="Vendas"   description="Encomendas pagas no catálogo"               href={`/e/${slug}/dono/vendas`} />
        <ToolRow icon={Wallet}       title="Carteira" description="Saldo, extracto e saques"                   href={`/e/${slug}/dono/carteira`} />
        <ToolRow icon={Crown}        title="Plano"    description="Subscrição Linkealls — 10.000 Kz / 30 dias" href={`/e/${slug}/dono/plano`} last />
      </div>

      {/* ─── Leads & Conversas ───────────────────────────────────────────────── */}
      <SectionLabel>Leads &amp; Conversas</SectionLabel>
      <div style={{ background: D.surface, borderTop: `1px solid ${D.border}`, borderBottom: `1px solid ${D.border}` }}>
        <ToolRow icon={Users}         title="Leads"     description="Todos os contactos qualificados"       href={`/e/${slug}/dono/leads`} />
        <ToolRow icon={MessageSquare} title="Conversas" description="Historial de conversas com clientes"   href={`/e/${slug}/dono/conversas`} last />
      </div>

      {/* ─── Configurar ──────────────────────────────────────────────────────── */}
      <SectionLabel>Configurar</SectionLabel>
      <div style={{ background: D.surface, borderTop: `1px solid ${D.border}`, borderBottom: `1px solid ${D.border}` }}>
        <ToolRow
          icon={Phone}
          title="Testar chamada"
          description="Fala com o assistente IA como um cliente"
          href={`/e/${slug}`}
          last={!profile.websiteUrl}
        />
        {profile.websiteUrl && (
          <ActionRow
            icon={RefreshCw}
            title="Reanalisar site"
            description="Actualiza o perfil com info do site"
            onClick={() => onReanalyze(profile.websiteUrl ?? "")}
            loading={reanalyzing}
            last
          />
        )}
      </div>
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
  const [productFocus, setProductFocus] = useState(false);

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
      <div className="h-full flex items-center justify-center text-sm" style={{ color: D.inkSoft, background: D.bg }}>
        Negócio não encontrado.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ background: D.bg }}>

      {!productFocus && (
        <AppHeader
          title={editing ? "Editar perfil" : "Perfil do negócio"}
          actions={
            !editing ? (
              <Link href={`/e/${slug}`} className="app-icon-button" aria-label="Ver página pública" data-testid="link-public-profile">
                <Store size={19} strokeWidth={1.75} />
              </Link>
            ) : undefined
          }
        />
      )}

      {/* ── Alerts ────────────────────────────────────────────────────────── */}
      {(error || notice) && (
        <div style={{ padding: "12px 20px 0" }}>
          {error && (
            <div
              className="flex items-start gap-2"
              style={{
                background: D.errorBg,
                border: `1px solid ${D.errorBorder}`,
                color: D.errorText,
                borderRadius: 12,
                padding: "12px 14px",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} aria-label="Fechar"><X size={14} /></button>
            </div>
          )}
          {notice && !error && (
            <div
              className="flex items-start gap-2"
              style={{
                background: D.successBg,
                border: `1px solid ${D.successBorder}`,
                color: D.successText,
                borderRadius: 12,
                padding: "12px 14px",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
              <span className="flex-1">{notice}</span>
              <button onClick={() => setNotice(null)} aria-label="Fechar"><X size={14} /></button>
            </div>
          )}
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-y-auto">

        {/* ── Loading ─────────────────────────────────────────────────────── */}
        {view === "loading" && (
          <div style={{ paddingTop: 16 }}>
            <WaSkeletonList count={5} showAvatar={false} />
          </div>
        )}

        {/* ── Start ───────────────────────────────────────────────────────── */}
        {view === "start" && (
          <div>
            {promoVisible && (
              <div style={{ margin: "20px 20px 0" }}>
                <div
                  className="flex gap-3 relative"
                  style={{
                    background: D.surface,
                    border: `1px solid ${D.border}`,
                    borderRadius: D.rCard,
                    padding: 16,
                  }}
                >
                  <button
                    onClick={() => setPromoVisible(false)}
                    className="absolute"
                    style={{ top: 12, right: 12, color: D.inkFaint }}
                    aria-label="Fechar"
                  >
                    <X size={16} strokeWidth={1.75} />
                  </button>
                  <div
                    className="flex items-center justify-center shrink-0"
                    style={{ width: 42, height: 42, borderRadius: 10, background: D.greenMuted }}
                  >
                    <Sparkles size={18} style={{ color: D.green }} strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 min-w-0 pr-6">
                    <p style={{ color: D.ink, fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>
                      Configura o assistente IA
                    </p>
                    <p style={{ color: D.inkSoft, fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
                      Ensina a IA sobre o teu negócio para atender clientes automaticamente.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <SectionLabel>Configurar negócio</SectionLabel>
            <div style={{ background: D.surface, borderTop: `1px solid ${D.border}`, borderBottom: `1px solid ${D.border}` }}>
              {/* Tabs */}
              <div className="flex" style={{ borderBottom: `1px solid ${D.borderSoft}` }}>
                {(["site", "manual"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className="flex-1 flex items-center justify-center gap-1.5 transition-colors"
                    style={{
                      padding: "12px 16px",
                      fontSize: 14,
                      fontWeight: 500,
                      color: mode === m ? D.green : D.inkSoft,
                      borderBottom: mode === m ? `2px solid ${D.green}` : "2px solid transparent",
                    }}
                  >
                    {m === "site" ? <><Globe size={15} strokeWidth={1.75} /> Tenho site</> : <><Sparkles size={15} strokeWidth={1.75} /> Sem site</>}
                  </button>
                ))}
              </div>

              <div style={{ padding: 20 }}>
                {mode === "site" ? (
                  <>
                    <input
                      className="w-full outline-none"
                      style={{
                        background: D.subtle,
                        border: `1px solid ${D.border}`,
                        borderRadius: D.rInput,
                        padding: "12px 14px",
                        color: D.ink,
                        fontSize: 15,
                        marginBottom: 12,
                      }}
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                      placeholder="https://oteusite.co.ao"
                      inputMode="url"
                      autoCapitalize="none"
                    />
                    <button
                      onClick={handleAnalyze}
                      disabled={busy || !url.trim()}
                      className="w-full flex items-center justify-center gap-2 font-semibold transition-opacity disabled:opacity-50"
                      style={{ background: D.green, color: "#fff", borderRadius: 12, minHeight: 48, fontSize: 15 }}
                    >
                      {busy ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} strokeWidth={1.75} />}
                      Analisar o meu site
                    </button>
                  </>
                ) : (
                  <>
                    <textarea
                      className="w-full outline-none resize-y"
                      style={{
                        background: D.subtle,
                        border: `1px solid ${D.border}`,
                        borderRadius: D.rInput,
                        padding: "12px 14px",
                        color: D.ink,
                        fontSize: 15,
                        minHeight: 120,
                        marginBottom: 12,
                        lineHeight: 1.55,
                      }}
                      value={descriptionText}
                      onChange={(e) => setDescriptionText(e.target.value)}
                      placeholder="Descreve o teu negócio: o que vendes, preços, quem são os clientes..."
                    />
                    <button
                      onClick={handleAssist}
                      disabled={busy || descriptionText.trim().length < 20}
                      className="w-full flex items-center justify-center gap-2 font-semibold transition-opacity disabled:opacity-50"
                      style={{ background: D.green, color: "#fff", borderRadius: 12, minHeight: 48, fontSize: 15 }}
                    >
                      {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} strokeWidth={1.75} />}
                      Estruturar com IA
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Analyzing ───────────────────────────────────────────────────── */}
        {view === "analyzing" && (
          <div
            className="flex flex-col items-center justify-center gap-6 text-center"
            style={{ padding: "80px 32px" }}
          >
            <div className="relative" style={{ width: 72, height: 72 }}>
              <div
                className="absolute inset-0 rounded-full"
                style={{ border: `2px solid ${D.green}20` }}
              />
              <div
                className="absolute inset-0 rounded-full border-2 border-transparent animate-spin"
                style={{ borderTopColor: D.green }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <Globe size={28} style={{ color: D.green }} strokeWidth={1.75} />
              </div>
            </div>
            <div>
              <h2 style={{ color: D.ink, fontSize: 18, fontWeight: 600 }}>A analisar o site…</h2>
              <p style={{ color: D.inkSoft, fontSize: 14, marginTop: 8, lineHeight: 1.55 }}>
                Estou a identificar produtos, serviços e preços. Aguarda um momento.
              </p>
            </div>
            <p
              className="flex items-center gap-1.5"
              style={{ color: D.inkFaint, fontSize: 12 }}
            >
              <Loader2 size={13} className="animate-spin" />
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

        {/* ── Editor ──────────────────────────────────────────────────────── */}
        {view === "editor" && profile && editing && (
          <div className={productFocus ? "min-h-0 flex-1" : "app-page-content owner-editor-shell"}>
            <ProfileEditor
              key={editorKey}
              profile={profile}
              draft={draft}
              saving={saving}
              reanalyzing={reanalyzing}
              onSave={handleSave}
              onReanalyze={handleReanalyze}
              onBack={() => setEditing(false)}
              onFocusModeChange={setProductFocus}
            />
          </div>
        )}

      </main>

      {!editing && <OwnerNav />}
    </div>
  );
}
