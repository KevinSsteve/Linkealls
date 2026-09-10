/**
 * Catálogo público Linkealls.
 *
 * A página intencionalmente funciona como um perfil social com uma pequena
 * loja: primeiro contexto, depois descoberta, depois conversa ou compra.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Heart,
  Home,
  ImageOff,
  Link2,
  Minus,
  Phone,
  Plus,
  Share2,
  ShoppingBag,
  Smartphone,
  Store,
  UserRound,
} from "lucide-react";
import {
  businessApi,
  getCatalogByHandle,
  getCatalogBySlug,
  getStorageObjectUrl,
  recordCatalogEvent,
  type CatalogData,
  type FaqItem,
  type Offering,
} from "../lib/api";
import { BuyModal, formatAoa, parsePriceAoa } from "../components/BuyModal";

const BASE = import.meta.env.BASE_URL;
const VISITOR_ID_KEY = "linkealls_catalog_visitor_id";

const T = {
  bg: "#FFFFFF",
  surface: "#FFFFFF",
  ink: "#111111",
  inkSoft: "#6B6B6B",
  inkFaint: "#9A9A9A",
  line: "#EEEEEE",
  lineSoft: "#F4F4F4",
  subtle: "#F8F8F8",
  accent: "#111111",
  accentInk: "#FFFFFF",
  success: "#247A52",
} as const;

function getCatalogVisitorId(): string {
  try {
    const existing = window.localStorage.getItem(VISITOR_ID_KEY);
    if (existing) return existing;
    const created = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(VISITOR_ID_KEY, created);
    return created;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function captacaoUrl(businessSlug: string | null): string {
  return businessSlug
    ? `${BASE}e/${businessSlug}/captacao?utm_source=catalogo&utm_campaign=catalogo-publico`
    : BASE;
}

function chatUrl(businessSlug: string | null, productName?: string): string {
  if (!businessSlug) return BASE;
  const message = productName
    ? `Quero saber mais sobre ${productName}`
    : undefined;
  return `${BASE}e/${encodeURIComponent(businessSlug)}${message ? `?message=${encodeURIComponent(message)}` : ""}`;
}

function initials(name: string) {
  return (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function formatCatalogPrice(price: string): string {
  const value = price.trim();
  const parsed = parsePriceAoa(value);
  return parsed !== null ? formatAoa(parsed) : value;
}

function ProfileAvatar({
  catalog,
  size = "large",
}: {
  catalog: CatalogData;
  size?: "small" | "large";
}) {
  const dimension = size === "large" ? 92 : 38;
  return (
    <div
      className={`catalog-avatar catalog-avatar-${size} flex items-center justify-center overflow-hidden rounded-full font-semibold`}
      style={{
        width: dimension,
        height: dimension,
        color: T.ink,
        background: T.subtle,
        border: `1px solid ${T.line}`,
        fontSize: size === "large" ? 22 : 12,
      }}
    >
      {catalog.avatarUrl ? (
        <img
          src={getStorageObjectUrl(catalog.avatarUrl)}
          alt={`Foto de ${catalog.name}`}
          className="h-full w-full object-cover"
        />
      ) : (
        initials(catalog.name) || <Store size={size === "large" ? 26 : 15} strokeWidth={1.6} />
      )}
    </div>
  );
}

function ProductImage({
  offering,
  className = "",
  detail = false,
}: {
  offering: Offering;
  className?: string;
  detail?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`catalog-product-image relative overflow-hidden ${className}`}>
      {offering.imageUrl && !failed ? (
        <img
          src={offering.imageUrl}
          alt={offering.name}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover transition-transform duration-300"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2" style={{ color: T.inkFaint }}>
          {failed ? <ImageOff size={detail ? 27 : 20} strokeWidth={1.5} /> : <ShoppingBag size={detail ? 29 : 22} strokeWidth={1.5} />}
          <span className="text-[10px] uppercase tracking-[0.12em]">Sem imagem</span>
        </div>
      )}
      {offering.featured && (
        <span className="absolute left-3 top-3 rounded-full border px-2.5 py-1 text-[10px] font-medium" style={{ background: "rgba(255,255,255,.92)", borderColor: T.line, color: T.ink }}>
          Destaque
        </span>
      )}
      {offering.price && (
        <span className="catalog-product-price">
          {formatCatalogPrice(offering.price)}
        </span>
      )}
    </div>
  );
}

function ProductCard({
  offering,
  onOpen,
}: {
  offering: Offering;
  onOpen: () => void;
}) {
  return (
    <button className="catalog-product-card group text-left" onClick={onOpen} type="button">
      <ProductImage offering={offering} className="catalog-grid-image" />
      <div className="catalog-product-copy">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-[14px] font-semibold leading-snug" style={{ color: T.ink }}>
            {offering.name}
          </h3>
          <ArrowRight className="mt-0.5 shrink-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100" size={14} style={{ color: T.inkSoft }} />
        </div>
        {offering.description && (
          <p className="catalog-product-description" title={offering.description}>
            {offering.description}
          </p>
        )}
        {!offering.price && <p className="catalog-product-description">Preço sob consulta</p>}
      </div>
    </button>
  );
}

function ProductDetail({
  offering,
  catalog,
  businessSlug,
  onBack,
  onBuy,
}: {
  offering: Offering;
  catalog: CatalogData;
  businessSlug: string | null;
  onBack: () => void;
  onBuy: (quantity: number) => void;
}) {
  const [favorite, setFavorite] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [shared, setShared] = useState(false);
  const canBuy = Boolean(businessSlug && offering.price && parsePriceAoa(offering.price) !== null);

  const share = async () => {
    const shareData = { title: offering.name, text: offering.description || offering.name, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else await navigator.clipboard?.writeText(window.location.href);
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    } catch {
      // The visitor can dismiss the native share sheet without an error state.
    }
  };

  return (
    <main className="catalog-detail wa-page">
      <div className="catalog-detail-top">
        <button type="button" className="catalog-icon-button" onClick={onBack} aria-label="Voltar para a loja">
          <ArrowLeft size={19} />
        </button>
        <span className="text-[12px] font-medium" style={{ color: T.inkSoft }}>Produto</span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className={`catalog-icon-button ${favorite ? "is-active" : ""}`} onClick={() => setFavorite((value) => !value)} aria-label={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}>
            <Heart size={18} fill={favorite ? "currentColor" : "none"} />
          </button>
          <button type="button" className="catalog-icon-button" onClick={() => void share()} aria-label="Partilhar produto">
            <Share2 size={18} />
          </button>
        </div>
      </div>
      <div className="catalog-detail-inner">
        <ProductImage offering={offering} detail className="catalog-detail-image" />
        <div className="catalog-detail-content">
          <p className="catalog-kicker">{catalog.name}</p>
          <h1>{offering.name}</h1>
          {offering.price ? (
            <p className="catalog-detail-price">{formatCatalogPrice(offering.price)}</p>
          ) : (
            <p className="catalog-detail-contact">Preço sob consulta</p>
          )}
          {offering.description && <p className="catalog-detail-description">{offering.description}</p>}

          <div className="catalog-detail-rule" />
          <div className="flex items-center justify-between gap-4">
            <span className="text-[13px] font-medium" style={{ color: T.ink }}>Quantidade</span>
            <div className="catalog-quantity">
              <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label="Diminuir quantidade"><Minus size={15} /></button>
              <span>{quantity}</span>
              <button type="button" onClick={() => setQuantity((value) => Math.min(99, value + 1))} aria-label="Aumentar quantidade"><Plus size={15} /></button>
            </div>
          </div>
          <div className="catalog-detail-actions">
            {canBuy && (
              <button type="button" className="catalog-primary-action" onClick={() => onBuy(quantity)}>
                <Smartphone size={16} /> Comprar
              </button>
            )}
            <button type="button" className="catalog-secondary-action" onClick={share}>
              <Share2 size={16} /> {shared ? "Link copiado" : "Partilhar"}
            </button>
          </div>
          {canBuy && <p className="catalog-detail-note">Pagamento seguro através do Multicaixa Express.</p>}
        </div>
      </div>
    </main>
  );
}

function SegmentControl({
  tab,
  onChange,
}: {
  tab: "links" | "shop";
  onChange: (tab: "links" | "shop") => void;
}) {
  return (
    <div className="catalog-segment" role="tablist" aria-label="Conteúdo do perfil">
      {(["links", "shop"] as const).map((value) => (
        <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? "is-active" : ""} onClick={() => onChange(value)}>
          {value === "links" ? <Link2 size={15} /> : <ShoppingBag size={15} />}
          {value === "links" ? "Links" : "Shop"}
        </button>
      ))}
    </div>
  );
}

function LinksSection({ catalog }: { catalog: CatalogData }) {
  return (
    <section className="catalog-tab-panel wa-page" aria-label="Links">
      <div className="catalog-section-heading">
        <p className="catalog-kicker">Perfil</p>
        <h2>Descobre {catalog.name}</h2>
        <p>Encontra os links públicos e as formas de contacto deste negócio.</p>
      </div>
      <a className="catalog-link-card" href={captacaoUrl(catalog.businessSlug)}>
        <span className="catalog-link-icon"><Phone size={18} /></span>
        <span className="min-w-0 flex-1">
          <strong>Marca uma conversa</strong>
          <small>Encontra a melhor forma de falar com a equipa</small>
        </span>
        <ExternalLink size={16} style={{ color: T.inkSoft }} />
      </a>
      {catalog.publicLinks.length > 0 ? (
        <div className="catalog-public-links">
          {catalog.publicLinks.map((link) => (
            <a
              key={`${link.url}-${link.title}`}
              className="catalog-link-card"
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="catalog-link-icon"><Link2 size={18} /></span>
              <span className="min-w-0 flex-1">
                <strong>{link.title}</strong>
                {link.description && <small>{link.description}</small>}
              </span>
              <ExternalLink size={16} style={{ color: T.inkSoft }} />
            </a>
          ))}
        </div>
      ) : (
        <div className="catalog-links-empty">
          <Link2 size={18} />
          <p>Este perfil ainda não configurou outros links públicos.</p>
        </div>
      )}
    </section>
  );
}

function ShopSection({
  catalog,
  offerings,
  onOpen,
}: {
  catalog: CatalogData;
  offerings: Offering[];
  onOpen: (offering: Offering) => void;
}) {
  return (
    <section className="catalog-tab-panel wa-page" aria-label="Shop">
      <div className="catalog-section-heading catalog-shop-heading">
        <div>
          <p className="catalog-kicker">{catalog.sector || "Shop"}</p>
          <h2>Produtos em destaque</h2>
        </div>
        <span className="catalog-count">{offerings.length} {offerings.length === 1 ? "item" : "itens"}</span>
      </div>
      <div className="catalog-offerings-grid">
        {offerings.map((offering, index) => (
          <ProductCard key={`${offering.name}-${index}`} offering={offering} onOpen={() => onOpen(offering)} />
        ))}
      </div>
    </section>
  );
}

function FaqAccordion({ faq }: { faq: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="catalog-faq">
      {faq.map((item, index) => (
        <div key={`${item.question}-${index}`}>
          <button type="button" onClick={() => setOpen(open === index ? null : index)}>
            <span>{item.question}</span>
            {open === index ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
          </button>
          {open === index && <p>{item.answer}</p>}
        </div>
      ))}
    </div>
  );
}

function ComingSoon({ name, reason }: { name: string; reason: "disabled" | "not_ready" }) {
  return (
    <div className="catalog-state">
      <div className="catalog-state-icon"><Store size={25} /></div>
      <div>
        {name && <h1>{name}</h1>}
        <p>{reason === "disabled" ? "O catálogo está temporariamente indisponível. Volta mais tarde." : "O catálogo ainda está a ser preparado. Volta em breve."}</p>
      </div>
    </div>
  );
}

function LoadingCatalog() {
  return (
    <div className="catalog-loading">
      <div className="catalog-loading-avatar" />
      <div className="catalog-loading-line is-title" />
      <div className="catalog-loading-line" />
      <div className="catalog-loading-tabs" />
      <div className="catalog-loading-grid"><span /><span /><span /><span /></div>
    </div>
  );
}

export function Catalogo() {
  const params = useParams<{ slug?: string; businessSlug?: string; handle?: string }>();
  const catalogSlug = params.slug ?? null;
  const businessSlug = params.businessSlug ?? null;
  const handle = params.handle ?? null;
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"links" | "shop">("links");
  const [selectedOffering, setSelectedOffering] = useState<Offering | null>(null);
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [buyOffering, setBuyOffering] = useState<Offering | null>(null);
  const offerings = useMemo(
    () => [...(catalog?.offerings ?? [])].sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    }),
    [catalog?.offerings],
  );

  useEffect(() => {
    let request: Promise<CatalogData>;
    if (catalogSlug) request = getCatalogBySlug(catalogSlug);
    else if (businessSlug) request = businessApi(businessSlug).getCatalog();
    else if (handle) request = getCatalogByHandle(handle);
    else request = Promise.reject(new Error("Catálogo não encontrado"));
    request.then((data) => {
      setCatalog(data);
      if (data.businessSlug && data.catalogEnabled && data.isReady) {
        void recordCatalogEvent({ businessSlug: data.businessSlug, eventType: "view", visitorId: getCatalogVisitorId() }).catch(() => {});
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [businessSlug, catalogSlug, handle]);

  if (loading) return <LoadingCatalog />;
  if (!catalog) return <ComingSoon name="" reason="not_ready" />;
  if (!catalog.catalogEnabled) return <ComingSoon name={catalog.name} reason="disabled" />;
  if (!catalog.isReady) return <ComingSoon name={catalog.name} reason="not_ready" />;

  const resolvedBusinessSlug = catalog.businessSlug ?? businessSlug ?? handle;
  const trackProductClick = (offering: Offering) => {
    if (!catalog.businessSlug || !offering.analyticsKey) return;
    void recordCatalogEvent({ businessSlug: catalog.businessSlug, eventType: "click", offeringKey: offering.analyticsKey, visitorId: getCatalogVisitorId() }).catch(() => {});
  };
  const openOffering = (offering: Offering) => {
    trackProductClick(offering);
    setSelectedOffering(offering);
    setSelectedQuantity(1);
    setTab("shop");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return (
    <div className="catalog-page">
      <div className="catalog-shell">
        {selectedOffering ? (
          <ProductDetail
            offering={selectedOffering}
            catalog={catalog}
            businessSlug={resolvedBusinessSlug}
            onBack={() => setSelectedOffering(null)}
            onBuy={(quantity) => {
              setBuyOffering(selectedOffering);
              setSelectedQuantity(quantity);
            }}
          />
        ) : (
          <>
            <section className="catalog-profile">
              <ProfileAvatar catalog={catalog} />
              <h1>{catalog.name}</h1>
              {catalog.sector && <p className="catalog-sector">{catalog.sector}</p>}
            </section>
            <SegmentControl tab={tab} onChange={setTab} />
            {tab === "links" ? (
              <LinksSection catalog={catalog} />
            ) : catalog.offerings.length > 0 ? (
              <ShopSection catalog={catalog} offerings={offerings} onOpen={openOffering} />
            ) : (
              <section className="catalog-tab-panel wa-page">
                <div className="catalog-empty-shop">
                  <ShoppingBag size={20} />
                  <h2>Shop em actualização</h2>
                  <p>Este negócio ainda não publicou produtos.</p>
                </div>
              </section>
            )}
          </>
        )}

        {!selectedOffering && (
          <div className="catalog-secondary-content">
            {catalog.differentials.length > 0 && (
              <section className="catalog-secondary-section">
                <p className="catalog-kicker">Porquê escolher</p>
                <h2>Uma experiência simples, do primeiro clique à conversa.</h2>
                <div className="catalog-differentials">
                  {catalog.differentials.map((item, index) => <div key={`${item}-${index}`}><span><Check size={13} /></span><p>{item}</p></div>)}
                </div>
              </section>
            )}
            {catalog.faq.length > 0 && (
              <section className="catalog-secondary-section">
                <p className="catalog-kicker">Perguntas frequentes</p>
                <h2>Antes de falar, talvez já tenhas a resposta.</h2>
                <FaqAccordion faq={catalog.faq} />
              </section>
            )}
          </div>
        )}
      </div>

      <nav className="catalog-bottom-nav" aria-label="Navegação do perfil">
        <button type="button" className={tab === "links" ? "is-active" : ""} onClick={() => { setSelectedOffering(null); setTab("links"); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Home size={18} /><span>Links</span></button>
        <button type="button" className={tab === "shop" ? "is-active" : ""} onClick={() => { setSelectedOffering(null); setTab("shop"); window.scrollTo({ top: 0, behavior: "smooth" }); }}><ShoppingBag size={18} /><span>Shop</span></button>
        <a href={chatUrl(resolvedBusinessSlug)}><UserRound size={18} /><span>Assistente</span></a>
      </nav>

      {buyOffering && resolvedBusinessSlug && (
        <BuyModal
          businessSlug={resolvedBusinessSlug}
          offering={buyOffering}
          initialQuantity={selectedQuantity}
          onClose={() => setBuyOffering(null)}
        />
      )}
    </div>
  );
}