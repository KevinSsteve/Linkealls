/**
 * Catálogo público AI-first — visual "WhatsApp", mobile-first, link-in-bio.
 * URL: /catalogo
 * Qualquer visitante pode ver os produtos, iniciar chat com IA ou ligar.
 *
 * NOTA: apenas o DESIGN foi alterado. Toda a lógica (estado, efeitos,
 * chamadas à API, props e fluxos) é idêntica à versão anterior.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "wouter";
import {
  MessageSquare, X, Phone, CheckCircle2, ChevronDown, ChevronUp,
  Send, ShoppingBag, ArrowRight, Sparkles, Loader2, ImageOff, Store, ArrowLeft, Smartphone,
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

// ─── Design tokens (WhatsApp-like) ───────────────────────────────────────────
const WA = {
  teal: "#075E54",
  tealDark: "#054C44",
  green: "#25D366",
  greenDeep: "#128C7E",
  bubbleOut: "#DCF8C6",
  bubbleIn: "#FFFFFF",
  chatBg: "#ECE5DD",
  ink: "#111B21",
  inkSoft: "#54656F",
  line: "#E2DCD4",
};

/** Padrão de "wallpaper" do WhatsApp (SVG inline, sem dependências). */
const CHAT_WALLPAPER =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><g fill='none' stroke='%23000000' stroke-opacity='0.035' stroke-width='2'><circle cx='20' cy='20' r='7'/><path d='M60 12l8 8-8 8-8-8z'/><path d='M92 22h14M99 15v14'/><circle cx='30' cy='72' r='5'/><path d='M64 64h16v14H64z'/><path d='M100 96l6 6-6 6-6-6z'/><path d='M12 100h16'/></g></svg>\")";

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

/** Cauda das bolhas de conversa. */
function BubbleTail({ side }: { side: "left" | "right" }) {
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        bottom: 0,
        [side === "left" ? "left" : "right"]: -7,
        width: 0,
        height: 0,
        borderStyle: "solid",
        borderWidth: side === "left" ? "0 10px 10px 0" : "0 0 10px 10px",
        borderColor:
          side === "left"
            ? `transparent ${WA.bubbleIn} transparent transparent`
            : `transparent transparent transparent ${WA.bubbleOut}`,
      } as React.CSSProperties}
    />
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
      className="relative overflow-hidden flex flex-col"
      style={{
        background: WA.bubbleIn,
        borderRadius: "14px 14px 14px 4px",
        boxShadow: "0 1px 1px rgba(11,20,26,0.13)",
        border: offering.featured ? `1px solid ${WA.green}` : "1px solid rgba(11,20,26,0.06)",
      }}
    >
      {/* Image */}
      <div className="relative w-full overflow-hidden" style={{ height: 150, background: "#F0F2F5", padding: 5 }}>
        {offering.imageUrl && !imgError ? (
          <img
            src={offering.imageUrl}
            alt={offering.name}
            className="w-full h-full object-cover"
            style={{ borderRadius: 10 }}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ borderRadius: 10, background: "#E9EDEF" }}>
            {imgError ? (
              <div className="flex flex-col items-center gap-1.5" style={{ color: "#B7C0C5" }}>
                <ShoppingBag size={30} />
                <ImageOff size={13} />
              </div>
            ) : (
              <ShoppingBag size={30} style={{ color: "#B7C0C5" }} />
            )}
          </div>
        )}
        {/* Featured badge */}
        {offering.featured && (
          <div
            className="absolute top-2.5 left-2.5 flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold"
            style={{ background: WA.green, color: "#04231A" }}
          >
            ⭐ Destaque
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-3 pb-3 pt-2 flex flex-col flex-1 gap-1">
        <h3 className="font-semibold text-[13px] leading-snug line-clamp-2" style={{ color: WA.ink }}>
          {offering.name}
        </h3>
        {offering.price && (
          <p className="text-[15px] font-bold tabular-nums" style={{ color: WA.greenDeep }}>
            {offering.price}
          </p>
        )}
        {offering.description && (
          <p className="text-[12px] leading-relaxed line-clamp-3 flex-1" style={{ color: WA.inkSoft }}>
            {offering.description}
          </p>
        )}
        <div className="mt-2.5 flex flex-col gap-1.5">
          {onBuy && (
            <button
              onClick={onBuy}
              className="w-full py-2 rounded-full text-[13px] font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
              style={{ background: WA.greenDeep }}
              onMouseOver={(e) => (e.currentTarget.style.background = WA.teal)}
              onMouseOut={(e) => (e.currentTarget.style.background = WA.greenDeep)}
            >
              <Smartphone size={13} /> Comprar
            </button>
          )}
          <button
            onClick={onLearnMore}
            className="w-full py-2 rounded-full text-[13px] font-semibold flex items-center justify-center gap-1.5 transition-colors"
            style={
              onBuy
                ? { background: "transparent", color: WA.greenDeep, border: `1px solid ${WA.greenDeep}` }
                : { background: WA.green, color: "#04231A" }
            }
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
    <div className="space-y-2">
      {faq.map((item, i) => (
        <div
          key={i}
          className="overflow-hidden"
          style={{
            background: WA.bubbleIn,
            borderRadius: "14px 14px 14px 4px",
            boxShadow: "0 1px 1px rgba(11,20,26,0.13)",
          }}
        >
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left"
          >
            <span className="font-semibold text-[13.5px]" style={{ color: WA.ink }}>
              {item.question}
            </span>
            {open === i ? (
              <ChevronUp size={16} className="shrink-0" style={{ color: WA.greenDeep }} />
            ) : (
              <ChevronDown size={16} className="shrink-0" style={{ color: WA.inkSoft }} />
            )}
          </button>
          {open === i && (
            <div className="px-4 pb-4">
              <p className="text-[13px] leading-relaxed" style={{ color: WA.inkSoft }}>
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
          className="fixed bottom-5 right-4 z-40 flex items-center gap-2 pl-4 pr-5 py-3.5 rounded-full font-semibold text-sm transition-transform hover:scale-105"
          style={{ background: WA.green, color: "#04231A", boxShadow: "0 6px 18px rgba(37,211,102,0.45)" }}
        >
          <MessageSquare size={18} />
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
            width: "min(100vw, 390px)",
            height: "min(100svh, 580px)",
            background: WA.chatBg,
            borderRadius: "14px 14px 0 0",
            boxShadow: "0 -4px 32px rgba(0,0,0,0.22)",
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-3 py-2.5 shrink-0" style={{ background: WA.teal }}>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white/85 hover:text-white"
              aria-label="Fechar chat"
            >
              <ArrowLeft size={19} />
            </button>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "rgba(255,255,255,0.18)" }}
            >
              <Sparkles size={17} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-[14px] truncate">
                {catalog.name || "Assistente IA"}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: WA.green }} />
                <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.75)" }}>
                  online · responde em segundos
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            >
              <X size={17} />
            </button>
          </div>

          {/* Messages */}
          <div
            className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5"
            style={{ background: WA.chatBg, backgroundImage: CHAT_WALLPAPER }}
          >
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className="relative max-w-[80%] px-3 py-2 text-[13.5px] leading-relaxed"
                  style={{
                    background: m.role === "user" ? WA.bubbleOut : WA.bubbleIn,
                    color: WA.ink,
                    borderRadius: m.role === "user" ? "10px 10px 0 10px" : "10px 10px 10px 0",
                    boxShadow: "0 1px 1px rgba(11,20,26,0.13)",
                  }}
                >
                  {m.text}
                  <BubbleTail side={m.role === "user" ? "right" : "left"} />
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isBusy && (
              <div className="flex justify-start">
                <div
                  className="relative px-4 py-3"
                  style={{
                    background: WA.bubbleIn,
                    borderRadius: "10px 10px 10px 0",
                    boxShadow: "0 1px 1px rgba(11,20,26,0.13)",
                  }}
                >
                  <div className="flex gap-1 items-center h-3">
                    {[0, 150, 300].map((delay) => (
                      <span
                        key={delay}
                        className="w-2 h-2 rounded-full animate-bounce"
                        style={{ background: "#B7C0C5", animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </div>
                  <BubbleTail side="left" />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Call CTA strip */}
          <div className="px-3 pt-2 shrink-0" style={{ background: "#F0F2F5" }}>
            <a
              href={captacaoUrl(catalog.businessSlug)}
              className="flex items-center justify-center gap-2 w-full py-2 rounded-full text-[13px] font-semibold"
              style={{ color: WA.greenDeep, background: "#E7F7EF" }}
            >
              <Phone size={14} />
              Preferes uma chamada? Clica aqui
            </a>
          </div>

          {/* Input */}
          <div className="px-3 py-2.5 flex gap-2 items-center shrink-0" style={{ background: "#F0F2F5" }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Escreve uma mensagem…"
              disabled={isBusy}
              className="flex-1 text-[14px] rounded-full px-4 py-2.5 outline-none disabled:opacity-60"
              style={{
                background: "#FFFFFF",
                color: WA.ink,
                border: "1px solid transparent",
                boxShadow: "0 1px 1px rgba(11,20,26,0.08)",
              }}
              onFocus={(e) => (e.currentTarget.style.border = `1px solid ${WA.green}`)}
              onBlur={(e) => (e.currentTarget.style.border = "1px solid transparent")}
            />
            <button
              onClick={() => void sendMessage()}
              disabled={!input.trim() || isBusy}
              className="w-11 h-11 rounded-full flex items-center justify-center text-white transition-all disabled:opacity-40 shrink-0"
              style={{ background: WA.greenDeep }}
            >
              <Send size={17} />
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
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-5 px-6"
      style={{ background: WA.chatBg, backgroundImage: CHAT_WALLPAPER }}
    >
      <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: WA.greenDeep }}>
        <Store size={28} className="text-white" />
      </div>
      <div
        className="relative max-w-xs text-center px-4 py-3"
        style={{ background: WA.bubbleIn, borderRadius: 12, boxShadow: "0 1px 1px rgba(11,20,26,0.13)" }}
      >
        {name && <h1 className="text-lg font-bold mb-1" style={{ color: WA.ink }}>{name}</h1>}
        <p className="text-[13px]" style={{ color: WA.inkSoft }}>
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
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: WA.chatBg, backgroundImage: CHAT_WALLPAPER }}
      >
        <Loader2 size={32} className="animate-spin" style={{ color: WA.greenDeep }} />
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
    <div className="min-h-screen" style={{ background: WA.chatBg, backgroundImage: CHAT_WALLPAPER }}>
      {/* ── Sticky Header (barra de conversa) ── */}
      <header className="sticky top-0 z-30" style={{ background: WA.teal }}>
        <div className="max-w-2xl mx-auto px-3 h-14 flex items-center gap-2.5">
          {/* Back button — visible when navigated from within the app */}
          {typeof window !== "undefined" && window.history.length > 1 && (
            <button
              onClick={() => window.history.back()}
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-white/85 hover:text-white"
              aria-label="Voltar"
            >
              <ArrowLeft size={19} />
            </button>
          )}
          {/* Avatar */}
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "rgba(255,255,255,0.18)" }}
          >
            <Store size={17} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white text-[15px] truncate leading-tight">{catalog.name}</p>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: WA.green }} />
              <span className="text-[11px] truncate" style={{ color: "rgba(255,255,255,0.75)" }}>
                {catalog.sector || "Catálogo online"}
              </span>
            </div>
          </div>

          <a
            href={captacaoUrl(catalog.businessSlug)}
            className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white transition-colors hover:bg-white/10"
            aria-label="Ligar"
          >
            <Phone size={18} />
          </a>
        </div>
      </header>

      {/* ── Hero (cartão de perfil, estilo "business profile") ── */}
      <section className="max-w-2xl mx-auto px-4 pt-5 pb-2">
        <div
          className="relative px-4 py-5"
          style={{
            background: WA.bubbleIn,
            borderRadius: "4px 14px 14px 14px",
            boxShadow: "0 1px 1px rgba(11,20,26,0.13)",
          }}
        >
          {/* AI badge */}
          <div
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full mb-3"
            style={{ color: WA.greenDeep, background: "#E7F7EF" }}
          >
            <Sparkles size={12} />
            Assistente IA disponível 24h
          </div>

          <h1 className="text-[26px] font-extrabold leading-tight mb-1" style={{ color: WA.ink }}>
            {catalog.name}
          </h1>

          {catalog.sector && (
            <p className="text-[13.5px] font-semibold mb-2.5" style={{ color: WA.greenDeep }}>
              {catalog.sector}
            </p>
          )}

          {catalog.description && (
            <p className="text-[13.5px] leading-relaxed mb-5" style={{ color: WA.inkSoft }}>
              {catalog.description.length > 320
                ? catalog.description.slice(0, 320) + "…"
                : catalog.description}
            </p>
          )}

          {/* CTAs — botões cheios estilo "link na bio" */}
          <div className="flex flex-col gap-2">
            <button
              onClick={openChat}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-full font-bold text-[14px] transition-transform active:scale-[0.99]"
              style={{ background: WA.green, color: "#04231A" }}
            >
              <MessageSquare size={16} />
              Falar com IA
            </button>
            <a
              href={captacaoUrl(catalog.businessSlug)}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-full font-bold text-[14px]"
              style={{ background: "#FFFFFF", color: WA.greenDeep, border: `1px solid ${WA.greenDeep}` }}
            >
              <Phone size={16} />
              Ligar agora
            </a>
          </div>
          <BubbleTail side="left" />
        </div>
      </section>

      {/* ── Products Grid ── */}
      {catalog.offerings.length > 0 && (
        <section className="max-w-2xl mx-auto px-4 py-5">
          <div className="flex justify-center mb-4">
            <span
              className="text-[11px] font-semibold px-3 py-1 rounded-full"
              style={{ background: "rgba(255,255,255,0.75)", color: WA.inkSoft }}
            >
              PRODUTOS &amp; SERVIÇOS
            </span>
          </div>
          <p className="text-[12.5px] text-center mb-4" style={{ color: WA.inkSoft }}>
            Clica em "Saber mais" — a nossa IA responde em segundos.
          </p>
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
        <section className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex justify-center mb-4">
            <span
              className="text-[11px] font-semibold px-3 py-1 rounded-full"
              style={{ background: "rgba(255,255,255,0.75)", color: WA.inkSoft }}
            >
              PORQUE ESCOLHER-NOS?
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {catalog.differentials.map((diff, i) => (
              <div
                key={i}
                className="relative flex items-start gap-2.5 px-3.5 py-3"
                style={{
                  background: WA.bubbleOut,
                  borderRadius: "10px 10px 0 10px",
                  boxShadow: "0 1px 1px rgba(11,20,26,0.13)",
                  alignSelf: "flex-end",
                  maxWidth: "92%",
                  marginLeft: "auto",
                }}
              >
                <CheckCircle2 size={16} className="shrink-0 mt-0.5" style={{ color: WA.greenDeep }} />
                <p className="text-[13px] leading-relaxed" style={{ color: WA.ink }}>
                  {diff}
                </p>
                <BubbleTail side="right" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── FAQ ── */}
      {catalog.faq.length > 0 && (
        <section className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex justify-center mb-4">
            <span
              className="text-[11px] font-semibold px-3 py-1 rounded-full"
              style={{ background: "rgba(255,255,255,0.75)", color: WA.inkSoft }}
            >
              PERGUNTAS FREQUENTES
            </span>
          </div>
          <FaqAccordion faq={catalog.faq} />
        </section>
      )}

      {/* ── Footer CTA ── */}
      <section className="max-w-2xl mx-auto px-4 pt-4 pb-8">
        <div
          className="relative px-5 py-7 text-center"
          style={{
            background: WA.teal,
            borderRadius: "4px 14px 14px 14px",
            boxShadow: "0 1px 2px rgba(11,20,26,0.2)",
          }}
        >
          <div
            className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.15)" }}
          >
            <Sparkles size={22} className="text-white" />
          </div>
          <h2 className="text-[22px] font-extrabold text-white mb-1.5">Ainda tens dúvidas?</h2>
          <p className="text-[13px] mb-6 max-w-xs mx-auto" style={{ color: "rgba(255,255,255,0.75)" }}>
            A nossa IA responde em segundos, 24h por dia, 7 dias por semana.
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={openChat}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-full text-[14px] font-bold"
              style={{ background: WA.green, color: "#04231A" }}
            >
              <MessageSquare size={16} />
              Falar com IA agora
            </button>
            <a
              href={captacaoUrl(catalog.businessSlug)}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-full text-[14px] font-bold text-white"
              style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)" }}
            >
              <Phone size={16} />
              Ligar agora
            </a>
          </div>
        </div>
      </section>

      {/* ── Powered by tag ── */}
      <div className="text-center pb-24 pt-2">
        <p className="text-[11px]" style={{ color: "rgba(17,27,33,0.4)" }}>
          🔒 Catálogo gerado por AI Call Funnel
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
