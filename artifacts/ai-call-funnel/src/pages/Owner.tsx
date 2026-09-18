import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  Globe, Sparkles, Loader2, AlertCircle, CheckCircle2,
  Zap, Grid3x3, Megaphone, Users, ChevronRight, X, Store,
  MessageSquare, Phone, RefreshCw, Edit2, Share2, MoreVertical,
  MapPin, Clock, Mail, Image, ShoppingCart, PackageCheck, Wallet, Crown, LogOut, Trash2, UserRound, KeyRound,
} from "lucide-react";
import { OwnerNav } from "../components/owner/OwnerNav";
import {
  businessApi,
  analyzeBusinessOnboarding,
  getStorageObjectUrl,
  generateRecoveryCode,
  confirmSensitiveAction,
  userLogout, deleteUserAccount,
  type BusinessProfile,
  type CatalogAnalytics as CatalogAnalyticsData,
  type ProfileDraft,
  type Offering,
} from "../lib/api";
import { useBusinessSlug } from "../hooks/useBusinessSlug";
import { useAuth } from "../context/AuthContext";
import { ProfileEditor } from "../components/owner/ProfileEditor";
import { WaSkeletonList } from "../components/wa/WaSkeletonList";
import { AppHeader, AppIconButton } from "../components/app/AppHeader";
import { ViewField } from "../components/app/ViewField";
import { SettingsSectionHeader } from "../components/app/Section";
import { SettingsListItem } from "../components/app/SettingsListItem";
import { ProductListItem } from "../components/app/ProductListItem";
import { ListFooterAction } from "../components/app/ListFooterAction";
import { clearBusinessOnboarding, readBusinessOnboarding, saveBusinessOnboarding } from "../lib/businessOnboarding";

import { OwnerProfileOverview } from "../components/owner/OwnerProfileOverview";
import type { ProfileEditorTarget, CatalogSettingsPatch } from "../lib/profilePresentation";

type View = "loading" | "start" | "analyzing" | "editor";
const POLL_MS = 2500;

import { D, avatarPalette, initials } from "../components/owner/profileTheme";

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

function DeleteAccountDialog({
  open,
  loading,
  onClose,
  onConfirm,
}: {
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    if (open) setConfirmation("");
  }, [open]);

  if (!open) return null;
  const ready = confirmation.trim().toUpperCase() === "APAGAR";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0A2540]/45 p-4 sm:items-center" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        className="w-full max-w-[420px] rounded-[24px] bg-white p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FEF2F2] text-[#DC2626]">
            <Trash2 size={19} />
          </div>
          <div>
            <h2 id="delete-account-title" className="text-[18px] font-bold text-[#0A2540]">Eliminar a conta?</h2>
            <p className="mt-1 text-[13px] leading-5 text-[#425466]">
              Esta acção elimina definitivamente o perfil, catálogo, leads, conversas, campanhas e histórico de pagamentos deste negócio.
            </p>
          </div>
        </div>
        <label className="block text-[12px] font-semibold uppercase tracking-[0.08em] text-[#8898AA]" htmlFor="delete-account-confirmation">
          Escreve APAGAR para confirmar
        </label>
        <input
          id="delete-account-confirmation"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          className="mt-2 w-full rounded-xl border border-[#E6EBF1] bg-[#F6F9FC] px-3 py-3 text-[15px] outline-none focus:border-[#DC2626]"
          autoFocus
          autoComplete="off"
          disabled={loading}
        />
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} disabled={loading} className="min-h-11 flex-1 rounded-xl border border-[#E6EBF1] px-4 text-[14px] font-semibold text-[#425466] disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={onConfirm} disabled={!ready || loading} className="min-h-11 flex-1 rounded-xl bg-[#DC2626] px-4 text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
            {loading ? "A eliminar…" : "Eliminar conta"}
          </button>
        </div>
      </div>
    </div>
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

function CatalogAnalyticsCard({ slug, offerings }: { slug: string; offerings: Offering[] }) {
  const api = useMemo(() => businessApi(slug), [slug]);
  const [analytics, setAnalytics] = useState<CatalogAnalyticsData | null>(null);

  useEffect(() => {
    let active = true;
    api.getCatalogAnalytics()
      .then(({ analytics: next }) => { if (active) setAnalytics(next); })
      .catch(() => { if (active) setAnalytics(null); });
    return () => { active = false; };
  }, [api, offerings]);

  if (!analytics) return null;
  const maxClicks = Math.max(...analytics.products.map((product) => product.clicks), 1);

  return (
    <>
      <SectionLabel>Visibilidade</SectionLabel>
      <div
        className="px-5 py-5"
        style={{
          background: D.surface,
          borderTop: `1px solid ${D.border}`,
          borderBottom: `1px solid ${D.border}`,
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[14px] px-4 py-3" style={{ background: D.greenMuted }}>
            <p style={{ color: D.inkFaint, fontSize: 11, fontWeight: 600 }}>Visitantes do catálogo</p>
            <p className="mt-1 tabular-nums" style={{ color: D.ink, fontSize: 25, fontWeight: 750 }}>
              {analytics.catalogVisitors.toLocaleString("pt-AO")}
            </p>
          </div>
          <div className="rounded-[14px] px-4 py-3" style={{ background: D.subtle }}>
            <p style={{ color: D.inkFaint, fontSize: 11, fontWeight: 600 }}>Cliques em produtos</p>
            <p className="mt-1 tabular-nums" style={{ color: D.ink, fontSize: 25, fontWeight: 750 }}>
              {analytics.productClicks.toLocaleString("pt-AO")}
            </p>
          </div>
        </div>

        {analytics.products.length > 0 ? (
          <div className="mt-5">
            <p className="mb-3" style={{ color: D.inkSoft, fontSize: 12, fontWeight: 650 }}>
              Produtos mais consultados
            </p>
            <div className="space-y-3">
              {[...analytics.products]
                .sort((a, b) => b.clicks - a.clicks)
                .map((product) => (
                  <div key={product.key}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate" style={{ color: D.ink, fontSize: 13 }}>{product.name}</span>
                      <span className="shrink-0 tabular-nums" style={{ color: D.inkSoft, fontSize: 12, fontWeight: 650 }}>
                        {product.clicks} {product.clicks === 1 ? "clique" : "cliques"}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: D.borderSoft }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.max((product.clicks / maxClicks) * 100, product.clicks > 0 ? 4 : 0)}%`, background: D.green }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <p className="mt-4" style={{ color: D.inkFaint, fontSize: 12 }}>
            Adiciona produtos para começares a acompanhar o interesse dos visitantes.
          </p>
        )}
      </div>
    </>
  );
}

function RecoveryCodeRow() {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    if (loading) return;
    setLoading(true);
    try {
      if (!(await confirmSensitiveAction())) return;
      const next = await generateRecoveryCode();
      setCode(next.recoveryCode);
      setCopied(false);
    } catch {
      setCode(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="border-b px-5 py-4" style={{ borderColor: D.borderSoft }}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ background: D.subtle, color: D.ink }}>
          <KeyRound size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p style={{ color: D.ink, fontSize: 13, fontWeight: 700 }}>Código de recuperação</p>
          <p className="mt-1" style={{ color: D.inkFaint, fontSize: 12, lineHeight: 1.45 }}>
            Guarda-o fora da app para recuperares o acesso se esqueceres o PIN.
          </p>
          {code && (
            <div className="mt-3 flex items-center gap-2">
              <code className="min-w-0 flex-1 rounded-xl px-3 py-2 text-center font-mono text-[13px] font-bold tracking-[0.08em]" style={{ background: D.subtle, color: D.ink }}>
                {code}
              </code>
              <button type="button" onClick={() => void handleCopy()} className="shrink-0 rounded-xl px-3 py-2 text-[12px] font-bold" style={{ color: D.green, background: D.greenMuted }}>
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
          )}
          <button type="button" onClick={() => void handleGenerate()} disabled={loading} className="mt-3 text-[12px] font-bold disabled:opacity-50" style={{ color: D.green }}>
            {loading ? "A gerar…" : code ? "Gerar novo código" : "Gerar código"}
          </button>
        </div>
      </div>
    </div>
  );
}

import { getCatalogVisibility } from "../lib/profilePresentation";

// ─── Profile View (main view of the owner panel) ──────────────────────────────
function ProfileView({
  profile, slug, onEdit, onReanalyze, reanalyzing, onLogout, onDeleteAccount, deletingAccount,
}: {
  profile: BusinessProfile;
  slug: string;
  onEdit: (target?: ProfileEditorTarget) => void;
  onReanalyze: (url: string) => void;
  reanalyzing: boolean;
  onLogout: () => void;
  onDeleteAccount: () => void;
  deletingAccount: boolean;
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const featured = profile.offerings.filter((o) => o.featured);
  const previewOfferings = profile.offerings.slice(0, 4);
  const visibility = getCatalogVisibility(profile);
  const isPublic = visibility.isPublic;

  return (
    <div style={{ paddingBottom: 32 }}>

      <OwnerProfileOverview profile={profile} slug={slug} onEdit={onEdit} />

      {/* ─── Destaques ───────────────────────────────────────────────────────── */}
      {featured.length > 0 && (
        <>
          <div className="flex items-center justify-between" style={{ padding: "28px 20px 8px" }}>
            <p style={{ color: D.inkFaint, fontSize: 11, fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase" }}>
              Destaques
            </p>
            <button onClick={() => onEdit("offerings")} style={{ color: D.green, fontSize: 13, fontWeight: 600 }}>Gerir</button>
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
            {isPublic ? (
              <Link href={`/${slug}`}>
                <span style={{ color: D.green, fontSize: 13, fontWeight: 600 }}>Ver tudo</span>
              </Link>
            ) : (
              <button onClick={() => onEdit("catalog")} style={{ color: D.green, fontSize: 13, fontWeight: 600 }}>
                Publicar
              </button>
            )}
          </div>
          <div style={{ background: D.surface, borderTop: `1px solid ${D.border}`, borderBottom: `1px solid ${D.border}` }}>
            {previewOfferings.map((o, i) => (
              <CatalogRow key={i} offering={o} last={i === previewOfferings.length - 1} />
            ))}
            {isPublic ? (
              <ListFooterAction href={`/${slug}`}>Ver catálogo completo</ListFooterAction>
            ) : (
              <button
                onClick={() => onEdit("catalog")}
                className="w-full flex items-center justify-center p-3 text-[13px] font-semibold transition-colors hover:bg-[var(--subtle)]"
                style={{ color: D.green, borderTop: `1px solid ${D.borderSoft}` }}
              >
                Publicar para ver catálogo
              </button>
            )}
          </div>
        </>
      )}

      {/* ─── O teu negócio ───────────────────────────────────────────────────── */}
      <SectionLabel>O teu negócio</SectionLabel>
      <div style={{ background: D.surface, borderTop: `1px solid ${D.border}`, borderBottom: `1px solid ${D.border}` }}>
        {isPublic ? (
          <ToolRow icon={Grid3x3} title="Catálogo"      description="Exibe produtos e serviços"                         href={`/${slug}`} />
        ) : (
          <ActionRow icon={Grid3x3} title="Catálogo" description="Exibe produtos e serviços (Oculto)" onClick={() => onEdit("catalog")} />
        )}
        <ToolRow icon={Zap}     title="Assistente IA" description="Configura o atendimento por voz e chat"           href={`/e/${slug}/dono/assistente`} last />
      </div>

      <SectionLabel>Histórico</SectionLabel>
      <div style={{ background: D.surface, borderTop: `1px solid ${D.border}`, borderBottom: `1px solid ${D.border}` }}>
        <ToolRow icon={Megaphone} title="Campanhas antigas" description="Consulta estados e compromissos anteriores" href={`/e/${slug}/dono/campanhas`} last />
      </div>

      {/* ─── Pagamentos ──────────────────────────────────────────────────────── */}
      <SectionLabel>Pagamentos</SectionLabel>
      <div style={{ background: D.surface, borderTop: `1px solid ${D.border}`, borderBottom: `1px solid ${D.border}` }}>
        <ToolRow icon={ShoppingCart} title="Vendas"   description="Encomendas pagas no catálogo"               href={`/e/${slug}/dono/vendas`} />
        <ToolRow icon={PackageCheck} title="Comércio" description="Pedidos, follow-up e comprovativos"        href={`/e/${slug}/dono/comercio`} />
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

      <SectionLabel>Conta</SectionLabel>
      <div style={{ background: D.surface, borderTop: `1px solid ${D.border}`, borderBottom: `1px solid ${D.border}` }}>
        <RecoveryCodeRow />
        <ActionRow
          icon={LogOut}
          title="Terminar sessão"
          description="Sair deste dispositivo com segurança"
          onClick={onLogout}
          last
        />
        <ActionRow
          icon={Trash2}
          title="Eliminar conta"
          description="Apagar definitivamente o espaço e os dados"
          onClick={() => setDeleteDialogOpen(true)}
          last
        />
      </div>
      <DeleteAccountDialog
        open={deleteDialogOpen}
        loading={deletingAccount}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={onDeleteAccount}
      />
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function Owner() {
  const slug = useBusinessSlug();
  const { logout, user } = useAuth();
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
  const [deletingAccount, setDeletingAccount] = useState(false);
  const onboardingLaunchedRef = useRef(false);

  // Editor states
  const [editorTarget, setEditorTarget] = useState<ProfileEditorTarget | undefined>(undefined);
  const [editorDirty, setEditorDirty] = useState(false);

  const openEditor = useCallback((target?: ProfileEditorTarget) => {
    setEditorTarget(target);
    setEditing(true);
  }, []);

  const closeEditor = useCallback(() => {
    if (saving) return;
    if (editorDirty) {
      if (!window.confirm("Tens alterações não guardadas. Sair sem guardar?")) {
        return;
      }
    }
    setEditing(false);
    setProductFocus(false);
    setEditorTarget(undefined);
    setEditorDirty(false);
  }, [editorDirty, saving]);

  const handleCatalogPatch = useCallback((patch: CatalogSettingsPatch) => {
    setProfile((current) => current ? { ...current, ...patch } : current);
  }, []);

  useEffect(() => {
    if (!editorDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editorDirty]);

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
      const shouldLaunchOnboarding =
        new URLSearchParams(window.location.search).get("onboarding") === "1" &&
        !onboardingLaunchedRef.current;
      const pendingOnboarding = shouldLaunchOnboarding ? readBusinessOnboarding(user?.id) : null;

      if (pendingOnboarding) {
        onboardingLaunchedRef.current = true;
        // New onboarding already analysed the source. Old text/site hand-offs
        // also produce a draft, never an automatic write to the live profile.
        const analysis = pendingOnboarding.analysis ?? await analyzeBusinessOnboarding(
          pendingOnboarding.mode === "site"
            ? { mode: "site", url: pendingOnboarding.value }
            : { mode: "description", description: pendingOnboarding.value },
        );
        saveBusinessOnboarding({ ...pendingOnboarding, userId: user?.id, analysis });
        setDraft({ ...analysis.draft, ...(analysis.sourceUrl ? { websiteUrl: analysis.sourceUrl } : {}) });
        setEditorKey((key) => key + 1);
        setNotice("A IA preparou um rascunho. Confirma os dados, corrige o que for necessário e guarda o perfil.");
        setView("editor");
        openEditor();
        // Retain the draft and onboarding URL until explicit save so reload
        // does not discard the extracted information or run AI again.
        return;
      }

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
  }, [api, user?.id]);

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
          setView("editor"); openEditor();
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
    try {
      if (!(await confirmSensitiveAction())) return;
      await api.startAnalysis(url.trim());
      setView("analyzing");
    }
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
      setView("editor"); openEditor();
    } catch (err) { setError(err instanceof Error ? err.message : "A IA não conseguiu estruturar a descrição"); }
    finally { setBusy(false); }
  };

  const handleSave = async (fields: ProfileDraft & { websiteUrl?: string | null }) => {
    if (!api) return;
    setSaving(true); setError(null);
    try {
      if (!(await confirmSensitiveAction())) return;
      const { profile: p } = await api.saveProfile(fields);
      setProfile(p); setDraft(null);
      if (new URLSearchParams(window.location.search).get("onboarding") === "1") {
        clearBusinessOnboarding();
        window.history.replaceState(null, "", window.location.pathname);
      }
      setNotice("Perfil guardado com sucesso.");
      setEditing(false);
      setProductFocus(false);
      setEditorTarget(undefined);
      setEditorDirty(false);
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível guardar"); }
    finally { setSaving(false); }
  };

  const handleReanalyze = async (u: string) => {
    if (!api) return;
    setReanalyzing(true); setError(null); setNotice(null);
    try {
      if (!(await confirmSensitiveAction())) return;
      await api.startAnalysis(u);
      setView("analyzing");
    }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível iniciar a análise"); }
    finally { setReanalyzing(false); }
  };

  const handleLogout = async () => {
    try {
      await userLogout();
    } finally {
      logout();
      window.location.assign(`${import.meta.env.BASE_URL}login`);
    }
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    setError(null);
    try {
      if (!(await confirmSensitiveAction())) return;
      await deleteUserAccount();
      logout();
      window.location.assign(import.meta.env.BASE_URL);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível eliminar a conta");
      setDeletingAccount(false);
    }
  };

  if (!slug) {
    return (
      <div className="h-full flex items-center justify-center text-sm" style={{ color: D.inkSoft, background: D.bg }}>
        Negócio não encontrado.
      </div>
    );
  }

  return (
    <div className="owner-view-root">

      {!productFocus && (
        <header className="owner-header">
          {!editing ? (
            <>
              <h1 className="owner-header-title">Perfil<span className="hidden min-[400px]:inline"> do negócio</span></h1>
              <Link href={`/e/${slug}`} className="owner-icon-btn flex items-center justify-center rounded-full text-[var(--ink-soft)] hover:bg-[var(--subtle)] hover:text-[var(--ink)]" style={{ width: 44 }} aria-label="Testar chamada" data-testid="link-test-call">
                <Phone size={19} strokeWidth={1.75} />
              </Link>
            </>
          ) : (
            <>
              <button
                onClick={closeEditor}
                disabled={saving}
                className="owner-header-back"
                aria-label="Voltar"
              >
                <X size={24} />
              </button>
              <div className="owner-header-title">Editar perfil</div>
            </>
          )}
        </header>
      )}

      {/* ── Alerts ────────────────────────────────────────────────────────── */}
      {(error || notice) && (
        <div style={{ padding: "12px 20px 0" }}>
          {error && (
            <div
              role="alert"
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
              <button onClick={() => setError(null)} className="flex items-center justify-center p-2 -m-2" aria-label="Fechar"><X size={16} /></button>
            </div>
          )}
          {notice && !error && (
            <div
              role="status"
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
              <button onClick={() => setNotice(null)} className="flex items-center justify-center p-2 -m-2" aria-label="Fechar"><X size={16} /></button>
            </div>
          )}
        </div>
      )}

      <main className={productFocus && editing ? "flex-1 min-h-0 flex flex-col" : "owner-content-scroll"}>

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
            onEdit={openEditor}
            onReanalyze={handleReanalyze}
            reanalyzing={reanalyzing}
            onLogout={() => { void handleLogout(); }}
            onDeleteAccount={() => { void handleDeleteAccount(); }}
            deletingAccount={deletingAccount}
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
              initialTarget={editorTarget}
              onSave={handleSave}
              onReanalyze={handleReanalyze}
              onBack={closeEditor}
              onFocusModeChange={setProductFocus}
              onDirtyChange={setEditorDirty}
              onCatalogSettingsChange={handleCatalogPatch}
            />
          </div>
        )}

      </main>

      {!editing && <OwnerNav />}
    </div>
  );
}
