/**
 * Catálogo público AI-first — design "link na bio" universal, limpo e neutro.
 * URL: /catalogo
 * Qualquer visitante pode ver os produtos, iniciar chat com IA ou ligar.
 *
 * NOTA: apenas o DESIGN foi alterado. Toda a lógica (estado, efeitos,
 * chamadas à API, props e fluxos) é idêntica à versão anterior.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "wouter";
import {
  MessageSquare, X, Phone, Check, ChevronDown, ChevronUp,
  Send, ShoppingBag, ArrowRight, Loader2, ImageOff, Store, ArrowLeft, Smartphone,
} from "lucide-react";
import {
  getCatalogBySlug, businessApi,
  type CatalogData, type Offering, type FaqItem, type ChatMessage,
} from "../lib/api";
import { BuyModal, parsePriceAoa } from "../components/BuyModal";

// UTM source for any lead that comes through the catalog
const CATALOG_ORIGIN = {
  source: "catalogo",
  campaign: "catalogo-publico",
  medium: "organico",
} as const;

const BASE = import.meta.env.BASE_URL;

// ─── Design tokens (neutros, universais para qualquer negócio) ───────────────
const T = {
  bg: "#F6F6F4",        // fundo da página
  surface: "#FFFFFF",   // cartões
  ink: "#14171A",       // texto principal
  inkSoft: "#6B7280",   // texto secundário
  line: "#E7E7E3",      // linhas / bordas
  lineSoft: "#F0F0EC",
  accent: "#14171A",    // acção principal (neutro, sem cor dominante)
  accentInk: "#FFFFFF",
  subtle: "#F2F2EF",    // superfícies suaves
  radius: 16,
};

/** Business-scoped call-funnel URL. Falls back to the app root when the
 *  business slug is unknown (shouldn't happen for a published catalog). */
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

/** Etiqueta de secção — discreta, alinhada à esquerda. */
function SectionLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-4">
      <h2
        className="text-[11px] font-semibold uppercase"
        style={{ color: T.inkSoft, letterSpacing: "0.12em" }}
      >
        {children}
      </h2>
      {hint && (
        <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: T.inkSoft }}>
          {hint}
        </p>
      )}
    </div>
  );
}

/** Iniciais do negócio, usadas como avatar neutro. */
function initials(name: string) {
  return (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
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
      className="relative overflow-hidden flex flex-col"
      style={{
        background: T.surface,
        borderRadius: T.radius,
        border: `1px solid ${T.line}`,
      }}
    >
      {/* Image */}
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: "4 / 3", background: T.subtle }}>
        {offering.imageUrl && !imgError ? (
          <img
            src={offering.imageUrl}
            alt={offering.name}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {imgError ? (
              <div className="flex flex-col items-center gap-1.5" style={{ color: "#C4C4BE" }}>
                <ShoppingBag size={26} />
                <ImageOff size={13} />
              </div>
            ) : (
              <ShoppingBag size={26} style={{ color: "#C4C4BE" }} />
            )}
          </div>
        )}
        {/* Featured badge */}
        {offering.featured && (
          <div
            className="absolute top-2.5 left-2.5 px-2 py-[3px] rounded-full text-[10px] font-semibold"
            style={{
              background: "rgba(255,255,255,0.92)",
              color: T.ink,
              border: `1px solid ${T.line}`,
              backdropFilter: "blur(6px)",
            }}
          >
            Destaque
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-3.5 pb-3.5 pt-3 flex flex-col flex-1">
        <h3 className="font-semibold text-[13.5px] leading-snug line-clamp-2" style={{ color: T.ink }}>
          {offering.name}
        </h3>
        {offering.price && (
          <p className="mt-1 text-[14px] font-semibold tabular-nums" style={{ color: T.ink }}>
            {offering.price}
          </p>
        )}
        {offering.description && (
          <p className="mt-1.5 text-[12px] leading-relaxed line-clamp-2 flex-1" style={{ color: T.inkSoft }}>
            {offering.description}
          </p>
        )}
        <div className="mt-3 flex flex-col gap-1.5">
          {onBuy && (
            <button
              onClick={onBuy}
              className="w-full h-9 rounded-xl text-[12.5px] font-semibold flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90"
              style={{ background: T.accent, color: T.accentInk }}
            >
              <Smartphone size={13} /> Comprar
            </button>
          )}
          <button
            onClick={onLearnMore}
            className="w-full h-9 rounded-xl text-[12.5px] font-semibold flex items-center justify-center gap-1.5 transition-colors"
            style={{ background: T.surface, color: T.ink, border: `1px solid ${T.line}` }}
          >
            Saber mais <ArrowRight size={13} />
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
      style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: T.radius }}
    >
      {faq.map((item, i) => (
        <div key={i} style={{ borderTop: i === 0 ? "none" : `1px solid ${T.lineSoft}` }}>
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left"
          >
            <span className="font-medium text-[13.5px] leading-snug" style={{ color: T.ink }}>
              {item.question}
            </span>
            {open === i ? (
              <ChevronUp size={16} className="shrink-0" style={{ color: T.inkSoft }} />
            ) : (
              <ChevronDown size={16} className="shrink-0" style={{ color: T.inkSoft }} />
            )}
          </button>
          {open === i && (
            <div className="px-4 pb-4 -mt-1">
              <p className="text-[13px] leading-relaxed" style={{ color: T.inkSoft }}>
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

  // Inject greeting when chat opens for the first time
  useEffect(() => {
    if (open && messages.length === 0) {
      const greeting = catalog.name
        ? `Olá! 👋 Sou a assistente virtual de *${catalog.name}*. Posso ajudar-te a escolher o produto certo, responder às tuas dúvidas e muito mais. Como posso ajudar?`
        : "Olá! 👋 Como posso ajudar?";
      setMessages([{ id: "greeting", role: "bot", text: greeting }]);
    }
  }, [open, catalog.name, messages.length]);

  // Pre-fill input when user clicks "Saber mais" on a product
  useEffect(() => {
    if (open && initialProduct) {
      setInput(`Tenho interesse em ${initialProduct}. Pode dizer-me mais?`);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, initialProduct]);

  // Scroll to bottom on new messages
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

      // Create lead on first message — only flip firstMsg AFTER successful creation
      // so that a network failure allows the user to retry without losing the session.
      if (!catalog.businessSlug) throw new Error("sem slug de negócio");
      const api = businessApi(catalog.businessSlug);

      if (firstMsg) {
        const origin = { ...CATALOG_ORIGIN, url: window.location.href };
        const { leadId: newId } = await api.createLeadSession(origin, []);
        currentLeadId = newId;
        setLeadId(newId);
        setFirstMsg(false); // commit only after success
      }

      if (!currentLeadId) throw new Error("sem lead id");
      const { reply } = await api.sendLeadChat(currentLeadId, text);
      setMessages((prev) => [...prev, { id: makeId(), role: "bot", text: reply }]);
    } catch {
      // firstMsg stays true on lead-creation failure → next send will retry
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
      {/* Floating open button */}
      {!open && (
        <button
          onClick={onOpen}
          aria-label="Abrir chat com IA"
          className="fixed bottom-5 right-4 z-40 flex items-center gap-2 pl-4 pr-5 h-12 rounded-full font-semibold text-[13.5px] transition-transform hover:scale-[1.03]"
          style={{
            background: T.accent,
            color: T.accentInk,
            boxShadow: "0 8px 24px rgba(20,23,26,0.18)",
          }}
        >
          <MessageSquare size={17} />
          Falar com IA
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className="fixed z-50 flex flex-col overflow-hidden"
          style={{
            bottom: 0,
            right: 0,
            width: "min(100vw, 400px)",
            height: "min(100svh, 600px)",
            background: T.surface,
            borderRadius: "18px 18px 0 0",
            border: `1px solid ${T.line}`,
            borderBottom: "none",
            boxShadow: "0 -10px 40px rgba(20,23,26,0.14)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-3 py-3 shrink-0"
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

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5" style={{ background: T.bg }}>
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
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

            {/* Typing indicator */}
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

          {/* Call CTA strip */}
          <div className="px-3 pt-2.5 shrink-0" style={{ background: T.surface }}>
            <a
              href={captacaoUrl(catalog.businessSlug)}
              className="flex items-center justify-center gap-2 w-full h-9 rounded-xl text-[12.5px] font-medium"
              style={{ color: T.ink, background: T.subtle, border: `1px solid ${T.line}` }}
            >
              <Phone size={13} />
              Preferes uma chamada? Clica aqui
            </a>
          </div>

          {/* Input */}
          <div className="px-3 py-3 flex gap-2 items-center shrink-0" style={{ background: T.surface }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Escreve uma mensagem…"
              disabled={isBusy}
              className="flex-1 text-[14px] rounded-xl px-3.5 h-11 outline-none disabled:opacity-60"
              style={{ background: T.bg, color: T.ink, border: `1px solid ${T.line}` }}
              onFocus={(e) => (e.currentTarget.style.border = `1px solid ${T.ink}`)}
              onBlur={(e) => (e.currentTarget.style.border = `1px solid ${T.line}`)}
            />
            <button
              onClick={() => void sendMessage()}
              disabled={!input.trim() || isBusy}
              className="w-11 h-11 rounded-xl flex items-center justify-center transition-opacity disabled:opacity-30 shrink-0"
              style={{ background: T.accent, color: T.accentInk }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── "Em breve" / "Inactivo" placeholder ─────────────────────────────────────

function ComingSoon({ name, reason }: { name: string; reason: "disabled" | "not_ready" }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 px-6" style={{ background: T.bg }}>
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: T.surface, border: `1px solid ${T.line}` }}
      >
        <Store size={24} style={{ color: T.ink }} />
      </div>
      <div
        className="max-w-xs text-center px-5 py-5"
        style={{ background: T.surface, borderRadius: T.radius, border: `1px solid ${T.line}` }}
      >
        {name && <h1 className="text-lg font-semibold mb-1" style={{ color: T.ink }}>{name}</h1>}
        <p className="text-[13px] leading-relaxed" style={{ color: T.inkSoft }}>
          {reason === "disabled"
            ? "O catálogo está temporariamente indisponível. Volta mais tarde!"
            : "O catálogo ainda está a ser preparado. Volta em breve!"}
        </p>
      </div>
    </div>
  );
}

// ─── Main Catalog Page ────────────────────────────────────────────────────────

export function Catalogo() {
  // /c/:slug          → catalog vanity-slug (used by QR links, legacy)
  // /e/:businessSlug/catalogo → business-scoped route (multi-tenant)
  // /catalogo         → legacy single-tenant route (falls back to businessSlug "electropanga")
  const params = useParams<{ slug?: string; businessSlug?: string }>();
  const catalogSlug = params.slug ?? null;
  const businessSlug = params.businessSlug ?? null;

  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [buyOffering, setBuyOffering] = useState<Offering | null>(null);

  useEffect(() => {
    let fetch: Promise<CatalogData>;
    if (catalogSlug) {
      // /c/:slug → fetch by catalog vanity slug
      fetch = getCatalogBySlug(catalogSlug);
    } else if (businessSlug) {
      // /e/:businessSlug/catalogo → fetch via scoped business API
      fetch = businessApi(businessSlug).getCatalog();
    } else {
      // No slug — cannot resolve a business
      fetch = Promise.reject(new Error("Catálogo não encontrado"));
    }
    fetch
      .then(setCatalog)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [catalogSlug, businessSlug]);

  const handleLearnMore = useCallback((offering: Offering) => {
    setSelectedProduct(offering.name);
    setChatOpen(true);
  }, []);

  const openChat = useCallback(() => {
    setSelectedProduct(null);
    setChatOpen(true);
  }, []);

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: T.bg }}>
        <Loader2 size={28} className="animate-spin" style={{ color: T.inkSoft }} />
      </div>
    );
  }

  // ── Error / not available ──
  if (!catalog) {
    return <ComingSoon name="" reason="not_ready" />;
  }

  if (!catalog.catalogEnabled) {
    return <ComingSoon name={catalog.name} reason="disabled" />;
  }

  if (!catalog.isReady) {
    return <ComingSoon name={catalog.name} reason="not_ready" />;
  }

  // ── Full Catalog ──
  return (
    <div className="min-h-screen" style={{ background: T.bg, color: T.ink }}>
      {/* ── Sticky Header ── */}
      <header
        className="sticky top-0 z-30"
        style={{
          background: "rgba(246,246,244,0.85)",
          backdropFilter: "blur(10px)",
          borderBottom: `1px solid ${T.line}`,
        }}
      >
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          {/* Back button — visible when navigated from within the app */}
          {typeof window !== "undefined" && window.history.length > 1 && (
            <button
              onClick={() => window.history.back()}
              className="shrink-0 w-8 h-8 -ml-1 flex items-center justify-center rounded-full"
              style={{ color: T.inkSoft }}
              aria-label="Voltar"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          {/* Avatar */}
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[11px] font-semibold"
            style={{ background: T.surface, color: T.ink, border: `1px solid ${T.line}` }}
          >
            {initials(catalog.name) || <Store size={15} />}
          </div>
          <p className="flex-1 min-w-0 font-semibold text-[14.5px] truncate" style={{ color: T.ink }}>
            {catalog.name}
          </p>

          <a
            href={captacaoUrl(catalog.businessSlug)}
            className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12.5px] font-semibold"
            style={{ background: T.accent, color: T.accentInk }}
            aria-label="Ligar"
          >
            <Phone size={13} />
            Ligar
          </a>
        </div>
      </header>

      {/* ── Hero (perfil do negócio, estilo link na bio) ── */}
      <section className="max-w-2xl mx-auto px-4 pt-8 pb-2">
        <div className="flex flex-col items-center text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-[18px] font-semibold"
            style={{ background: T.surface, color: T.ink, border: `1px solid ${T.line}` }}
          >
            {initials(catalog.name) || <Store size={24} />}
          </div>

          <h1 className="mt-4 text-[26px] font-semibold leading-tight tracking-tight" style={{ color: T.ink }}>
            {catalog.name}
          </h1>

          {catalog.sector && (
            <p className="mt-1.5 text-[13.5px]" style={{ color: T.inkSoft }}>
              {catalog.sector}
            </p>
          )}

          <div
            className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-medium px-2.5 py-1 rounded-full"
            style={{ color: T.inkSoft, background: T.surface, border: `1px solid ${T.line}` }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#3FB27F" }} />
            Assistente disponível 24h
          </div>

          {catalog.description && (
            <p className="mt-4 text-[13.5px] leading-relaxed max-w-md" style={{ color: T.inkSoft }}>
              {catalog.description.length > 320
                ? catalog.description.slice(0, 320) + "…"
                : catalog.description}
            </p>
          )}

          {/* CTAs — botões cheios estilo "link na bio" */}
          <div className="mt-6 w-full max-w-sm flex flex-col gap-2">
            <button
              onClick={openChat}
              className="flex items-center justify-center gap-2 w-full h-12 rounded-xl font-semibold text-[14px] transition-opacity hover:opacity-90 active:scale-[0.995]"
              style={{ background: T.accent, color: T.accentInk }}
            >
              <MessageSquare size={16} />
              Falar com IA
            </button>
            <a
              href={captacaoUrl(catalog.businessSlug)}
              className="flex items-center justify-center gap-2 w-full h-12 rounded-xl font-semibold text-[14px]"
              style={{ background: T.surface, color: T.ink, border: `1px solid ${T.line}` }}
            >
              <Phone size={16} />
              Ligar agora
            </a>
          </div>
        </div>
      </section>

      {/* ── Products Grid ── */}
      {catalog.offerings.length > 0 && (
        <section className="max-w-2xl mx-auto px-4 pt-10 pb-4">
          <SectionLabel hint='Clica em "Saber mais" — a nossa IA responde em segundos.'>
            Produtos &amp; serviços
          </SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[...catalog.offerings]
              .sort((a, b) => {
                // Featured products always first
                if (a.featured && !b.featured) return -1;
                if (!a.featured && b.featured) return 1;
                // Then respect sortOrder set by the owner
                return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
              })
              .map((offering, i) => (
                <ProductCard
                  key={i}
                  offering={offering}
                  onLearnMore={() => handleLearnMore(offering)}
                  onBuy={
                    catalog.businessSlug && offering.price && parsePriceAoa(offering.price) !== null
                      ? () => setBuyOffering(offering)
                      : undefined
                  }
                />
              ))}
          </div>
        </section>
      )}

      {/* ── Differentials ── */}
      {catalog.differentials.length > 0 && (
        <section className="max-w-2xl mx-auto px-4 pt-8 pb-4">
          <SectionLabel>Porquê escolher-nos</SectionLabel>
          <div
            className="overflow-hidden"
            style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: T.radius }}
          >
            {catalog.differentials.map((diff, i) => (
              <div
                key={i}
                className="flex items-start gap-3 px-4 py-3.5"
                style={{ borderTop: i === 0 ? "none" : `1px solid ${T.lineSoft}` }}
              >
                <span
                  className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: T.subtle }}
                >
                  <Check size={12} style={{ color: T.ink }} />
                </span>
                <p className="text-[13px] leading-relaxed" style={{ color: T.ink }}>
                  {diff}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── FAQ ── */}
      {catalog.faq.length > 0 && (
        <section className="max-w-2xl mx-auto px-4 pt-8 pb-4">
          <SectionLabel>Perguntas frequentes</SectionLabel>
          <FaqAccordion faq={catalog.faq} />
        </section>
      )}

      {/* ── Footer CTA ── */}
      <section className="max-w-2xl mx-auto px-4 pt-8 pb-8">
        <div
          className="px-6 py-8 text-center"
          style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: T.radius }}
        >
          <h2 className="text-[19px] font-semibold tracking-tight" style={{ color: T.ink }}>
            Ainda tens dúvidas?
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed max-w-xs mx-auto" style={{ color: T.inkSoft }}>
            A nossa assistente responde em segundos, 24h por dia, 7 dias por semana.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
            <button
              onClick={openChat}
              className="flex items-center justify-center gap-2 w-full sm:w-auto sm:px-6 h-11 rounded-xl text-[13.5px] font-semibold transition-opacity hover:opacity-90"
              style={{ background: T.accent, color: T.accentInk }}
            >
              <MessageSquare size={15} />
              Falar com IA agora
            </button>
            <a
              href={captacaoUrl(catalog.businessSlug)}
              className="flex items-center justify-center gap-2 w-full sm:w-auto sm:px-6 h-11 rounded-xl text-[13.5px] font-semibold"
              style={{ background: T.subtle, color: T.ink, border: `1px solid ${T.line}` }}
            >
              <Phone size={15} />
              Ligar agora
            </a>
          </div>
        </div>
      </section>

      {/* ── Powered by tag ── */}
      <div className="text-center pb-28 pt-2">
        <p className="text-[11px]" style={{ color: "rgba(20,23,26,0.38)" }}>
          Catálogo gerado por AI Call Funnel
        </p>
      </div>

      {/* ── Buy Modal (Multicaixa Express) ── */}
      {buyOffering && catalog.businessSlug && (
        <BuyModal
          businessSlug={catalog.businessSlug}
          offering={buyOffering}
          onClose={() => setBuyOffering(null)}
        />
      )}

      {/* ── Chat Widget ── */}
      <CatalogChat
        catalog={catalog}
        open={chatOpen}
        onOpen={openChat}
        onClose={() => setChatOpen(false)}
        initialProduct={selectedProduct}
      />
    </div>
  );
}
