/**
 * Catálogo público AI-first — design editorial premium, minimalista, mobile-first.
 * URL: /:handle / /catalogo / /c/:slug / /e/:businessSlug/catalogo
 *
 * APENAS DESIGN — toda a lógica, estado, efeitos, rotas e chamadas à API
 * são idênticos à versão anterior.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "wouter";
import {
  MessageSquare, X, Phone, Check, ChevronDown, ChevronUp,
  Send, ShoppingBag, ArrowRight, Loader2, ImageOff, Store, ArrowLeft, Smartphone,
} from "lucide-react";
import {
  getCatalogByHandle, getCatalogBySlug, businessApi, getStorageObjectUrl,
  recordCatalogEvent,
  type CatalogData, type Offering, type FaqItem,
} from "../lib/api";
import { BuyModal, parsePriceAoa } from "../components/BuyModal";

// UTM source for any lead that comes through the catalog
const CATALOG_ORIGIN = {
  source: "catalogo",
  campaign: "catalogo-publico",
  medium: "organico",
} as const;

const BASE = import.meta.env.BASE_URL;
const VISITOR_ID_KEY = "linkealls_catalog_visitor_id";

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

// ─── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:        "#F7F6F2",   // fundo de papel quente
  surface:   "#FFFDF9",   // cartões e containers
  ink:       "#142B3D",   // texto principal
  inkSoft:   "#536878",   // texto secundário / cinza
  inkFaint:  "#8797A0",   // texto muito suave
  line:      "#E0E5E3",   // bordas
  lineSoft:  "#EDF0EE",   // separadores internos
  accent:    "#635BFF",   // botão/acção principal
  accentInk: "#FFFFFF",
  subtle:    "#EEF2F0",   // superfícies suaves (placeholder imagem, hover)
  // Escala de radius
  rCard:  "20px",         // cards de produto e containers FAQ/diferencias
  rBtn:   "999px",        // botões → pill completo
  rBadge: "999px",        // badges
};

/** Business-scoped call-funnel URL. */
function captacaoUrl(businessSlug: string | null): string {
  return businessSlug
    ? `${BASE}e/${businessSlug}/captacao?utm_source=catalogo&utm_campaign=catalogo-publico`
    : BASE;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface MsgItem {
  id: string;
  role: "user" | "bot";
  text: string;
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Iniciais do negócio para avatar neutro. */
function initials(name: string) {
  return (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Etiqueta editorial de secção.
 * Bastante espaço acima (controlado pelo pt da <section>) e abaixo.
 */
function SectionLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-7">
      <h2
        className="text-[11px] font-semibold uppercase tracking-widest"
        style={{ color: T.inkSoft, letterSpacing: "0.14em" }}
      >
        {children}
      </h2>
      {hint && (
        <p className="mt-2.5 text-[13.5px] leading-relaxed" style={{ color: T.inkSoft }}>
          {hint}
        </p>
      )}
    </div>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({
  offering,
  onLearnMore,
  onBuy,
}: {
  offering: Offering;
  onLearnMore: () => void;
  onBuy?: () => void;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className="catalog-product-card group relative overflow-hidden flex flex-col"
      style={{
        background: T.surface,
        borderRadius: "18px",
        border: `1px solid ${T.line}`,
        boxShadow: "0 3px 0 rgba(20,43,61,0.025)",
      }}
    >
      {/* Imagem — hero visual do produto, não domina o card */}
      <div
        className="relative w-full overflow-hidden shrink-0"
        style={{
          height: 172,
          background: T.subtle,
          borderRadius: "18px 18px 0 0",
        }}
      >
        {offering.imageUrl && !imgError ? (
          <img
            src={offering.imageUrl}
            alt={offering.name}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {imgError ? (
              <div className="flex flex-col items-center gap-2" style={{ color: "#C4C4BE" }}>
                <ShoppingBag size={22} />
                <ImageOff size={11} />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2" style={{ color: T.inkFaint }}>
                <ShoppingBag size={24} strokeWidth={1.5} />
                <span className="text-[10px] font-medium uppercase tracking-[0.14em]">Sem imagem</span>
              </div>
            )}
          </div>
        )}
        {offering.featured && (
          <div
            className="absolute rounded-full text-[9.5px] font-semibold"
            style={{
              top: 10,
              left: 10,
              paddingLeft: 10,
              paddingRight: 10,
              paddingTop: 3,
              paddingBottom: 3,
              background: "rgba(255,255,255,0.92)",
              color: T.ink,
              border: `1px solid rgba(20,23,26,0.10)`,
              backdropFilter: "blur(8px)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
            }}
          >
            Destaque
          </div>
        )}
      </div>

      {/* Área de conteúdo — hierarquia clara: nome → preço → descrição → CTAs */}
      <div
        className="flex flex-col flex-1"
        style={{ padding: "18px 18px 19px" }}
      >
        {/* 1º — Nome: elemento textual mais importante */}
        <h3
          className="font-semibold line-clamp-3"
          style={{
            color: T.ink,
            fontSize: 16,
            lineHeight: 1.3,
          }}
        >
          {offering.name}
        </h3>

        {/* 2º — Preço: destaque numérico */}
        {offering.price && (
          <p
            className="font-bold tabular-nums"
            style={{
              color: T.ink,
               fontSize: 14,
               marginTop: 10,
            }}
          >
            {offering.price}
          </p>
        )}

        {/* 3º — Descrição: discreta, limitada a 2 linhas */}
        {offering.description && (
          <p
            className="line-clamp-2"
            style={{
              color: T.inkSoft,
               fontSize: 12.5,
               lineHeight: 1.55,
               marginTop: 8,
              flexGrow: 1,
            }}
          >
            {offering.description}
          </p>
        )}

        {/* 4º / 5º — CTAs: empurrados para o fundo para alinhamento entre cards */}
        <div
          className="flex flex-col"
           style={{ marginTop: 18, gap: 9 }}
        >
          {onBuy && (
            <button
              onClick={onBuy}
              className="w-full flex items-center justify-center gap-1.5 font-semibold transition-opacity hover:opacity-90"
              style={{
                background: T.accent,
                color: T.accentInk,
                borderRadius: T.rBtn,
                 fontSize: 13,
                 minHeight: 44,
              }}
            >
              <Smartphone size={12} />
              Comprar
            </button>
          )}
          <button
            onClick={onLearnMore}
            className="w-full flex items-center justify-center gap-1.5 font-semibold"
            style={{
              background: T.surface,
              color: T.ink,
              border: `1px solid ${T.line}`,
              borderRadius: T.rBtn,
               fontSize: 13,
               minHeight: 44,
            }}
          >
            Saber mais <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── FAQ Accordion ────────────────────────────────────────────────────────────

function FaqAccordion({ faq }: { faq: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div
      className="overflow-hidden"
      style={{
        background: T.surface,
        border: `1px solid ${T.line}`,
        borderRadius: T.rCard,
      }}
    >
      {faq.map((item, i) => (
        <div
          key={i}
          style={{ borderTop: i === 0 ? "none" : `1px solid ${T.lineSoft}` }}
        >
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between gap-4 text-left"
            style={{ padding: "18px 20px" }}
          >
            <span
              className="font-medium text-[13.5px] leading-snug"
              style={{ color: T.ink }}
            >
              {item.question}
            </span>
            {open === i ? (
              <ChevronUp size={16} className="shrink-0" style={{ color: T.inkSoft }} />
            ) : (
              <ChevronDown size={16} className="shrink-0" style={{ color: T.inkSoft }} />
            )}
          </button>
          {open === i && (
            <div style={{ padding: "0 20px 18px" }}>
              <p
                className="text-[13px] leading-relaxed"
                style={{ color: T.inkSoft }}
              >
                {item.answer}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Chat Widget ──────────────────────────────────────────────────────────────

function CatalogChat({
  catalog,
  open,
  onOpen,
  onClose,
  initialProduct,
}: {
  catalog: CatalogData;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  initialProduct: string | null;
}) {
  const [messages, setMessages] = useState<MsgItem[]>([]);
  const [input, setInput] = useState("");
  const [leadId, setLeadId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [firstMsg, setFirstMsg] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      const greeting = catalog.name
         ? `Olá! Sou a assistente virtual de *${catalog.name}*. Posso ajudar-te a escolher o produto certo, responder às tuas dúvidas e muito mais. Como posso ajudar?`
         : "Olá! Como posso ajudar?";
      setMessages([{ id: "greeting", role: "bot", text: greeting }]);
    }
  }, [open, catalog.name, messages.length]);

  useEffect(() => {
    if (open && initialProduct) {
      setInput(`Tenho interesse em ${initialProduct}. Pode dizer-me mais?`);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, initialProduct]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isBusy]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isBusy) return;

    setInput("");
    setIsBusy(true);
    setMessages((prev) => [...prev, { id: makeId(), role: "user", text }]);

    try {
      let currentLeadId = leadId;
      if (!catalog.businessSlug) throw new Error("sem slug de negócio");
      const api = businessApi(catalog.businessSlug);

      if (firstMsg) {
        const origin = { ...CATALOG_ORIGIN, url: window.location.href };
        const { leadId: newId } = await api.createLeadSession(origin, []);
        currentLeadId = newId;
        setLeadId(newId);
        setFirstMsg(false);
      }

      if (!currentLeadId) throw new Error("sem lead id");
      const { reply } = await api.sendLeadChat(currentLeadId, text);
      setMessages((prev) => [...prev, { id: makeId(), role: "bot", text: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: makeId(), role: "bot", text: "Desculpa, ocorreu um erro. Tenta de novo." },
      ]);
    } finally {
      setIsBusy(false);
    }
  }, [input, isBusy, leadId, firstMsg, catalog.businessSlug]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  return (
    <>
      {/* Botão flutuante — posicionado com espaço suficiente para não cobrir conteúdo */}
      {!open && (
        <button
          onClick={onOpen}
          aria-label="Abrir chat com IA"
          className="fixed z-40 flex items-center gap-2 font-semibold text-[14px] transition-transform hover:scale-[1.02]"
          style={{
            bottom: 28,
            right: 20,
            background: T.accent,
            color: T.accentInk,
            borderRadius: T.rBtn,
            paddingLeft: 20,
            paddingRight: 22,
            minHeight: 48,
            boxShadow: "0 4px 16px rgba(20,23,26,0.14)",
          }}
        >
          <MessageSquare size={17} />
          Falar com IA
        </button>
      )}

      {/* Painel de chat */}
      {open && (
        <div
          className="fixed z-50 flex flex-col overflow-hidden"
          style={{
            bottom: 0,
            right: 0,
            width: "min(100vw, 400px)",
            height: "min(100svh, 600px)",
            background: T.surface,
            borderRadius: "20px 20px 0 0",
            border: `1px solid ${T.line}`,
            borderBottom: "none",
            boxShadow: "0 -8px 40px rgba(20,23,26,0.12)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 py-3 shrink-0"
            style={{ background: T.surface, borderBottom: `1px solid ${T.lineSoft}` }}
          >
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 sm:hidden"
              style={{ color: T.inkSoft }}
              aria-label="Fechar chat"
            >
              <ArrowLeft size={18} />
            </button>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[12px] font-semibold"
              style={{ background: T.subtle, color: T.ink, border: `1px solid ${T.line}` }}
            >
              {initials(catalog.name) || "IA"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[14px] truncate" style={{ color: T.ink }}>
                {catalog.name || "Assistente IA"}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#3FB27F" }} />
                <span className="text-[11px]" style={{ color: T.inkSoft }}>
                  online · responde em segundos
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors hover:bg-black/5"
              style={{ color: T.inkSoft }}
            >
              <X size={17} />
            </button>
          </div>

          {/* Mensagens */}
          <div
            className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5"
            style={{ background: T.bg }}
          >
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className="max-w-[82%] px-3.5 py-2.5 text-[13.5px] leading-relaxed"
                  style={
                    m.role === "user"
                      ? { background: T.accent, color: T.accentInk, borderRadius: "14px 14px 4px 14px" }
                      : {
                          background: T.surface,
                          color: T.ink,
                          borderRadius: "14px 14px 14px 4px",
                          border: `1px solid ${T.line}`,
                        }
                  }
                >
                  {m.text}
                </div>
              </div>
            ))}

            {isBusy && (
              <div className="flex justify-start">
                <div
                  className="px-4 py-3"
                  style={{
                    background: T.surface,
                    borderRadius: "14px 14px 14px 4px",
                    border: `1px solid ${T.line}`,
                  }}
                >
                  <div className="flex gap-1 items-center h-3">
                    {[0, 150, 300].map((delay) => (
                      <span
                        key={delay}
                        className="w-1.5 h-1.5 rounded-full animate-bounce"
                        style={{ background: "#C4C4BE", animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* CTA de chamada */}
          <div className="px-4 pt-2.5 shrink-0" style={{ background: T.surface }}>
            <a
              href={captacaoUrl(catalog.businessSlug)}
              className="flex items-center justify-center gap-2 w-full font-medium text-[12.5px]"
              style={{
                color: T.ink,
                background: T.subtle,
                border: `1px solid ${T.line}`,
                borderRadius: T.rBtn,
                minHeight: 36,
              }}
            >
              <Phone size={13} />
              Preferes uma chamada? Clica aqui
            </a>
          </div>

          {/* Input */}
          <div
            className="px-4 py-3 flex gap-2 items-center shrink-0"
            style={{ background: T.surface }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Escreve uma mensagem…"
              disabled={isBusy}
              className="flex-1 text-[14px] outline-none disabled:opacity-60"
              style={{
                background: T.bg,
                color: T.ink,
                border: `1px solid ${T.line}`,
                borderRadius: T.rBtn,
                height: 44,
                paddingLeft: 16,
                paddingRight: 16,
              }}
              onFocus={(e) => (e.currentTarget.style.border = `1px solid ${T.ink}`)}
              onBlur={(e) => (e.currentTarget.style.border = `1px solid ${T.line}`)}
            />
            <button
              onClick={() => void sendMessage()}
              disabled={!input.trim() || isBusy}
              className="flex items-center justify-center transition-opacity disabled:opacity-30 shrink-0"
              style={{
                background: T.accent,
                color: T.accentInk,
                borderRadius: T.rBtn,
                width: 44,
                height: 44,
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Placeholder "em breve" ───────────────────────────────────────────────────

function ComingSoon({ name, reason }: { name: string; reason: "disabled" | "not_ready" }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6 px-6"
      style={{ background: T.bg }}
    >
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: T.surface, border: `1px solid ${T.line}` }}
      >
        <Store size={24} style={{ color: T.ink }} />
      </div>
      <div
        className="max-w-xs w-full text-center px-6 py-6"
        style={{ background: T.surface, borderRadius: T.rCard, border: `1px solid ${T.line}` }}
      >
        {name && (
          <h1 className="text-lg font-semibold mb-2" style={{ color: T.ink }}>
            {name}
          </h1>
        )}
        <p className="text-[13.5px] leading-relaxed" style={{ color: T.inkSoft }}>
          {reason === "disabled"
            ? "O catálogo está temporariamente indisponível. Volta mais tarde!"
            : "O catálogo ainda está a ser preparado. Volta em breve!"}
        </p>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function Catalogo() {
  const params = useParams<{ slug?: string; businessSlug?: string; handle?: string }>();
  const catalogSlug = params.slug ?? null;
  const businessSlug = params.businessSlug ?? null;
  const handle = params.handle ?? null;

  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [buyOffering, setBuyOffering] = useState<Offering | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    let fetch: Promise<CatalogData>;
    if (catalogSlug) {
      fetch = getCatalogBySlug(catalogSlug);
    } else if (businessSlug) {
      fetch = businessApi(businessSlug).getCatalog();
    } else if (handle) {
      fetch = getCatalogByHandle(handle);
    } else {
      fetch = Promise.reject(new Error("Catálogo não encontrado"));
    }
    fetch
      .then((data) => {
        setCatalog(data);
        if (data.businessSlug && data.catalogEnabled && data.isReady) {
          void recordCatalogEvent({
            businessSlug: data.businessSlug,
            eventType: "view",
            visitorId: getCatalogVisitorId(),
          }).catch(() => {});
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [catalogSlug, businessSlug, handle]);

  // ── Loading ──
  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: T.bg }}
      >
        <Loader2 size={28} className="animate-spin" style={{ color: T.inkSoft }} />
      </div>
    );
  }

  // ── Erro / indisponível ──
  if (!catalog) return <ComingSoon name="" reason="not_ready" />;
  if (!catalog.catalogEnabled) return <ComingSoon name={catalog.name} reason="disabled" />;
  if (!catalog.isReady) return <ComingSoon name={catalog.name} reason="not_ready" />;

  const trackProductClick = (offering: Offering) => {
    if (!catalog.businessSlug || !offering.analyticsKey) return;
    void recordCatalogEvent({
      businessSlug: catalog.businessSlug,
      eventType: "click",
      offeringKey: offering.analyticsKey,
      visitorId: getCatalogVisitorId(),
    }).catch(() => {});
  };

  // ── Catálogo completo ──
  return (
    <div className="catalog-page min-h-screen" style={{ background: T.bg, color: T.ink }}>

      {/* ══ CABEÇALHO FIXO ══════════════════════════════════════════════════════ */}
      <header
        className="catalog-header sticky top-0 z-30"
        style={{
          background: "rgba(247,246,242,0.88)",
          backdropFilter: "blur(18px)",
          borderBottom: `1px solid ${T.line}`,
        }}
      >
        {/* Largura máxima + margens laterais confortáveis */}
        <div
          className="mx-auto flex items-center gap-3"
          style={{ maxWidth: 1040, padding: "0 24px", height: 68 }}
        >
          {typeof window !== "undefined" && window.history.length > 1 && (
            <button
              onClick={() => window.history.back()}
              className="catalog-icon-button shrink-0 w-9 h-9 -ml-1 flex items-center justify-center rounded-full"
              style={{ color: T.inkSoft }}
              aria-label="Voltar"
            >
              <ArrowLeft size={18} />
            </button>
          )}

          {/* Avatar pequeno — apenas identificação, não elemento dominante */}
           <div
             className="w-9 h-9 rounded-[12px] flex items-center justify-center shrink-0 text-[11px] font-semibold"
            style={{ background: T.surface, color: T.ink, border: `1px solid ${T.line}` }}
          >
            {catalog.avatarUrl ? (
              <img src={getStorageObjectUrl(catalog.avatarUrl)} alt="" className="h-full w-full rounded-full object-cover" />
            ) : initials(catalog.name) || <Store size={14} />}
          </div>

          <p
            className="flex-1 min-w-0 font-semibold truncate"
             style={{ color: T.ink, fontSize: 15, letterSpacing: "-0.01em" }}
          >
            {catalog.name}
          </p>

          <a
            href={captacaoUrl(catalog.businessSlug)}
             className="catalog-header-cta shrink-0 inline-flex items-center gap-1.5 font-semibold transition-transform hover:-translate-y-0.5"
            style={{
              background: T.accent,
              color: T.accentInk,
              borderRadius: T.rBtn,
              fontSize: 13,
              paddingLeft: 16,
              paddingRight: 16,
               height: 40,
            }}
          >
            <Phone size={13} />
            Ligar
          </a>
        </div>
      </header>

      {/* ══ HERO — apresentação do negócio ══════════════════════════════════════ */}
      <section className="catalog-hero">
        <div
          className="mx-auto flex flex-col items-center text-center"
          style={{ maxWidth: 1040, padding: "72px 24px 0" }}
        >
          {/* Avatar grande centralizado */}
          <div
            className="flex items-center justify-center text-[20px] font-semibold"
            style={{
               width: 88,
               height: 88,
               borderRadius: 26,
               background: T.subtle,
              color: T.ink,
              border: `1px solid ${T.line}`,
            }}
          >
            {catalog.avatarUrl ? (
              <img src={getStorageObjectUrl(catalog.avatarUrl)} alt={`Foto de ${catalog.name}`} className="h-full w-full rounded-[20px] object-cover" />
            ) : initials(catalog.name) || <Store size={26} />}
          </div>

          {/* Nome do negócio */}
          <h1
             className="font-bold leading-tight tracking-tight"
             style={{ color: T.ink, fontSize: "clamp(34px, 5vw, 54px)", marginTop: 24, letterSpacing: "-0.055em" }}
          >
            {catalog.name}
          </h1>

          {/* Sector / categoria */}
          {catalog.sector && (
            <p
               style={{ color: T.accent, fontSize: 13, marginTop: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}
            >
              {catalog.sector}
            </p>
          )}

          {/* Badge "Assistente disponível 24h" */}
          <div
            className="inline-flex items-center gap-1.5 font-medium"
            style={{
              color: T.inkSoft,
              background: T.surface,
              border: `1px solid ${T.line}`,
              borderRadius: T.rBadge,
              fontSize: 11.5,
              paddingLeft: 12,
              paddingRight: 12,
              height: 28,
               marginTop: 18,
            }}
          >
            <span
              className="rounded-full shrink-0"
              style={{ width: 6, height: 6, background: "#3FB27F" }}
            />
            Assistente disponível 24h
          </div>

          {/* Descrição — editorial, respirada, max-width estreita */}
          {catalog.description && (
            <p
              className="leading-7"
              style={{
                color: T.inkSoft,
               fontSize: 16,
               maxWidth: 560,
               marginTop: 22,
                textAlign: "center",
              }}
            >
              {catalog.description.length > 320
                ? catalog.description.slice(0, 320) + "…"
                : catalog.description}
            </p>
          )}

          {/* CTAs principais — grande espaço, pill, cheios de ar */}
          <div
             className="catalog-hero-actions flex flex-col w-full"
             style={{ maxWidth: 520, gap: 12, marginTop: 34 }}
          >
            <a
              href={captacaoUrl(catalog.businessSlug)}
              className="flex items-center justify-center gap-2 font-semibold transition-opacity hover:opacity-90 active:scale-[0.995]"
              style={{
                background: T.accent,
                color: T.accentInk,
                borderRadius: T.rBtn,
                fontSize: 15,
                 minHeight: 54,
              }}
            >
              <MessageSquare size={17} />
              Falar com IA
            </a>
            <a
              href={captacaoUrl(catalog.businessSlug)}
              className="flex items-center justify-center gap-2 font-semibold"
              style={{
                background: T.surface,
                color: T.ink,
                border: `1px solid ${T.line}`,
                borderRadius: T.rBtn,
                fontSize: 15,
                 minHeight: 54,
              }}
            >
              <Phone size={17} />
              Ligar agora
            </a>
          </div>
        </div>
      </section>

      {/* ══ PRODUTOS & SERVIÇOS ══════════════════════════════════════════════════ */}
      {catalog.offerings.length > 0 && (
        <section>
           <div
             className="catalog-section mx-auto"
             style={{ maxWidth: 1040, padding: "88px 24px 0" }}
          >
            <SectionLabel hint="Fala com o agente IA — responde em segundos.">
              Produtos &amp; Serviços
            </SectionLabel>

            {/* Grid — gap horizontal 14px, vertical 20px */}
             <div
               className="catalog-offerings-grid grid"
              style={{ columnGap: 14, rowGap: 20 }}
            >
              {[...catalog.offerings]
                .sort((a, b) => {
                  if (a.featured && !b.featured) return -1;
                  if (!a.featured && b.featured) return 1;
                  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
                })
                .map((offering, i) => (
                  <ProductCard
                    key={i}
                    offering={offering}
                     onLearnMore={() => {
                       trackProductClick(offering);
                       window.location.href = captacaoUrl(catalog.businessSlug ?? "");
                     }}
                    onBuy={
                      catalog.businessSlug &&
                      offering.price &&
                      parsePriceAoa(offering.price) !== null
                         ? () => {
                           trackProductClick(offering);
                           setBuyOffering(offering);
                         }
                        : undefined
                    }
                  />
                ))}
            </div>
          </div>
        </section>
      )}

      {catalog.offerings.length === 0 && (
        <section>
           <div className="catalog-section mx-auto" style={{ maxWidth: 1040, padding: "88px 24px 0" }}>
            <div
              className="flex flex-col items-center px-6 py-10 text-center"
              style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: T.rCard }}
            >
              <ShoppingBag size={24} style={{ color: T.inkSoft }} />
              <h2 className="mt-4 font-semibold" style={{ color: T.ink, fontSize: 18 }}>
                Catálogo em actualização
              </h2>
              <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed" style={{ color: T.inkSoft }}>
                Este negócio ainda não publicou produtos. Fala com a assistente para saber mais.
              </p>
              <a
                href={captacaoUrl(catalog.businessSlug)}
                className="mt-6 flex min-h-[44px] items-center justify-center gap-2 px-5 font-semibold"
                style={{ background: T.accent, color: T.accentInk, borderRadius: T.rBtn, fontSize: 14 }}
              >
                <MessageSquare size={15} /> Falar com IA
              </a>
            </div>
          </div>
        </section>
      )}

      {/* ══ PORQUÊ ESCOLHER-NOS ══════════════════════════════════════════════════ */}
      {catalog.differentials.length > 0 && (
        <section>
           <div
             className="catalog-section mx-auto"
             style={{ maxWidth: 1040, padding: "88px 24px 0" }}
          >
            <SectionLabel>Porquê escolher-nos</SectionLabel>

            {/* Lista unificada num único container arredondado */}
            <div
              className="overflow-hidden"
              style={{
                background: T.surface,
                border: `1px solid ${T.line}`,
                borderRadius: T.rCard,
              }}
            >
              {catalog.differentials.map((diff, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3.5"
                  style={{
                    borderTop: i === 0 ? "none" : `1px solid ${T.lineSoft}`,
                    padding: "16px 20px",
                  }}
                >
                  {/* Ícone circular pequeno */}
                  <span
                    className="shrink-0 flex items-center justify-center rounded-full mt-[1px]"
                    style={{
                      width: 22,
                      height: 22,
                      background: T.subtle,
                      border: `1px solid ${T.line}`,
                    }}
                  >
                    <Check size={11} style={{ color: T.ink }} />
                  </span>
                  <p
                    className="leading-relaxed"
                    style={{ color: T.ink, fontSize: 13.5 }}
                  >
                    {diff}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ══ PERGUNTAS FREQUENTES ═════════════════════════════════════════════════ */}
      {catalog.faq.length > 0 && (
        <section>
           <div
             className="catalog-section mx-auto"
             style={{ maxWidth: 1040, padding: "88px 24px 0" }}
          >
            <SectionLabel>Perguntas Frequentes</SectionLabel>
            <FaqAccordion faq={catalog.faq} />
          </div>
        </section>
      )}

      {/* ══ FOOTER CTA ═══════════════════════════════════════════════════════════ */}
      <section>
           <div
             className="catalog-section mx-auto"
             style={{ maxWidth: 1040, padding: "88px 24px 56px" }}
        >
          <div
            className="flex flex-col items-center text-center px-6 py-10"
            style={{
              background: T.surface,
              border: `1px solid ${T.line}`,
              borderRadius: T.rCard,
            }}
          >
            <h2
              className="font-bold tracking-tight"
              style={{ color: T.ink, fontSize: 22 }}
            >
              Ainda tens dúvidas?
            </h2>
            <p
              className="leading-relaxed"
              style={{ color: T.inkSoft, fontSize: 13.5, maxWidth: 280, marginTop: 10 }}
            >
              A nossa assistente responde em segundos, 24h por dia, 7 dias por semana.
            </p>
            <div
              className="flex flex-col w-full"
              style={{ maxWidth: 300, gap: 12, marginTop: 28 }}
            >
              <a
                href={captacaoUrl(catalog.businessSlug)}
                className="flex items-center justify-center gap-2 font-semibold transition-opacity hover:opacity-90"
                style={{
                  background: T.accent,
                  color: T.accentInk,
                  borderRadius: T.rBtn,
                  fontSize: 14,
                  minHeight: 48,
                }}
              >
                <MessageSquare size={16} />
                Falar com IA agora
              </a>
              <a
                href={captacaoUrl(catalog.businessSlug)}
                className="flex items-center justify-center gap-2 font-semibold"
                style={{
                  background: T.subtle,
                  color: T.ink,
                  border: `1px solid ${T.line}`,
                  borderRadius: T.rBtn,
                  fontSize: 14,
                  minHeight: 48,
                }}
              >
                <Phone size={16} />
                Ligar agora
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ══ RODAPÉ ════════════════════════════════════════════════════════════════ */}
      <div className="text-center pb-32 pt-2">
        <p style={{ fontSize: 11, color: "rgba(20,23,26,0.32)" }}>
           Catálogo público Linkealls
        </p>
      </div>

      {/* ══ MODAIS / OVERLAYS ════════════════════════════════════════════════════ */}
      {buyOffering && catalog.businessSlug && (
        <BuyModal
          businessSlug={catalog.businessSlug}
          offering={buyOffering}
          onClose={() => setBuyOffering(null)}
        />
      )}

      <CatalogChat
        catalog={catalog}
        open={chatOpen}
        onOpen={() => setChatOpen(true)}
        onClose={() => setChatOpen(false)}
        initialProduct={null}
      />

    </div>
  );
}
