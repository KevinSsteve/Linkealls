import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import {
  Bell,
  BellOff,
  BellRing,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  GripVertical,
  ImagePlus,
  Link as LinkIcon,
  Loader2,
  MoreHorizontal,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Star,
  Trash2,
} from "lucide-react";
import { AppHeader } from "../../components/app/AppHeader";
import { EditorSection } from "../../components/app/EditorSection";
import { useNotifications } from "../../hooks/useNotifications";
import { useBusinessSlug } from "../../hooks/useBusinessSlug";
import { businessApi, checkSlugAvailability, getStorageObjectUrl, uploadPrivateImage } from "../../lib/api";
import type { BusinessProfile, FaqItem, Offering, ProfileDraft, PublicLink } from "../../lib/api";

interface Props {
  profile: BusinessProfile;
  draft: ProfileDraft | null;
  saving: boolean;
  reanalyzing: boolean;
  onSave: (fields: ProfileDraft & { websiteUrl?: string | null }) => void;
  onReanalyze: (url: string) => void;
  onBack?: () => void;
  onFocusModeChange?: (focused: boolean) => void;
}

const inputClass =
  "w-full min-h-[46px] min-w-0 rounded-[var(--radius-md)] border border-[var(--border-soft)] bg-[var(--surface)] px-3.5 py-2.5 text-[15px] leading-6 text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--green)] focus:outline-none focus:ring-0 focus:shadow-[var(--focus-ring)] transition-colors";
const labelClass =
  "mb-1.5 block text-[12px] font-semibold leading-4 text-[var(--ink-soft)]";

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  testId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: "text" | "tel" | "email" | "url" | "numeric";
  testId: string;
}) {
  return (
    <label className="block min-w-0">
      <span className={labelClass}>{label}</span>
      <input
        className={inputClass}
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        data-testid={testId}
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  testId,
  minHeight = "76px",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  testId: string;
  minHeight?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className={labelClass}>{label}</span>
      <textarea
        className={`${inputClass} resize-y`}
        style={{ minHeight }}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        data-testid={testId}
      />
    </label>
  );
}

function AddButton({ onClick, label = "Adicionar", testId }: { onClick: () => void; label?: string; testId: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[var(--radius-md)] px-2 text-[13px] font-semibold text-[var(--green-dark)] transition-colors hover:bg-[var(--green-light)] active:opacity-60"
      data-testid={testId}
    >
      <Plus size={16} />
      {label}
    </button>
  );
}

function RemoveButton({ onClick, label, testId }: { onClick: () => void; label: string; testId: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] text-[var(--ink-faint)] transition-colors hover:bg-[#FEF2F2] hover:text-[#DC2626] active:opacity-60"
      aria-label={label}
      title={label}
      data-testid={testId}
    >
      <Trash2 size={17} />
    </button>
  );
}

function Toggle({
  enabled,
  onChange,
  label,
  testId,
  disabled = false,
}: {
  enabled: boolean;
  onChange: () => void;
  label: string;
  testId: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className={`relative h-7 w-[50px] shrink-0 rounded-full p-1 transition-colors disabled:opacity-50 ${
        enabled ? "bg-[var(--green)]" : "bg-[#D1D5DB]"
      }`}
      data-testid={testId}
    >
      <span
        className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          enabled ? "translate-x-[22px]" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function EditorIntro({ onBack }: { onBack?: () => void }) {
  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface)] px-5 pb-4 pt-1">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius-md)] text-[14px] font-semibold text-[var(--green-dark)] active:opacity-60"
          data-testid="button-back-to-profile"
        >
          <ChevronRight size={17} className="rotate-180" />
          Voltar ao perfil
        </button>
      )}
    </div>
  );
}

function CatalogSection({ profile, businessSlug }: { profile: BusinessProfile; businessSlug: string }) {
  const api = useMemo(() => businessApi(businessSlug), [businessSlug]);
  const [enabled, setEnabled] = useState(profile.catalogEnabled ?? true);
  const [toggling, setToggling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [slugCopied, setSlugCopied] = useState(false);
  const [slug, setSlug] = useState(profile.catalogSlug ?? "");
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid" | "saved">("idle");
  const [slugSaving, setSlugSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const base = import.meta.env.BASE_URL;
  const genericUrl = `${origin}${base}${businessSlug}`;
  const slugUrl = /^[a-z0-9-]{3,60}$/.test(slug) ? `${origin}${base}c/${slug}` : null;
  const productCount = profile.offerings?.length ?? 0;
  const isReady = Boolean(profile.name?.trim());

  useEffect(() => {
    const value = slug.trim().toLowerCase();
    if (!value) {
      setSlugStatus("idle");
      return;
    }
    if (!/^[a-z0-9-]{3,60}$/.test(value)) {
      setSlugStatus("invalid");
      return;
    }
    if (value === (profile.catalogSlug ?? "")) {
      setSlugStatus("idle");
      return;
    }
    setSlugStatus("checking");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await checkSlugAvailability(value);
        setSlugStatus(result.available ? "available" : "taken");
      } catch {
        setSlugStatus("idle");
      }
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [profile.catalogSlug, slug]);

  const copy = async (value: string, setCopiedFlag: (value: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedFlag(true);
      setTimeout(() => setCopiedFlag(false), 2000);
    } catch {
      // Clipboard access is optional in some mobile browsers.
    }
  };

  const saveSlug = async () => {
    setSlugSaving(true);
    try {
      await api.saveCatalogSlug(slug.trim().toLowerCase() || null);
      setSlugStatus("saved");
      setTimeout(() => setSlugStatus("idle"), 2500);
    } catch {
      setSlugStatus("idle");
    } finally {
      setSlugSaving(false);
    }
  };

  const hint = {
    checking: "A verificar…",
    available: "Disponível",
    taken: "Já está em uso",
    invalid: "Usa apenas letras, números e hífens (mín. 3)",
    saved: "Guardado",
  }[slugStatus as "checking" | "available" | "taken" | "invalid" | "saved"];

  return (
    <EditorSection
      id="catalog"
      title="Catálogo público"
      description="Define onde os clientes podem ver os teus produtos."
      collapsible
      defaultOpen={false}
      status={<span className={`app-status-badge ${enabled && isReady ? "is-success" : "is-neutral"}`}>{!enabled ? "Inactivo" : !isReady ? "Incompleto" : productCount === 0 ? "Sem produtos" : "Activo"}</span>}
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-soft)] pb-4">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-[var(--ink)]">Estado do catálogo</p>
            <p className="mt-1 break-words text-[13px] text-[var(--ink-soft)]">
              {!enabled
                ? "O catálogo está escondido dos visitantes"
                : !isReady
                  ? "Preenche o nome do negócio para publicar"
                  : productCount === 0
                    ? "Catálogo visível, mas ainda sem produtos"
                    : `${productCount} produto${productCount === 1 ? "" : "s"} publicado${productCount === 1 ? "" : "s"}`}
            </p>
          </div>
          <Toggle
            enabled={enabled}
            onChange={async () => {
              const next = !enabled;
              setToggling(true);
              try {
                await api.toggleCatalog(next);
                setEnabled(next);
              } catch {
                // Keep the current state when the server rejects the change.
              } finally {
                setToggling(false);
              }
            }}
            disabled={toggling}
            label={enabled ? "Desactivar catálogo" : "Activar catálogo"}
            testId="toggle-catalog"
          />
        </div>

        <div className="min-w-0">
          <p className={labelClass}>Link público do catálogo</p>
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1 rounded-[var(--radius-md)] bg-[var(--subtle)] px-3 py-2.5">
              <span className="block break-all font-mono text-[12px] leading-5 text-[var(--ink-soft)]" data-testid="text-catalog-url">{genericUrl}</span>
            </div>
            <button type="button" onClick={() => copy(genericUrl, setCopied)} className="app-icon-button" aria-label="Copiar link do catálogo" data-testid="button-copy-catalog-link">
              {copied ? <Check size={17} className="text-[var(--green)]" /> : <Copy size={17} />}
            </button>
            <a href={genericUrl} target="_blank" rel="noopener noreferrer" className="app-icon-button" aria-label="Abrir catálogo" data-testid="link-open-catalog">
              <ExternalLink size={17} />
            </a>
          </div>
        </div>

        <div className="min-w-0">
          <p className={labelClass}>Link alternativo personalizado</p>
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--subtle)] px-3">
              <span className="shrink-0 font-mono text-[12px] text-[var(--ink-faint)]">{base}c/</span>
              <input
                className="min-w-0 flex-1 bg-transparent px-1 py-2.5 font-mono text-[13px] text-[var(--ink)] outline-none"
                value={slug}
                onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                maxLength={60}
                placeholder="nome-do-negocio"
                spellCheck={false}
                data-testid="input-catalog-slug"
              />
            </div>
            <button
              type="button"
              onClick={saveSlug}
              disabled={slugSaving || !(slugStatus === "available" || (slug.trim() === "" && Boolean(profile.catalogSlug)))}
              className="app-icon-button text-[var(--green-dark)] disabled:opacity-40"
              aria-label="Guardar link personalizado"
              data-testid="button-save-catalog-slug"
            >
              {slugSaving ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}
            </button>
          </div>
          {hint && <p className={`mt-1.5 text-[12px] ${slugStatus === "taken" ? "text-[#DC2626]" : "text-[var(--ink-soft)]"}`} data-testid="status-catalog-slug">{hint}</p>}
          {slugUrl && (
            <div className="mt-2 flex min-w-0 items-center gap-2">
              <div className="min-w-0 flex-1 rounded-[var(--radius-md)] bg-[var(--green-light)] px-3 py-2.5">
                <span className="flex items-center gap-1.5 break-all font-mono text-[12px] leading-5 text-[var(--green-dark)]"><LinkIcon size={12} className="shrink-0" />{slugUrl}</span>
              </div>
              <button type="button" onClick={() => copy(slugUrl, setSlugCopied)} className="app-icon-button text-[var(--green-dark)]" aria-label="Copiar link personalizado" data-testid="button-copy-custom-catalog-link">
                {slugCopied ? <Check size={17} /> : <Copy size={17} />}
              </button>
            </div>
          )}
        </div>
      </div>
    </EditorSection>
  );
}

function NotificationsSection({ slug }: { slug: string }) {
  const { status, subscribe, unsubscribe } = useNotifications(slug);
  if (status === "unsupported") return null;
  const loading = status === "loading";
  const subscribed = status === "subscribed";
  const denied = status === "denied";

  return (
    <EditorSection
      id="notifications"
      title="Notificações no telemóvel"
      description={denied ? "Activa as notificações nas definições do browser para receber alertas essenciais." : subscribed ? "Receberás alertas de contactos qualificados, pedidos e pagamentos." : "Recebe alertas de contactos qualificados, pedidos e pagamentos."}
      collapsible
      defaultOpen={false}
      action={denied ? <BellOff size={19} className="mt-1 text-[var(--ink-faint)]" /> : <Toggle enabled={subscribed} onChange={subscribed ? unsubscribe : subscribe} disabled={loading} label={subscribed ? "Desactivar notificações" : "Activar notificações"} testId="toggle-notifications" />}
    >
      <div className="flex items-center gap-2 text-[12px] text-[var(--ink-soft)]">
        {loading ? <Loader2 size={14} className="animate-spin" /> : subscribed ? <BellRing size={14} className="text-[var(--green)]" /> : <Bell size={14} />}
        <span data-testid="status-notifications">{loading ? "A actualizar…" : subscribed ? "Notificações activadas" : "Notificações desactivadas"}</span>
      </div>
    </EditorSection>
  );
}

function ImageUploader({ offering, businessSlug, onChange }: { offering: Offering; businessSlug: string; onChange: (offering: Offering) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const objectPath = await uploadPrivateImage(file, businessSlug);
      onChange({ ...offering, imageUrl: getStorageObjectUrl(objectPath) });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Falha no upload");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [businessSlug, offering, onChange]);

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-md)] bg-[var(--subtle)]">
        {offering.imageUrl ? <img src={offering.imageUrl} alt={offering.name || "Produto"} className="h-full w-full object-cover" data-testid="img-product-editor" /> : <ImagePlus size={24} className="text-[var(--ink-faint)]" />}
        {uploading && <div className="absolute inset-0 flex items-center justify-center bg-white/80"><Loader2 size={19} className="animate-spin text-[var(--green)]" /></div>}
      </div>
      <div className="relative min-w-0">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="inline-flex min-h-[40px] items-center gap-2 rounded-[var(--radius-md)] px-2 text-[14px] font-semibold text-[var(--green-dark)] hover:bg-[var(--green-light)] disabled:opacity-50" data-testid="button-product-photo">
            <Camera size={16} /> {offering.imageUrl ? "Alterar foto" : "Adicionar foto"}
          </button>
          {offering.imageUrl && (
            <button type="button" onClick={() => setMenuOpen((value) => !value)} className="app-icon-button h-10 w-10" aria-label="Mais acções da foto" aria-expanded={menuOpen} data-testid="button-product-photo-menu">
              <MoreHorizontal size={17} />
            </button>
          )}
        </div>
        {menuOpen && offering.imageUrl && (
          <div className="absolute left-0 top-11 z-10 min-w-[150px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[var(--shadow-soft)]" data-testid="menu-product-photo-actions">
            <button type="button" onClick={() => { onChange({ ...offering, imageUrl: undefined }); setMenuOpen(false); }} className="flex min-h-[40px] w-full items-center px-3 text-left text-[13px] font-semibold text-[#B91C1C] hover:bg-[#FEF2F2]" data-testid="button-remove-product-photo">
              Remover foto
            </button>
          </div>
        )}
        {error && <p className="mt-1 break-words text-[12px] text-[#DC2626]" data-testid="error-product-photo">{error}</p>}
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pick} data-testid="input-product-photo" />
    </div>
  );
}

function AvatarUploader({
  avatarUrl,
  businessSlug,
  onChange,
}: {
  avatarUrl: string | null;
  businessSlug: string;
  onChange: (url: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const objectPath = await uploadPrivateImage(file, businessSlug);
       onChange(objectPath);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Falha no upload");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [businessSlug, onChange]);

  return (
    <div className="flex items-center gap-4 rounded-[var(--radius-lg)] border border-[var(--border-soft)] bg-[var(--subtle)] p-3">
      <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--green-light)] text-[var(--green-dark)]">
        {avatarUrl ? (
          <img src={getStorageObjectUrl(avatarUrl)} alt="Foto de perfil" className="h-full w-full object-cover" />
        ) : (
          <Camera size={24} />
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80">
            <Loader2 size={20} className="animate-spin text-[var(--green)]" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-[var(--ink)]">Foto de perfil</p>
        <p className="mt-1 text-[12px] leading-5 text-[var(--ink-soft)]">Aparece no teu perfil e no catálogo público.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex min-h-[38px] items-center gap-2 rounded-[var(--radius-md)] bg-[var(--green-light)] px-3 text-[13px] font-semibold text-[var(--green-dark)] hover:bg-[var(--green)] hover:text-white disabled:opacity-50"
            data-testid="button-profile-photo"
          >
            <Camera size={15} /> {avatarUrl ? "Alterar foto" : "Adicionar foto"}
          </button>
          {avatarUrl && (
            <button
              type="button"
              onClick={() => { onChange(null); setError(null); }}
              className="inline-flex min-h-[38px] items-center rounded-[var(--radius-md)] px-2 text-[12px] font-semibold text-[#B91C1C] hover:bg-[#FEF2F2]"
              data-testid="button-remove-profile-photo"
            >
              Remover
            </button>
          )}
        </div>
        {error && <p className="mt-1.5 text-[12px] text-[#DC2626]" data-testid="error-profile-photo">{error}</p>}
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pick} data-testid="input-profile-photo" />
    </div>
  );
}

function ProductFocusEditor({
  mode,
  offering,
  index,
  featuredCount,
  onCommit,
  onDelete,
  onCancel,
  businessSlug,
}: {
  mode: "add" | "edit";
  offering: Offering;
  index: number;
  featuredCount: number;
  onCommit: (offering: Offering) => void;
  onDelete: () => void;
  onCancel: () => void;
  businessSlug: string;
}) {
  const [draft, setDraft] = useState<Offering>(offering);
  const canFeature = offering.featured || featuredCount < 3;
  const update = (patch: Partial<Offering>) => setDraft((current) => ({ ...current, ...patch }));
  const remove = () => {
    if (window.confirm("Eliminar produto?\n\nEste produto será removido do teu catálogo.")) onDelete();
  };

  return (
    <div className="min-h-full min-w-0 bg-[var(--bg)]" data-testid={`product-focus-editor-${mode}-${index}`}>
      <AppHeader
        title={mode === "add" ? "Adicionar produto" : "Editar produto"}
        onBack={onCancel}
        actions={
          <button
            type="button"
            onClick={() => draft.name.trim() && onCommit(draft)}
            disabled={!draft.name.trim()}
            className="min-h-[40px] rounded-[var(--radius-md)] px-2 text-[13px] font-semibold text-[var(--green-dark)] transition-colors hover:bg-[var(--green-light)] disabled:opacity-40"
            data-testid="button-save-product"
          >
            {mode === "add" ? "Adicionar" : "Guardar"}
          </button>
        }
      />
      <div className="min-w-0 space-y-5 px-5 pb-8 pt-5">
        <ImageUploader offering={draft} businessSlug={businessSlug} onChange={setDraft} />
        <Field label="Nome do produto" value={draft.name} onChange={(name) => update({ name })} placeholder="Ex.: Disjuntor 4P 80A" testId="input-focus-product-name" />
        <Field label="Preço" value={draft.price} onChange={(price) => update({ price })} placeholder="Ex.: 45.000 Kz, sob consulta" testId="input-focus-product-price" />
        <TextAreaField label="Descrição" value={draft.description} onChange={(description) => update({ description })} placeholder="Explica este produto em poucas palavras" testId="input-focus-product-description" minHeight="88px" />
        <div className="flex items-center justify-between gap-3 border-t border-[var(--border-soft)] pt-4">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-[var(--ink)]">Produto em destaque</p>
          </div>
          <Toggle enabled={Boolean(draft.featured)} onChange={() => update({ featured: !draft.featured })} disabled={!draft.featured && !canFeature} label="Marcar produto em destaque" testId="toggle-focus-product-featured" />
        </div>
        {mode === "edit" && (
          <button type="button" onClick={remove} className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius-md)] px-2 text-[13px] font-semibold text-[#B91C1C] hover:bg-[#FEF2F2]" data-testid="button-remove-focus-product">
            <Trash2 size={16} /> Eliminar produto
          </button>
        )}
      </div>
    </div>
  );
}

function OfferingsSection({
  offerings,
  setOfferings,
  onAdd,
  onEdit,
}: {
  offerings: Offering[];
  setOfferings: Dispatch<SetStateAction<Offering[]>>;
  onAdd: () => void;
  onEdit: (index: number) => void;
}) {
  const [reorderMode, setReorderMode] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const drop = (targetIndex: number) => {
    const sourceIndex = dragIndex.current;
    if (sourceIndex === null || sourceIndex === targetIndex) return;
    setOfferings((current) => {
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      if (moved) next.splice(targetIndex, 0, moved);
      return next.map((item, itemIndex) => ({ ...item, sortOrder: itemIndex }));
    });
    dragIndex.current = null;
  };

  return (
    <EditorSection
      id="offerings"
      title="Produtos & serviços"
      description={offerings.length ? `${offerings.length} produto${offerings.length === 1 ? "" : "s"} no catálogo` : "Adiciona o que o teu negócio vende."}
      collapsible
      defaultOpen={false}
      action={<AddButton onClick={onAdd} label="Adicionar" testId="button-add-product" />}
    >
      {offerings.length > 1 && <div className="flex justify-end border-b border-[var(--border-soft)] pb-1"><button type="button" onClick={() => setReorderMode((value) => !value)} className="min-h-[40px] rounded-[var(--radius-md)] px-2 text-[12px] font-semibold text-[var(--ink-soft)] hover:bg-[var(--subtle)]" data-testid="button-toggle-product-reorder">{reorderMode ? "Concluído" : "Reordenar"}</button></div>}
      {offerings.length === 0 ? (
        <div className="py-6 text-center">
          <ImagePlus size={22} className="mx-auto text-[var(--ink-faint)]" />
          <p className="mt-2 text-[13px] text-[var(--ink-soft)]">Ainda não tens produtos no catálogo.</p>
          <AddButton onClick={onAdd} label="Adicionar produto" testId="button-add-first-product" />
        </div>
      ) : (
        <div className="mt-1">
          {offerings.map((offering, index) => (
            <div key={`${index}-${offering.name}`} draggable={reorderMode} onDragStart={() => { dragIndex.current = index; }} onDragOver={(event) => event.preventDefault()} onDrop={() => drop(index)} className="border-b border-[var(--border-soft)] last:border-0" data-testid={`product-container-${index}`}>
              <button type="button" onClick={() => !reorderMode && onEdit(index)} className="flex min-h-[64px] w-full min-w-0 items-center gap-3 py-2 text-left active:opacity-60" aria-label={`Editar ${offering.name || "produto"}`} data-testid={`button-edit-product-${index}`}>
                {reorderMode && <GripVertical size={17} className="shrink-0 text-[var(--ink-faint)]" />}
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-md)] bg-[var(--subtle)]">
                  {offering.imageUrl ? <img src={offering.imageUrl} alt="" className="h-full w-full object-cover" /> : <ImagePlus size={18} className="text-[var(--ink-faint)]" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 break-words text-[14px] font-semibold leading-5 text-[var(--ink)]" data-testid={`text-product-name-${index}`}>{offering.name || "Produto sem nome"}</p>
                  <p className="mt-0.5 truncate text-[13px] leading-5 text-[var(--ink-soft)]" data-testid={`text-product-price-${index}`}>{offering.price || "Preço por definir"}</p>
                </div>
                {offering.featured && <Star size={14} className="shrink-0 fill-[#D97706] text-[#D97706]" />}
                {!reorderMode && <ChevronRight size={18} className="shrink-0 text-[var(--ink-faint)]" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </EditorSection>
  );
}

function CompactListSection({ id, title, description, items, onChange, onRemove, onAdd, placeholder }: { id: string; title: string; description: string; items: string[]; onChange: (index: number, value: string) => void; onRemove: (index: number) => void; onAdd: () => void; placeholder: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(items.length ? 0 : null);
  const [sectionOpen, setSectionOpen] = useState(false);
  const addItem = () => {
    onAdd();
    setSectionOpen(true);
    setOpenIndex(items.length);
  };
  return (
    <EditorSection id={id} title={title} description={description} open={sectionOpen} onToggle={() => setSectionOpen((value) => !value)} action={<AddButton onClick={addItem} testId={`button-add-${id}`} />}>
      {items.length === 0 ? (
        <div className="py-4">
          <p className="text-[13px] text-[var(--ink-soft)]">Ainda não adicionaste nenhum item.</p>
           <AddButton
              onClick={addItem}
             label={id === "differentials" ? "Adicionar diferencial" : "Adicionar objetivo"}
             testId={`button-add-first-${id}`}
           />
        </div>
      ) : (
        <div className="divide-y divide-[var(--border-soft)]">
          {items.map((item, index) => (
            <div key={index} className="min-w-0 py-1" data-testid={`row-${id}-${index}`}>
              <button type="button" onClick={() => setOpenIndex(openIndex === index ? null : index)} className="flex min-h-[52px] w-full min-w-0 items-center gap-3 text-left" data-testid={`button-edit-${id}-${index}`}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--green-light)] text-[12px] font-semibold text-[var(--green-dark)]">{id === "differentials" ? <Check size={13} strokeWidth={2.5} /> : index + 1}</span>
                <span className="min-w-0 flex-1 break-words text-[14px] leading-5 text-[var(--ink)]">{item || placeholder}</span>
                <ChevronDown size={16} className={`shrink-0 text-[var(--ink-faint)] transition-transform ${openIndex === index ? "" : "-rotate-90"}`} />
              </button>
              {openIndex === index && (
                <div className="flex items-start gap-2 pb-3 pl-9">
                  <input className={inputClass} autoFocus={!item} value={item} placeholder={placeholder} onChange={(event) => onChange(index, event.target.value)} data-testid={`input-${id}-${index}`} />
                  <RemoveButton
                    onClick={() => {
                      if (window.confirm(`Eliminar ${title.toLowerCase()} ${index + 1}?`)) {
                        onRemove(index);
                        setOpenIndex(null);
                      }
                    }}
                    label={`Eliminar ${title.toLowerCase()} ${index + 1}`}
                    testId={`button-remove-${id}-${index}`}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </EditorSection>
  );
}

function PublicLinksSection({ links, setLinks }: { links: PublicLink[]; setLinks: Dispatch<SetStateAction<PublicLink[]>> }) {
  const [openIndex, setOpenIndex] = useState<number | null>(links.length ? 0 : null);
  const [sectionOpen, setSectionOpen] = useState(false);

  const add = () => {
    setLinks((items) => [...items, { title: "", description: "", url: "" }]);
    setOpenIndex(links.length);
    setSectionOpen(true);
  };

  const update = (index: number, patch: Partial<PublicLink>) => {
    setLinks((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  const remove = (index: number) => {
    if (!window.confirm(`Eliminar o link público ${index + 1}?`)) return;
    setLinks((items) => items.filter((_, itemIndex) => itemIndex !== index));
    setOpenIndex(null);
  };

  const move = (index: number, direction: -1 | 1) => {
    setLinks((items) => {
      const target = index + direction;
      if (target < 0 || target >= items.length) return items;
      const next = [...items];
      const [moved] = next.splice(index, 1);
      if (moved) next.splice(target, 0, moved);
      return next;
    });
    setOpenIndex(index + direction);
  };

  return (
    <EditorSection
      id="public-links"
      title="Links públicos"
      description="Adiciona os destinos que queres mostrar na aba Links do teu perfil."
      open={sectionOpen}
      onToggle={() => setSectionOpen((value) => !value)}
      action={<AddButton onClick={add} label="Adicionar" testId="button-add-public-links" />}
    >
      {links.length === 0 ? (
        <div className="py-4">
          <p className="text-[13px] text-[var(--ink-soft)]">Ainda não adicionaste nenhum link público.</p>
          <AddButton onClick={add} label="Adicionar primeiro link" testId="button-add-first-public-link" />
        </div>
      ) : (
        <div className="divide-y divide-[var(--border-soft)]">
          {links.map((link, index) => (
            <div key={`${index}-${link.url}`} className="min-w-0 py-1" data-testid={`row-public-link-${index}`}>
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpenIndex(openIndex === index ? null : index)}
                  className="flex min-h-[58px] min-w-0 flex-1 items-center gap-3 text-left"
                  data-testid={`button-edit-public-link-${index}`}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--green-light)] text-[12px] font-semibold text-[var(--green-dark)]">{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[14px] font-medium leading-5 text-[var(--ink)]">{link.title || "Link sem título"}</span>
                    <span className="block truncate text-[12px] leading-5 text-[var(--ink-soft)]">{link.url || "Adiciona um endereço web"}</span>
                  </span>
                  <ChevronDown size={16} className={`shrink-0 text-[var(--ink-faint)] transition-transform ${openIndex === index ? "" : "-rotate-90"}`} />
                </button>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="min-h-[40px] min-w-[32px] rounded-[var(--radius-md)] text-[var(--ink-soft)] hover:bg-[var(--subtle)] disabled:opacity-30" aria-label={`Mover link ${index + 1} para cima`} data-testid={`button-move-public-link-up-${index}`}>↑</button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === links.length - 1} className="min-h-[40px] min-w-[32px] rounded-[var(--radius-md)] text-[var(--ink-soft)] hover:bg-[var(--subtle)] disabled:opacity-30" aria-label={`Mover link ${index + 1} para baixo`} data-testid={`button-move-public-link-down-${index}`}>↓</button>
                </div>
              </div>
              {openIndex === index && (
                <div className="space-y-3 pb-4 pl-9">
                  <Field label="Título" value={link.title} onChange={(title) => update(index, { title })} placeholder="Ex.: Instagram" testId={`input-public-link-title-${index}`} />
                  <TextAreaField label="Descrição (opcional)" value={link.description} onChange={(description) => update(index, { description })} placeholder="Ex.: Vê as novidades e bastidores." testId={`input-public-link-description-${index}`} minHeight="64px" />
                  <Field label="URL" value={link.url} onChange={(url) => update(index, { url })} placeholder="https://instagram.com/o-teu-negocio" type="url" inputMode="url" testId={`input-public-link-url-${index}`} />
                  <p className="text-[12px] leading-5 text-[var(--ink-soft)]">Usa um endereço completo que comece por <strong>https://</strong> ou <strong>http://</strong>.</p>
                  <RemoveButton onClick={() => remove(index)} label={`Eliminar link público ${index + 1}`} testId={`button-remove-public-link-${index}`} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </EditorSection>
  );
}

function FaqSection({ faq, setFaq }: { faq: FaqItem[]; setFaq: Dispatch<SetStateAction<FaqItem[]>> }) {
  const [openIndex, setOpenIndex] = useState<number | null>(faq.length ? 0 : null);
  const [sectionOpen, setSectionOpen] = useState(false);
  const add = () => {
    setFaq((items) => [...items, { question: "", answer: "" }]);
    setOpenIndex(faq.length);
    setSectionOpen(true);
  };
  const remove = (index: number) => {
    if (!window.confirm("Eliminar esta pergunta frequente?")) return;
    setFaq((items) => items.filter((_, itemIndex) => itemIndex !== index));
    setOpenIndex(null);
  };

  return (
    <EditorSection id="faq" title="Perguntas frequentes" description="Respostas prontas que o assistente pode usar nas chamadas." open={sectionOpen} onToggle={() => setSectionOpen((value) => !value)} action={<AddButton onClick={add} testId="button-add-faq" />}>
      {faq.length === 0 ? (
        <div className="py-4">
          <p className="text-[13px] text-[var(--ink-soft)]">Ainda não adicionaste nenhuma pergunta.</p>
          <AddButton onClick={add} label="Adicionar pergunta" testId="button-add-first-faq" />
        </div>
      ) : (
        <div className="divide-y divide-[var(--border-soft)]">
          {faq.map((item, index) => (
            <div key={index} className="min-w-0 py-1" data-testid={`row-faq-${index}`}>
              <button type="button" onClick={() => setOpenIndex(openIndex === index ? null : index)} className="flex min-h-[58px] w-full min-w-0 items-center gap-3 text-left" data-testid={`button-edit-faq-${index}`}>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[14px] font-medium leading-5 text-[var(--ink)]">{item.question || "Pergunta sem título"}</p>
                  {item.answer && openIndex !== index && <p className="mt-0.5 line-clamp-1 break-words text-[12px] leading-5 text-[var(--ink-soft)]">{item.answer}</p>}
                </div>
                <ChevronDown size={16} className={`shrink-0 text-[var(--ink-faint)] transition-transform ${openIndex === index ? "" : "-rotate-90"}`} />
              </button>
              {openIndex === index && (
                <div className="space-y-3 pb-4">
                  <Field label="Pergunta" value={item.question} onChange={(question) => setFaq((items) => items.map((current, itemIndex) => itemIndex === index ? { ...current, question } : current))} placeholder="Ex.: Qual é o prazo de entrega?" testId={`input-faq-question-${index}`} />
                  <TextAreaField label="Resposta" value={item.answer} onChange={(answer) => setFaq((items) => items.map((current, itemIndex) => itemIndex === index ? { ...current, answer } : current))} placeholder="Escreve a resposta que a IA deve dar." testId={`input-faq-answer-${index}`} minHeight="70px" />
                  <RemoveButton onClick={() => remove(index)} label={`Eliminar pergunta ${index + 1}`} testId={`button-remove-faq-${index}`} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </EditorSection>
  );
}

export function ProfileEditor({ profile, draft, saving, reanalyzing, onSave, onReanalyze, onBack, onFocusModeChange }: Props) {
  const slug = useBusinessSlug();
  const init = <K extends keyof ProfileDraft>(key: K, fallback: NonNullable<ProfileDraft[K]>) =>
    (draft?.[key] ?? (profile[key as keyof BusinessProfile] as ProfileDraft[K]) ?? fallback) as NonNullable<ProfileDraft[K]>;

  const [name, setName] = useState<string>(init("name", ""));
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatarUrl ?? null);
  const [sector, setSector] = useState<string>(init("sector", ""));
  const [description, setDescription] = useState<string>(init("description", ""));
  const [targetAudience, setTargetAudience] = useState<string>(init("targetAudience", ""));
  const [toneOfVoice, setToneOfVoice] = useState<string>(init("toneOfVoice", ""));
  const [differentials, setDifferentials] = useState<string[]>(init("differentials", []));
  const [publicLinks, setPublicLinks] = useState<PublicLink[]>(init("publicLinks", []));
  const [offerings, setOfferings] = useState<Offering[]>(init("offerings", []));
  const [faq, setFaq] = useState<FaqItem[]>(init("faq", []));
  const [qualificationGoals, setQualificationGoals] = useState<string[]>(init("qualificationGoals", []));
  const [siteUrl, setSiteUrl] = useState(profile.websiteUrl ?? "");
  const [address, setAddress] = useState(profile.address ?? "");
  const [hours, setHours] = useState(profile.hours ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [email, setEmail] = useState(profile.email ?? "");
  const [openIdentity, setOpenIdentity] = useState(true);
  const [openContact, setOpenContact] = useState(false);
  const [focusedProduct, setFocusedProduct] = useState<{ mode: "add" | "edit"; index: number; offering: Offering } | null>(null);
  const listScrollTop = useRef<number | null>(null);

  useEffect(() => {
    onFocusModeChange?.(focusedProduct !== null);
  }, [focusedProduct, onFocusModeChange]);

  const currentValue = useMemo(() => JSON.stringify({ name, avatarUrl, sector, description, targetAudience, toneOfVoice, differentials, publicLinks, offerings, faq, qualificationGoals, siteUrl, address, hours, phone, email }), [address, avatarUrl, description, differentials, email, faq, hours, name, offerings, phone, publicLinks, qualificationGoals, sector, siteUrl, targetAudience, toneOfVoice]);
  const initialValue = useMemo(() => JSON.stringify({ name: init("name", ""), avatarUrl: profile.avatarUrl ?? null, sector: init("sector", ""), description: init("description", ""), targetAudience: init("targetAudience", ""), toneOfVoice: init("toneOfVoice", ""), differentials: init("differentials", []), publicLinks: init("publicLinks", []), offerings: init("offerings", []), faq: init("faq", []), qualificationGoals: init("qualificationGoals", []), siteUrl: profile.websiteUrl ?? "", address: profile.address ?? "", hours: profile.hours ?? "", phone: profile.phone ?? "", email: profile.email ?? "" }), [draft, profile]);
  const dirty = currentValue !== initialValue;
  const hasInvalidPublicLink = publicLinks.some((link) => !link.title.trim() || !/^https?:\/\/\S+/i.test(link.url.trim()));

  const beginProductFocus = () => {
    const scrollContainer = document.querySelector("main");
    listScrollTop.current = scrollContainer instanceof HTMLElement ? scrollContainer.scrollTop : null;
    if (scrollContainer instanceof HTMLElement) scrollContainer.scrollTop = 0;
    onFocusModeChange?.(true);
  };

  const exitProductFocus = () => {
    setFocusedProduct(null);
    onFocusModeChange?.(false);
    const savedScrollTop = listScrollTop.current;
    if (savedScrollTop !== null) {
      requestAnimationFrame(() => {
        const scrollContainer = document.querySelector("main");
        if (scrollContainer instanceof HTMLElement) scrollContainer.scrollTop = savedScrollTop;
      });
    }
  };

  const save = () => onSave({
    name: name.trim(),
    avatarUrl,
    sector: sector.trim(),
    description: description.trim(),
    targetAudience: targetAudience.trim(),
    toneOfVoice: toneOfVoice.trim(),
    differentials: differentials.map((item) => item.trim()).filter(Boolean),
    publicLinks: publicLinks
      .filter((item) => item.title.trim() && item.url.trim())
      .map((item) => ({ title: item.title.trim(), description: item.description.trim(), url: item.url.trim() })),
    offerings: offerings.filter((item) => item.name.trim()),
    faq: faq.filter((item) => item.question.trim()),
    qualificationGoals: qualificationGoals.map((item) => item.trim()).filter(Boolean),
    websiteUrl: siteUrl.trim() || null,
    address: address.trim() || null,
    hours: hours.trim() || null,
    phone: phone.trim() || null,
    email: email.trim() || null,
  });

  const openNewProduct = () => {
    beginProductFocus();
    setFocusedProduct({
      mode: "add",
      index: offerings.length,
      offering: { name: "", description: "", price: "", sortOrder: offerings.length },
    });
  };

  const openProduct = (index: number) => {
    const offering = offerings[index];
    if (offering) {
      beginProductFocus();
      setFocusedProduct({ mode: "edit", index, offering });
    }
  };

  const commitProduct = (offering: Offering) => {
    if (!focusedProduct) return;
    if (focusedProduct.mode === "add") {
      setOfferings((current) => [...current, { ...offering, sortOrder: current.length }]);
    } else {
      setOfferings((current) => current.map((item, index) => index === focusedProduct.index ? offering : item));
    }
    exitProductFocus();
  };

  const deleteFocusedProduct = () => {
    if (!focusedProduct || focusedProduct.mode !== "edit") return;
    setOfferings((current) => current.filter((_, index) => index !== focusedProduct.index).map((item, index) => ({ ...item, sortOrder: index })));
    exitProductFocus();
  };

  if (focusedProduct) {
    return (
      <ProductFocusEditor
        mode={focusedProduct.mode}
        offering={focusedProduct.offering}
        index={focusedProduct.index}
        featuredCount={offerings.filter((item) => item.featured).length}
        onCommit={commitProduct}
        onDelete={deleteFocusedProduct}
        onCancel={exitProductFocus}
        businessSlug={slug ?? ""}
      />
    );
  }

  return (
    <div className={`min-w-0 overflow-x-hidden bg-[var(--bg)] ${dirty ? "pb-24" : ""}`}>
      <EditorIntro onBack={onBack} />

      <EditorSection id="identity" title="Identidade" description="A base que o assistente usa para apresentar o teu negócio." open={openIdentity} onToggle={() => setOpenIdentity((value) => !value)}>
        <div className="space-y-4">
          {slug && <AvatarUploader avatarUrl={avatarUrl} businessSlug={slug} onChange={setAvatarUrl} />}
          <Field label="Nome do negócio" value={name} onChange={setName} placeholder="Ex.: Óptica Luanda Premium" testId="input-business-name" />
          <Field label="Setor" value={sector} onChange={setSector} placeholder="Ex.: Óptica e saúde visual" testId="input-business-sector" />
          <TextAreaField label="Descrição" value={description} onChange={setDescription} placeholder="O que fazes, para quem e onde?" testId="input-business-description" minHeight="128px" />
          <Field label="Público-alvo" value={targetAudience} onChange={setTargetAudience} placeholder="Quem são os clientes ideais?" testId="input-business-audience" />
          <Field label="Tom de voz" value={toneOfVoice} onChange={setToneOfVoice} placeholder="Ex.: profissional e acolhedor" testId="input-business-tone" />
        </div>
      </EditorSection>

      <EditorSection id="contact" title="Contacto & localização" description="Onde e como os clientes podem encontrar o negócio." open={openContact} onToggle={() => setOpenContact((value) => !value)}>
        <div className="space-y-4">
          <Field label="Endereço" value={address} onChange={setAddress} placeholder="Ex.: Rua da Missão 42, Luanda" testId="input-business-address" />
          <Field label="Horário" value={hours} onChange={setHours} placeholder="Ex.: Seg–Sex 08:00–17:00" testId="input-business-hours" />
          <Field label="Telemóvel / WhatsApp" value={phone} onChange={setPhone} placeholder="Ex.: +244 923 456 789" inputMode="tel" testId="input-business-phone" />
          <Field label="E-mail" value={email} onChange={setEmail} placeholder="Ex.: geral@meusite.ao" inputMode="email" testId="input-business-email" />
        </div>
      </EditorSection>

      <PublicLinksSection links={publicLinks} setLinks={setPublicLinks} />
      <OfferingsSection offerings={offerings} setOfferings={setOfferings} onAdd={openNewProduct} onEdit={openProduct} />
      <CompactListSection id="differentials" title="Diferenciais" description="O que torna este negócio uma escolha melhor." items={differentials} onAdd={() => setDifferentials((items) => [...items, ""])} onChange={(index, value) => setDifferentials((items) => items.map((item, itemIndex) => itemIndex === index ? value : item))} onRemove={(index) => setDifferentials((items) => items.filter((_, itemIndex) => itemIndex !== index))} placeholder="Ex.: Entrega em 24h em Luanda" />
      <FaqSection faq={faq} setFaq={setFaq} />
      <CompactListSection id="qualification" title="Qualificação de leads" description="Perguntas que o assistente usa para perceber a necessidade do cliente." items={qualificationGoals} onAdd={() => setQualificationGoals((items) => [...items, ""])} onChange={(index, value) => setQualificationGoals((items) => items.map((item, itemIndex) => itemIndex === index ? value : item))} onRemove={(index) => setQualificationGoals((items) => items.filter((_, itemIndex) => itemIndex !== index))} placeholder="Ex.: Qual é o orçamento disponível?" />

      {slug && <CatalogSection profile={{ ...profile, offerings }} businessSlug={slug} />}
      {slug && <NotificationsSection slug={slug} />}

      <EditorSection id="test-call" title="Testar a chamada" description="Simula o que um lead vai ouvir com o perfil actual." collapsible defaultOpen={false} action={<a href={`${import.meta.env.BASE_URL}e/${slug}?test=1`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius-md)] bg-[var(--green-light)] px-3 text-[13px] font-semibold text-[var(--green-dark)] hover:bg-[#BBF7D0]" data-testid="link-test-call"><Phone size={16} /> Testar agora</a>}>
        <p className="text-[13px] leading-relaxed text-[var(--ink-soft)]">Abre uma chamada de teste numa nova janela sem sair deste editor.</p>
      </EditorSection>

      <EditorSection id="reanalyze" title="Reanalisar o site" description="Substitui o perfil pelo resultado de uma nova análise do site." collapsible defaultOpen={false}>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
          <input className={`${inputClass} flex-1`} value={siteUrl} onChange={(event) => setSiteUrl(event.target.value)} placeholder="https://oteusite.co.ao" inputMode="url" data-testid="input-reanalyze-url" />
          <button type="button" onClick={() => siteUrl.trim() && onReanalyze(siteUrl.trim())} disabled={reanalyzing || !siteUrl.trim()} className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--subtle)] px-4 text-[13px] font-semibold text-[var(--ink-soft)] transition-colors hover:border-[var(--green)] hover:text-[var(--green-dark)] disabled:opacity-40" data-testid="button-reanalyze-site">
            {reanalyzing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Reanalisar
          </button>
        </div>
      </EditorSection>

      {dirty && (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-[var(--border)] bg-[var(--surface)] px-5 py-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] shadow-[0_-4px_14px_rgba(17,24,39,0.06)]" data-testid="editor-save-bar">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <p className="min-w-0 flex-1 text-[13px] font-semibold text-[var(--ink)]" data-testid="status-editor-changes">Alterações não guardadas</p>
            <button type="button" onClick={save} disabled={saving || !name.trim() || hasInvalidPublicLink} className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--green)] px-4 text-[14px] font-semibold text-white transition-colors hover:bg-[var(--green-dark)] disabled:opacity-40" data-testid="button-save-profile">
              {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />} {saving ? "A guardar…" : "Guardar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}