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

type View = "loading" | "start" | "analyzing" | "editor";

const POLL_MS = 2500;

// ─── Design tokens locais ────────────────────────────────────────────────────
const D = {
  bg:       "#F6F6F4",
  surface:  "#FFFFFF",
  ink:      "#14171A",
  inkSoft:  "#6B7280",
  inkFaint: "#9CA3AF",
  line:     "#E7E7E3",
  lineSoft: "#F0F0EC",
  subtle:   "#F2F2EF",
  green:    "#16A34A",
  greenDk:  "#15803D",
  greenLt:  "#DCFCE7",
  greenMuted:"#F0FDF4",
  errorBg:  "#FEF2F2",
  errorText:"#DC2626",
  errorBorder:"#FECACA",
  successBg:"#F0FDF4",
  successText:"#15803D",
  successBorder:"#BBF7D0",
  rCard:    "20px",
  rBtn:     "999px",
  rInput:   "12px",
} as const;

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

// ─── Section header — label editorial pequena em caps ──────────────────────────
function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{ padding: "28px 20px 10px" }}>
      <p
        className="font-semibold uppercase tracking-widest"
        style={{ color: D.inkFaint, fontSize: 10.5, letterSpacing: "0.13em" }}
      >
        {label}
      </p>
    </div>
  );
}

// ─── Section list wrapper ─────────────────────────────────────────────────────
function SectionList({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mx-5 overflow-hidden"
      style={{
        background: D.surface,
        border: `1px solid ${D.line}`,
        borderRadius: D.rCard,
      }}
    >
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
        className="flex items-center gap-3.5 px-4 py-3.5 cursor-pointer transition-colors active:bg-[#F0F0EC]"
        style={{ borderBottom: last ? "none" : `1px solid ${D.lineSoft}` }}
      >
        <div
          className="flex items-center justify-center shrink-0"
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            background: D.subtle,
            border: `1px solid ${D.line}`,
          }}
        >
          <Icon size={17} style={{ color: D.inkSoft }} strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium leading-tight" style={{ color: D.ink, fontSize: 14.5 }}>{title}</p>
          <p className="mt-0.5 leading-snug" style={{ color: D.inkFaint, fontSize: 12.5 }}>{description}</p>
        </div>
        <ChevronRight size={15} style={{ color: D.inkFaint }} className="shrink-0" />
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
      onClick={onClick}
      disabled={loading}
      className="w-full flex items-center gap-3.5 px-4 py-3.5 transition-colors active:bg-[#F0F0EC] text-left disabled:opacity-50"
      style={{ borderBottom: last ? "none" : `1px solid ${D.lineSoft}` }}
    >
      <div
        className="flex items-center justify-center shrink-0"
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          background: D.subtle,
          border: `1px solid ${D.line}`,
        }}
      >
        {loading
          ? <Loader2 size={17} style={{ color: D.inkSoft }} className="animate-spin" />
          : <Icon size={17} style={{ color: D.inkSoft }} strokeWidth={1.8} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium leading-tight" style={{ color: D.ink, fontSize: 14.5 }}>{title}</p>
        <p className="mt-0.5 leading-snug" style={{ color: D.inkFaint, fontSize: 12.5 }}>{description}</p>
      </div>
      <ChevronRight size={15} style={{ color: D.inkFaint }} className="shrink-0" />
    </button>
  );
}

// ─── Info row — dados do perfil ──────────────────────────────────────────────
function InfoRow({
  icon: Icon, label, value, placeholder, last = false,
}: {
  icon: React.ElementType; label: string; value?: string | null;
  placeholder: string; last?: boolean;
}) {
  const isEmpty = !value?.trim();
  return (
    <div
      className="px-4 py-3.5"
      style={{ borderBottom: last ? "none" : `1px solid ${D.lineSoft}` }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} style={{ color: D.inkFaint }} strokeWidth={2} />
        <p
          className="font-semibold uppercase tracking-wider"
          style={{ color: D.inkFaint, fontSize: 10, letterSpacing: "0.11em" }}
        >
          {label}
        </p>
      </div>
      <p
        className="leading-relaxed pl-4 whitespace-pre-wrap"
        style={{ color: isEmpty ? D.inkFaint : D.ink, fontSize: 14 }}
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
        className="w-[60px] h-[60px] rounded-2xl overflow-hidden flex items-center justify-center"
        style={{ background: offering.imageUrl ? "transparent" : pal.bg, border: `1px solid ${D.line}` }}
      >
        {offering.imageUrl
          ? <img src={offering.imageUrl} alt={offering.name} className="w-full h-full object-cover" />
          : <span className="text-[20px] font-bold" style={{ color: pal.text }}>
              {offering.name[0]?.toUpperCase() ?? "·"}
            </span>
        }
      </div>
      <p
        className="text-center leading-tight line-clamp-2 font-medium"
        style={{ color: D.inkSoft, fontSize: 11 }}
      >
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
      style={{ borderBottom: last ? "none" : `1px solid ${D.lineSoft}` }}
    >
      <div
        className="w-11 h-11 rounded-xl overflow-hidden flex items-center justify-center shrink-0"
        style={{ background: offering.imageUrl ? "transparent" : pal.bg, border: `1px solid ${D.line}` }}
      >
        {offering.imageUrl
          ? <img src={offering.imageUrl} alt={offering.name} className="w-full h-full object-cover" />
          : <Image size={16} style={{ color: pal.text }} />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium leading-tight truncate" style={{ color: D.ink, fontSize: 14 }}>{offering.name}</p>
        {offering.price && (
          <p className="mt-0.5 font-semibold" style={{ color: D.green, fontSize: 13 }}>{offering.price}</p>
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
    <div style={{ paddingBottom: 32 }}>

      {/* ── Bloco de identidade ─────────────────────────────────────────────── */}
      <div
        className="mx-5 mt-5 overflow-hidden"
        style={{
          background: D.surface,
          border: `1px solid ${D.line}`,
          borderRadius: D.rCard,
        }}
      >
        {/* Avatar + nome + sector */}
        <div className="flex items-center gap-4 px-5 pt-5 pb-4">
          <div
            className="flex items-center justify-center shrink-0 font-bold"
            style={{
              width: 68,
              height: 68,
              borderRadius: 18,
              background: pal.bg,
              color: pal.text,
              fontSize: 26,
            }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2
              className="font-bold leading-tight"
              style={{ color: D.ink, fontSize: 18 }}
            >
              {profile.name}
            </h2>
            {profile.sector && (
              <p
                className="mt-1 leading-snug line-clamp-1"
                style={{ color: D.inkSoft, fontSize: 13 }}
              >
                {profile.sector}
              </p>
            )}
            <span
              className="inline-flex items-center gap-1.5 mt-2 rounded-full font-semibold"
              style={{
                fontSize: 11,
                paddingLeft: 10,
                paddingRight: 10,
                paddingTop: 3,
                paddingBottom: 3,
                background: isActive ? D.greenLt : D.subtle,
                color: isActive ? D.greenDk : D.inkFaint,
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full inline-block"
                style={{ background: isActive ? D.green : D.inkFaint }}
              />
              {isActive ? "Ativo" : "Inativo"}
            </span>
          </div>
        </div>

        {/* 4 acções rápidas */}
        <div
          className="grid grid-cols-4 px-3 pt-3 pb-4"
          style={{ borderTop: `1px solid ${D.lineSoft}` }}
        >
          {[
            { icon: Edit2,          label: "Editar",    action: onEdit },
            { icon: Grid3x3,        label: "Catálogo",  href: `/e/${slug}/catalogo` },
            { icon: Share2,         label: "Partilhar", action: handleShare },
            { icon: MoreHorizontal, label: "Mais",      href: `/e/${slug}/dono/assistente` },
          ].map(({ icon: Icon, label, action, href }) => {
            const inner = (
              <div className="flex flex-col items-center gap-2 pt-2 pb-1 px-1">
                <div
                  className="flex items-center justify-center"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    background: D.subtle,
                    border: `1px solid ${D.line}`,
                  }}
                >
                  <Icon size={18} style={{ color: D.inkSoft }} strokeWidth={1.8} />
                </div>
                <span
                  className="font-medium"
                  style={{ color: D.inkSoft, fontSize: 11 }}
                >
                  {label}
                </span>
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

      {/* ── Info ────────────────────────────────────────────────────────────── */}
      <SectionHeader label="Informações" />
      <SectionList>
        <InfoRow icon={Sparkles} label="Descrição" value={profile.description} placeholder="Adicionar descrição…" />
        <InfoRow icon={MapPin}   label="Endereço"  value={profile.address}     placeholder="Adicionar endereço…" />
        <InfoRow icon={Clock}    label="Horário"   value={profile.hours}       placeholder="Adicionar horário…" />
        <InfoRow icon={Phone}    label="Contacto"  value={profile.phone}       placeholder="Adicionar contacto…" />
        <InfoRow icon={Mail}     label="E-mail"    value={profile.email}       placeholder="Adicionar e-mail…" />
        <InfoRow icon={Globe}    label="Website"   value={profile.websiteUrl}  placeholder="Adicionar website…" last />
      </SectionList>

      {/* ── Destaques ───────────────────────────────────────────────────────── */}
      {featured.length > 0 && (
        <>
          <div className="flex items-center justify-between px-5 pt-6 pb-2">
            <p
              className="font-semibold uppercase tracking-widest"
              style={{ color: D.inkFaint, fontSize: 10.5, letterSpacing: "0.13em" }}
            >
              Destaques
            </p>
            <button
              onClick={onEdit}
              className="font-semibold"
              style={{ color: D.green, fontSize: 13 }}
            >
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

      {/* ── Catálogo preview ─────────────────────────────────────────────────── */}
      {previewOfferings.length > 0 && (
        <>
          <div className="flex items-center justify-between px-5 pt-6 pb-2">
            <p
              className="font-semibold uppercase tracking-widest"
              style={{ color: D.inkFaint, fontSize: 10.5, letterSpacing: "0.13em" }}
            >
              Catálogo
            </p>
            <Link href={`/e/${slug}/catalogo`}>
              <span className="font-semibold" style={{ color: D.green, fontSize: 13 }}>Ver tudo</span>
            </Link>
          </div>
          <SectionList>
            {previewOfferings.map((o, i) => (
              <CatalogRow key={i} offering={o} last={i === previewOfferings.length - 1} />
            ))}
            <Link href={`/e/${slug}/catalogo`}>
              <div
                className="flex items-center justify-center py-3 px-4"
                style={{ borderTop: `1px solid ${D.lineSoft}` }}
              >
                <span className="font-semibold" style={{ color: D.green, fontSize: 13 }}>
                  Ver catálogo completo →
                </span>
              </div>
            </Link>
          </SectionList>
        </>
      )}

      {/* ── O teu negócio ───────────────────────────────────────────────────── */}
      <SectionHeader label="O teu negócio" />
      <SectionList>
        <ToolRow icon={Grid3x3}   title="Catálogo"      description="Exibe os teus produtos e serviços"      href={`/e/${slug}/catalogo`} />
        <ToolRow icon={Zap}       title="Assistente IA" description="Responde automaticamente, 24h por dia"   href={`/e/${slug}/dono/assistente`} />
        <ToolRow icon={Megaphone} title="Campanhas"     description="Cria anúncios para trazer mais clientes" href={`/e/${slug}/dono/campanhas`} last />
      </SectionList>

      {/* ── Pagamentos ──────────────────────────────────────────────────────── */}
      <SectionHeader label="Pagamentos" />
      <SectionList>
        <ToolRow icon={ShoppingCart} title="Vendas"   description="Encomendas pagas no catálogo"               href={`/e/${slug}/dono/vendas`} />
        <ToolRow icon={Wallet}       title="Carteira" description="Saldo, extracto e saques"                   href={`/e/${slug}/dono/carteira`} />
        <ToolRow icon={Crown}        title="Plano"    description="Subscrição Linkealls — 10.000 Kz / 30 dias" href={`/e/${slug}/dono/plano`} last />
      </SectionList>

      {/* ── Leads & conversas ───────────────────────────────────────────────── */}
      <SectionHeader label="Leads & Conversas" />
      <SectionList>
        <ToolRow icon={Users}         title="Leads"      description="Gere todos os contactos qualificados"    href={`/e/${slug}/dono/leads`} />
        <ToolRow icon={MessageSquare} title="Conversas"  description="Historial de conversas com os clientes"  href={`/e/${slug}/dono/conversas`} last />
      </SectionList>

      {/* ── Configurar ──────────────────────────────────────────────────────── */}
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
      <div className="h-full flex items-center justify-center text-sm" style={{ color: D.inkSoft, background: D.bg }}>
        Negócio não encontrado.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ background: D.bg }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header
        className="shrink-0 flex items-center justify-between px-5 pt-6 pb-3"
        style={{ background: D.surface, borderBottom: `1px solid ${D.line}` }}
      >
        <h1
          className="font-bold tracking-tight"
          style={{ color: D.ink, fontSize: 22, letterSpacing: "-0.3px" }}
        >
          {editing ? "Editar perfil" : "Perfil do negócio"}
        </h1>
        {!editing && (
          <Link href={`/e/${slug}`} title="Ver página pública">
            <Store size={19} strokeWidth={1.8} style={{ color: D.inkFaint }} />
          </Link>
        )}
      </header>

      {/* ── Alertas ───────────────────────────────────────────────────────── */}
      {(error || notice) && (
        <div className="shrink-0 px-5 pt-3">
          {error && (
            <div
              className="flex items-start gap-2 rounded-xl px-4 py-3"
              style={{ background: D.errorBg, border: `1px solid ${D.errorBorder}`, color: D.errorText, fontSize: 13 }}
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} className="shrink-0"><X size={14} /></button>
            </div>
          )}
          {notice && !error && (
            <div
              className="flex items-start gap-2 rounded-xl px-4 py-3"
              style={{ background: D.successBg, border: `1px solid ${D.successBorder}`, color: D.successText, fontSize: 13 }}
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

        {/* ── Start: formulário de configuração ───────────────────────────── */}
        {view === "start" && (
          <div>
            {promoVisible && (
              <div className="mx-5 mt-5">
                <div
                  className="rounded-2xl p-4 flex gap-3 relative"
                  style={{ background: D.surface, border: `1px solid ${D.line}` }}
                >
                  <button
                    onClick={() => setPromoVisible(false)}
                    className="absolute top-3 right-3"
                    style={{ color: D.inkFaint }}
                  >
                    <X size={16} />
                  </button>
                  <div
                    className="flex items-center justify-center shrink-0"
                    style={{ width: 44, height: 44, borderRadius: 12, background: D.greenMuted }}
                  >
                    <Sparkles size={20} style={{ color: D.green }} />
                  </div>
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="font-semibold leading-snug" style={{ color: D.ink, fontSize: 14 }}>
                      Configura o teu assistente IA
                    </p>
                    <p className="mt-1 leading-relaxed" style={{ color: D.inkSoft, fontSize: 12 }}>
                      Ensina a IA sobre o teu negócio para atender clientes automaticamente, 24h por dia.
                    </p>
                    <button
                      onClick={() => {
                        setPromoVisible(false);
                        setTimeout(() => {
                          document.querySelector<HTMLInputElement>("input[inputmode='url'], textarea")?.focus();
                        }, 100);
                      }}
                      className="mt-3 font-semibold"
                      style={{
                        background: D.green,
                        color: "#fff",
                        borderRadius: D.rBtn,
                        fontSize: 13,
                        paddingLeft: 16,
                        paddingRight: 16,
                        paddingTop: 6,
                        paddingBottom: 6,
                      }}
                    >
                      Começar agora
                    </button>
                  </div>
                </div>
              </div>
            )}

            <SectionHeader label="Configurar negócio" />
            <SectionList>
              {/* Tabs dentro do card */}
              <div className="flex" style={{ borderBottom: `1px solid ${D.lineSoft}` }}>
                <button
                  onClick={() => setMode("site")}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 font-medium transition-colors"
                  style={{
                    fontSize: 13.5,
                    color: mode === "site" ? D.green : D.inkSoft,
                    borderBottom: mode === "site" ? `2px solid ${D.green}` : "2px solid transparent",
                  }}
                >
                  <Globe className="w-4 h-4" /> Tenho site
                </button>
                <button
                  onClick={() => setMode("manual")}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 font-medium transition-colors"
                  style={{
                    fontSize: 13.5,
                    color: mode === "manual" ? D.green : D.inkSoft,
                    borderBottom: mode === "manual" ? `2px solid ${D.green}` : "2px solid transparent",
                  }}
                >
                  <Sparkles className="w-4 h-4" /> Sem site
                </button>
              </div>

              <div className="p-4 space-y-3">
                {mode === "site" ? (
                  <>
                    <input
                      className="w-full px-4 py-3 outline-none"
                      style={{
                        background: D.subtle,
                        border: `1.5px solid ${D.line}`,
                        borderRadius: D.rInput,
                        color: D.ink,
                        fontSize: 15,
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
                      style={{ background: D.green, color: "#fff", borderRadius: D.rBtn, minHeight: 48, fontSize: 14 }}
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                      Analisar o meu site
                    </button>
                  </>
                ) : (
                  <>
                    <textarea
                      className="w-full px-4 py-3 outline-none resize-y"
                      style={{
                        background: D.subtle,
                        border: `1.5px solid ${D.line}`,
                        borderRadius: D.rInput,
                        color: D.ink,
                        minHeight: 120,
                        fontSize: 15,
                      }}
                      value={descriptionText}
                      onChange={(e) => setDescriptionText(e.target.value)}
                      placeholder="Descreve o teu negócio: o que vendes, preços, quem são os clientes..."
                    />
                    <button
                      onClick={handleAssist}
                      disabled={busy || descriptionText.trim().length < 20}
                      className="w-full flex items-center justify-center gap-2 font-semibold transition-opacity disabled:opacity-50"
                      style={{ background: D.green, color: "#fff", borderRadius: D.rBtn, minHeight: 48, fontSize: 14 }}
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
          <div className="flex flex-col items-center justify-center py-20 gap-6 px-8 text-center">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-full" style={{ border: `2px solid ${D.green}20` }} />
              <div
                className="absolute inset-0 rounded-full border-2 border-transparent animate-spin"
                style={{ borderTopColor: D.green }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <Globe className="w-8 h-8" style={{ color: D.green }} />
              </div>
            </div>
            <div>
              <h2 className="font-semibold" style={{ color: D.ink, fontSize: 18 }}>A estudar o teu site…</h2>
              <p className="mt-2 leading-relaxed" style={{ color: D.inkSoft, fontSize: 14 }}>
                Estou a ler as páginas, identificar produtos e preços. Aguarda um momento.
              </p>
            </div>
            <p className="flex items-center gap-1.5" style={{ color: D.inkFaint, fontSize: 12 }}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {profile?.websiteUrl}
            </p>
          </div>
        )}

        {/* ── Perfil — view ───────────────────────────────────────────────── */}
        {view === "editor" && profile && !editing && (
          <ProfileView
            profile={profile}
            slug={slug}
            onEdit={() => setEditing(true)}
            onReanalyze={handleReanalyze}
            reanalyzing={reanalyzing}
          />
        )}

        {/* ── Formulário de edição ─────────────────────────────────────────── */}
        {view === "editor" && profile && editing && (
          <div className="mx-5 pt-4">
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
