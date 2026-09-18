import { useState, type AnchorHTMLAttributes, type ReactNode } from "react";
import {
  ArrowRight,
  ChevronRight,
  Crown,
  Edit2,
  Grid3x3,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  LogOut,
  Megaphone,
  MessageSquare,
  MoreVertical,
  PackageCheck,
  Phone,
  Share2,
  ShoppingCart,
  Store,
  Trash2,
  UserRound,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import "./_group.css";

type Offering = {
  name: string;
  price?: string | null;
  imageUrl?: string | null;
  featured?: boolean;
};

type BusinessProfile = {
  name: string;
  sector?: string | null;
  description?: string | null;
  address?: string | null;
  hours?: string | null;
  phone?: string | null;
  email?: string | null;
  websiteUrl?: string | null;
  avatarUrl?: string | null;
  catalogEnabled: boolean;
  offerings: Offering[];
};

const D = {
  bg: "#F6F9FC",
  surface: "#FFFFFF",
  ink: "#0A2540",
  inkSoft: "#425466",
  inkFaint: "#8898AA",
  border: "#E6EBF1",
  borderSoft: "#F1F4F8",
  subtle: "#F1F5F9",
  green: "#635BFF",
  greenMuted: "#F6F4FF",
} as const;

const PALETTES = [
  { bg: "#EEECFF", text: "#5046E5" },
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
  return name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "N";
}

function Link({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a href={href} onClick={(event) => { event.preventDefault(); onClick?.(event); }} {...props} />;
}

function SettingsSectionHeader({ children }: { children: ReactNode }) {
  return <div className="app-settings-section-header"><h2>{children}</h2></div>;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <SettingsSectionHeader>{children}</SettingsSectionHeader>;
}

function IconContainer({ children }: { children: ReactNode }) {
  return <span className="app-icon-container is-md">{children}</span>;
}

function ListItem({
  title, description, leading, trailing, onClick, className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const content = (
    <>
      {leading && <div className="app-list-item-leading">{leading}</div>}
      <div className="app-list-item-content">
        <div className="app-list-item-title">{title}</div>
        {description && <div className="app-list-item-description">{description}</div>}
      </div>
      {trailing && <div className="app-list-item-trailing">{trailing}</div>}
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} className={`app-list-item ${className}`}>{content}</button>
    : <div className={`app-list-item ${className}`}>{content}</div>;
}

function SettingsListItem({
  icon, title, description, href, onClick, loading = false, last = false,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  href?: string;
  onClick?: () => void;
  loading?: boolean;
  last?: boolean;
}) {
  const content = (
    <ListItem
      title={title}
      description={description}
      leading={<IconContainer>{icon}</IconContainer>}
      trailing={<ChevronRight size={18} strokeWidth={1.6} />}
      onClick={onClick}
      className={`app-settings-list-item${last ? " is-last" : ""}${loading ? " is-loading" : ""}`}
    />
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function ViewField({
  label, value, onAdd, href, emptyActionLabel = "Adicionar", className = "",
}: {
  label: string;
  value?: string | null;
  onAdd?: () => void;
  href?: string;
  emptyActionLabel?: string;
  className?: string;
}) {
  const hasValue = Boolean(value?.trim());
  return (
    <div className={`app-view-field ${className}`}>
      <div className="app-view-field-label"><span>{label}</span></div>
      {hasValue ? (
        href
          ? <a href={href} onClick={(event) => event.preventDefault()} className="app-view-field-value is-link">{value}</a>
          : <p className="app-view-field-value">{value}</p>
      ) : (
        <div className="app-view-field-empty">
          <span>Não adicionado</span>
          {onAdd && <button type="button" onClick={onAdd} className="app-view-field-action">{emptyActionLabel}</button>}
        </div>
      )}
    </div>
  );
}

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

function ImagePlaceholder({ label }: { label: string }) {
  return <div className="app-image-placeholder is-md" role="img" aria-label={label}><ImageIcon size={20} strokeWidth={1.6} /></div>;
}

function ProductListItem({ name, price, imageUrl, last = false }: Offering & { last?: boolean }) {
  return (
    <div className={`app-product-list-item${last ? " is-last" : ""}`}>
      {imageUrl
        ? <img src={imageUrl} alt={name} className="app-product-image is-md" />
        : <div className="app-product-image is-md"><ImagePlaceholder label={`Sem imagem para ${name}`} /></div>}
      <div className="app-product-list-content">
        <p className="app-product-list-name">{name}</p>
        {price && <p className="app-product-list-price">{price}</p>}
      </div>
    </div>
  );
}

function ListFooterAction({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="app-list-footer-action">
      <span>{children}</span>
      <ArrowRight size={16} strokeWidth={1.8} />
    </Link>
  );
}

function ToolRow({ icon: Icon, title, description, href, last = false }: {
  icon: React.ElementType; title: string; description: string; href: string; last?: boolean;
}) {
  return <SettingsListItem icon={<Icon size={19} strokeWidth={1.7} />} title={title} description={description} href={href} last={last} />;
}

function ActionRow({ icon: Icon, title, description, onClick, loading = false, last = false }: {
  icon: React.ElementType; title: string; description: string; onClick: () => void; loading?: boolean; last?: boolean;
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

function FeaturedTile({ offering }: { offering: Offering }) {
  const pal = avatarPalette(offering.name);
  return (
    <div className="flex flex-col items-center gap-2" style={{ width: 72 }}>
      <div
        className="flex items-center justify-center overflow-hidden"
        style={{ width: 60, height: 60, borderRadius: 14, background: offering.imageUrl ? "transparent" : pal.bg, border: `1px solid ${D.border}` }}
      >
        {offering.imageUrl
          ? <img src={offering.imageUrl} alt={offering.name} className="h-full w-full object-cover" />
          : <span style={{ color: pal.text, fontSize: 20, fontWeight: 700 }}>{offering.name[0]?.toUpperCase()}</span>}
      </div>
      <p style={{ color: D.inkSoft, fontSize: 11, textAlign: "center", lineHeight: 1.3 }} className="line-clamp-2">{offering.name}</p>
    </div>
  );
}

function RecoveryCodeRow() {
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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
              <button type="button" onClick={() => setCopied(true)} className="shrink-0 rounded-xl px-3 py-2 text-[12px] font-bold" style={{ color: D.green, background: D.greenMuted }}>
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
          )}
          <button type="button" onClick={() => { setCode("LNK-7Q4M-2Z8P"); setCopied(false); }} className="mt-3 text-[12px] font-bold" style={{ color: D.green }}>
            {code ? "Gerar novo código" : "Gerar código"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [confirmation, setConfirmation] = useState("");
  if (!open) return null;
  const ready = confirmation.trim().toUpperCase() === "APAGAR";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0A2540]/45 p-4 sm:items-center" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="delete-account-title" className="w-full max-w-[420px] rounded-[24px] bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FEF2F2] text-[#DC2626]"><Trash2 size={19} /></div>
          <div>
            <h2 id="delete-account-title" className="text-[18px] font-bold text-[#0A2540]">Eliminar a conta?</h2>
            <p className="mt-1 text-[13px] leading-5 text-[#425466]">
              Esta acção elimina definitivamente o perfil, catálogo, leads, conversas, campanhas e histórico de pagamentos deste negócio.
            </p>
          </div>
        </div>
        <label className="block text-[12px] font-semibold uppercase tracking-[0.08em] text-[#8898AA]" htmlFor="delete-account-confirmation">Escreve APAGAR para confirmar</label>
        <input
          id="delete-account-confirmation"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          className="mt-2 w-full rounded-xl border border-[#E6EBF1] bg-[#F6F9FC] px-3 py-3 text-[15px] outline-none focus:border-[#DC2626]"
          autoComplete="off"
        />
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="min-h-11 flex-1 rounded-xl border border-[#E6EBF1] px-4 text-[14px] font-semibold text-[#425466]">Cancelar</button>
          <button type="button" disabled={!ready} className="min-h-11 flex-1 rounded-xl bg-[#DC2626] px-4 text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Eliminar conta</button>
        </div>
      </div>
    </div>
  );
}

function ProfileView({ profile, slug, onEdit }: { profile: BusinessProfile; slug: string; onEdit: () => void }) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const pal = avatarPalette(profile.name || "N");
  const inits = initials(profile.name);
  const isActive = profile.catalogEnabled && profile.offerings.length > 0;
  const featured = profile.offerings.filter((offering) => offering.featured);
  const previewOfferings = profile.offerings.slice(0, 4);
  const handleShare = () => undefined;

  return (
    <div style={{ paddingBottom: 32 }}>
      <div style={{ background: D.surface, borderBottom: `1px solid ${D.border}`, paddingBottom: 4 }}>
        <div className="flex items-start gap-4" style={{ padding: "20px 20px 16px" }}>
          <div
            className="flex shrink-0 items-center justify-center font-bold"
            style={{ width: 68, height: 68, borderRadius: "50%", background: pal.bg, color: pal.text, fontSize: 24, border: `1.5px solid ${D.border}` }}
          >
            {inits}
          </div>
          <div className="min-w-0 flex-1" style={{ paddingTop: 4 }}>
            <h2 className="leading-tight" style={{ color: D.ink, fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px" }}>{profile.name}</h2>
            {profile.sector && <p className="mt-1 leading-snug" style={{ color: D.inkSoft, fontSize: 14 }}>{profile.sector}</p>}
            <div className="mt-2 flex items-center gap-1.5">
              <span className="inline-block rounded-full" style={{ width: 7, height: 7, background: isActive ? D.green : D.inkFaint, flexShrink: 0 }} />
              <span style={{ color: D.inkSoft, fontSize: 13 }}>{isActive ? "Ativo" : "Inativo"}</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-4" style={{ borderTop: `1px solid ${D.borderSoft}`, margin: "0 20px" }}>
          {[
            { icon: Edit2, label: "Editar", action: onEdit, href: undefined },
            { icon: Grid3x3, label: "Catálogo", action: undefined, href: `/${slug}` },
            { icon: Share2, label: "Partilhar", action: handleShare, href: undefined },
            { icon: MoreVertical, label: "Mais", action: onEdit, href: undefined },
          ].map(({ icon: Icon, label, action, href }) => {
            const inner = (
              <div className="flex flex-col items-center gap-1.5 transition-opacity active:opacity-50" style={{ paddingTop: 14, paddingBottom: 12 }}>
                <Icon size={20} strokeWidth={1.75} style={{ color: D.inkSoft }} />
                <span style={{ color: D.inkSoft, fontSize: 11.5, fontWeight: 500 }}>{label}</span>
              </div>
            );
            return href ? <Link key={label} href={href}>{inner}</Link> : <button key={label} className="w-full" onClick={action}>{inner}</button>;
          })}
        </div>
      </div>

      <SectionLabel>Informações</SectionLabel>
      <div style={{ background: D.surface, borderTop: `1px solid ${D.border}`, borderBottom: `1px solid ${D.border}` }}>
        <InfoField label="Descrição" value={profile.description} placeholder="Adicionar descrição" onAdd={onEdit} />
        <InfoField label="Endereço" value={profile.address} placeholder="Adicionar endereço" onAdd={onEdit} />
        <InfoField label="Horário" value={profile.hours} placeholder="Adicionar horário" onAdd={onEdit} />
        <InfoField label="Contacto" value={profile.phone} placeholder="Adicionar contacto" onAdd={onEdit} />
        <InfoField label="E-mail" value={profile.email} placeholder="Adicionar e-mail" onAdd={onEdit} />
        <InfoField label="Website" value={profile.websiteUrl} placeholder="Adicionar website" onAdd={onEdit} link last />
      </div>

      {featured.length > 0 && (
        <>
          <div className="flex items-center justify-between" style={{ padding: "28px 20px 8px" }}>
            <p style={{ color: D.inkFaint, fontSize: 11, fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase" }}>Destaques</p>
            <button onClick={onEdit} style={{ color: D.green, fontSize: 13, fontWeight: 600 }}>Gerir</button>
          </div>
          <div style={{ background: D.surface, borderTop: `1px solid ${D.border}`, borderBottom: `1px solid ${D.border}` }}>
            <div className="flex gap-4 overflow-x-auto px-5 py-4" style={{ scrollbarWidth: "none" }}>
              {featured.map((offering, index) => <FeaturedTile key={index} offering={offering} />)}
            </div>
          </div>
        </>
      )}

      {previewOfferings.length > 0 && (
        <>
          <div className="flex items-center justify-between" style={{ padding: "28px 20px 8px" }}>
            <p style={{ color: D.inkFaint, fontSize: 11, fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase" }}>Catálogo</p>
            <Link href={`/${slug}`}><span style={{ color: D.green, fontSize: 13, fontWeight: 600 }}>Ver tudo</span></Link>
          </div>
          <div style={{ background: D.surface, borderTop: `1px solid ${D.border}`, borderBottom: `1px solid ${D.border}` }}>
            {previewOfferings.map((offering, index) => <ProductListItem key={index} {...offering} last={index === previewOfferings.length - 1} />)}
            <ListFooterAction href={`/${slug}`}>Ver catálogo completo</ListFooterAction>
          </div>
        </>
      )}

      <SectionLabel>O teu negócio</SectionLabel>
      <div style={{ background: D.surface, borderTop: `1px solid ${D.border}`, borderBottom: `1px solid ${D.border}` }}>
        <ToolRow icon={Grid3x3} title="Catálogo" description="Exibe produtos e serviços" href={`/${slug}`} />
        <ToolRow icon={Zap} title="Assistente IA" description="Configura o atendimento por voz e chat" href={`/e/${slug}/dono/assistente`} last />
      </div>

      <SectionLabel>Histórico</SectionLabel>
      <div style={{ background: D.surface, borderTop: `1px solid ${D.border}`, borderBottom: `1px solid ${D.border}` }}>
        <ToolRow icon={Megaphone} title="Campanhas antigas" description="Consulta estados e compromissos anteriores" href={`/e/${slug}/dono/campanhas`} last />
      </div>

      <SectionLabel>Pagamentos</SectionLabel>
      <div style={{ background: D.surface, borderTop: `1px solid ${D.border}`, borderBottom: `1px solid ${D.border}` }}>
        <ToolRow icon={ShoppingCart} title="Vendas" description="Encomendas pagas no catálogo" href={`/e/${slug}/dono/vendas`} />
        <ToolRow icon={PackageCheck} title="Comércio" description="Pedidos, follow-up e comprovativos" href={`/e/${slug}/dono/comercio`} />
        <ToolRow icon={Wallet} title="Carteira" description="Saldo, extracto e saques" href={`/e/${slug}/dono/carteira`} />
        <ToolRow icon={Crown} title="Plano" description="Subscrição Linkealls — 10.000 Kz / 30 dias" href={`/e/${slug}/dono/plano`} last />
      </div>

      <SectionLabel>Leads &amp; Conversas</SectionLabel>
      <div style={{ background: D.surface, borderTop: `1px solid ${D.border}`, borderBottom: `1px solid ${D.border}` }}>
        <ToolRow icon={Users} title="Leads" description="Todos os contactos qualificados" href={`/e/${slug}/dono/leads`} />
        <ToolRow icon={MessageSquare} title="Conversas" description="Historial de conversas com clientes" href={`/e/${slug}/dono/conversas`} last />
      </div>

      <SectionLabel>Configurar</SectionLabel>
      <div style={{ background: D.surface, borderTop: `1px solid ${D.border}`, borderBottom: `1px solid ${D.border}` }}>
        <ToolRow icon={Phone} title="Testar chamada" description="Fala com o assistente IA como um cliente" href={`/e/${slug}`} last />
      </div>

      <SectionLabel>Conta</SectionLabel>
      <div style={{ background: D.surface, borderTop: `1px solid ${D.border}`, borderBottom: `1px solid ${D.border}` }}>
        <RecoveryCodeRow />
        <ActionRow icon={LogOut} title="Terminar sessão" description="Sair deste dispositivo com segurança" onClick={() => undefined} last />
        <ActionRow icon={Trash2} title="Eliminar conta" description="Apagar definitivamente o espaço e os dados" onClick={() => setDeleteDialogOpen(true)} last />
      </div>
      <DeleteAccountDialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} />
    </div>
  );
}

const SAMPLE_PROFILE: BusinessProfile = {
  name: "Ateliê Horizonte",
  sector: "Design e decoração",
  description: "Criamos peças de decoração contemporânea e soluções personalizadas para casas, escritórios e pequenos espaços comerciais.",
  address: null,
  hours: null,
  phone: null,
  email: null,
  websiteUrl: null,
  avatarUrl: null,
  catalogEnabled: true,
  offerings: [
    { name: "Consultoria de interiores", price: "35.000 Kz", imageUrl: null, featured: true },
    { name: "Conjunto de almofadas artesanais", price: "18.500 Kz", imageUrl: null, featured: true },
  ],
};

const TABS = [
  { sub: "", icon: Store, label: "Perfil", exact: true },
  { sub: "/conversas", icon: MessageSquare, label: "Conversas", exact: false },
  { sub: "/vendas", icon: ShoppingCart, label: "Vendas", exact: false },
  { sub: "/carteira", icon: Wallet, label: "Carteira", exact: false },
] as const;

function OwnerNav({ slug }: { slug: string }) {
  const location = `/e/${slug}/dono`;
  const base = `/e/${slug}/dono`;
  return (
    <nav className="app-bottom-nav flex shrink-0 items-stretch" style={{ background: "var(--surface)", boxShadow: "0 -6px 20px rgba(10, 37, 64, 0.06)" }} aria-label="Navegação principal">
      {TABS.map(({ sub, icon: Icon, label, exact }) => {
        const path = `${base}${sub}`;
        const active = exact ? location === path : location === path || location.startsWith(`${path}/`);
        return (
          <Link key={path} href={path} className={`app-bottom-nav-item flex flex-1 select-none flex-col items-center justify-center gap-1 transition-colors active:opacity-70${active ? " is-active" : ""}`} aria-label={label} aria-current={active ? "page" : undefined}>
            <Icon size={21} strokeWidth={active ? 2.25 : 1.75} />
            <span className="app-bottom-nav-label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function Current() {
  const slug = "atelie-horizonte";
  return (
    <div className="owner-profile-review min-h-screen">
      <div className="owner-view-root">
        <header className="owner-header">
          <h1 className="owner-header-title">Perfil<span className="hidden min-[400px]:inline"> do negócio</span></h1>
          <Link href={`/${slug}`} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold text-[var(--ink-soft)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink)]" aria-label="O meu perfil">
            <UserRound size={16} strokeWidth={1.8} />
            <span>O meu perfil</span>
          </Link>
          <Link href={`/e/${slug}`} className="owner-icon-btn flex items-center justify-center rounded-full text-[var(--ink-soft)] hover:bg-[var(--subtle)] hover:text-[var(--ink)]" style={{ width: 44 }} aria-label="Ver página pública">
            <Store size={19} strokeWidth={1.75} />
          </Link>
        </header>
        <main className="owner-content-scroll">
          <ProfileView profile={SAMPLE_PROFILE} slug={slug} onEdit={() => undefined} />
        </main>
        <OwnerNav slug={slug} />
      </div>
    </div>
  );
}