/**
 * Catálogo público AI-first — tema claro, modern, mobile-first.
 * URL: /catalogo
 * Qualquer visitante pode ver os produtos, iniciar chat com IA ou ligar.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "wouter";
import {
  MessageSquare, X, Phone, CheckCircle2, ChevronDown, ChevronUp,
  Send, ShoppingBag, ArrowRight, Sparkles, Loader2, ImageOff, Store,
} from "lucide-react";
import {
  getCatalogBySlug, businessApi,
  type CatalogData, type Offering, type FaqItem, type ChatMessage,
} from "../lib/api";

// UTM source for any lead that comes through the catalog
const CATALOG_ORIGIN = {
  source: "catalogo",
  campaign: "catalogo-publico",
  medium: "organico",
} as const;

const BASE = import.meta.env.BASE_URL;

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

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({
  offering,
  onLearnMore,
}: {
  offering: Offering;
  onLearnMore: () => void;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="bg-white rounded-2xl overflow-hidden flex flex-col transition-shadow hover:shadow-md"
      style={{
        boxShadow: offering.featured
          ? "0 2px 12px rgba(250,204,21,0.18)"
          : "0 1px 4px rgba(0,0,0,0.08)",
        border: offering.featured ? "1px solid #FDE68A" : "1px solid #F1F5F9",
      }}>
      {/* Image */}
      <div className="relative w-full overflow-hidden" style={{ height: 168, background: "#F8FAFC" }}>
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
              <div className="flex flex-col items-center gap-1.5 text-slate-300">
                <ShoppingBag size={32} />
                <ImageOff size={14} />
              </div>
            ) : (
              <ShoppingBag size={32} className="text-slate-300" />
            )}
          </div>
        )}
        {/* Featured badge */}
        {offering.featured && (
          <div
            className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold"
            style={{ background: "#FEF9C3", color: "#92400E", border: "1px solid #FDE68A" }}
          >
            ⭐ Destaque
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3.5 flex flex-col flex-1 gap-1.5">
        <h3 className="font-bold text-slate-900 text-[13px] leading-snug line-clamp-2">
          {offering.name}
        </h3>
        {offering.price && (
          <p className="text-[15px] font-extrabold text-blue-600 tabular-nums">
            {offering.price}
          </p>
        )}
        {offering.description && (
          <p className="text-[12px] text-slate-500 leading-relaxed line-clamp-3 flex-1">
            {offering.description}
          </p>
        )}
        <button
          onClick={onLearnMore}
          className="mt-2 w-full py-2.5 rounded-xl text-[13px] font-semibold text-white transition-colors flex items-center justify-center gap-1.5"
          style={{ background: "#2563EB" }}
          onMouseOver={(e) => (e.currentTarget.style.background = "#1D4ED8")}
          onMouseOut={(e) => (e.currentTarget.style.background = "#2563EB")}
        >
          Saber mais <ArrowRight size={13} />
        </button>
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
          className="bg-white rounded-xl overflow-hidden"
          style={{ border: "1px solid #F1F5F9", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
        >
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between gap-3 p-4 text-left"
          >
            <span className="font-semibold text-slate-800 text-sm">{item.question}</span>
            {open === i ? (
              <ChevronUp size={16} className="text-slate-400 shrink-0" />
            ) : (
              <ChevronDown size={16} className="text-slate-400 shrink-0" />
            )}
          </button>
          {open === i && (
            <div className="px-4 pb-4">
              <p className="text-sm text-slate-600 leading-relaxed">{item.answer}</p>
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
          className="fixed bottom-6 right-5 z-40 flex items-center gap-2 pl-4 pr-5 py-3.5 rounded-full text-white font-semibold text-sm transition-transform hover:scale-105 shadow-lg"
          style={{ background: "#2563EB", boxShadow: "0 4px 20px rgba(37,99,235,0.4)" }}
        >
          <MessageSquare size={18} />
          Falar com IA
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className="fixed z-50 flex flex-col bg-white overflow-hidden"
          style={{
            bottom: 0,
            right: 0,
            width: "min(100vw, 390px)",
            height: "min(100svh, 580px)",
            borderRadius: "16px 16px 0 0",
            boxShadow: "0 -4px 32px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.06)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 py-3 shrink-0"
            style={{ background: "#2563EB" }}
          >
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <Sparkles size={17} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm truncate">
                {catalog.name || "Assistente IA"}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                <span className="text-[11px] text-blue-100">Online · responde em segundos</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-blue-100 hover:text-white hover:bg-white/15 transition-colors shrink-0"
            >
              <X size={17} />
            </button>
          </div>

          {/* Messages */}
          <div
            className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
            style={{ background: "#F8FAFC" }}
          >
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className="max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed"
                  style={
                    m.role === "user"
                      ? {
                          background: "#2563EB",
                          color: "#FFFFFF",
                          borderBottomRightRadius: 4,
                        }
                      : {
                          background: "#FFFFFF",
                          color: "#1E293B",
                          borderBottomLeftRadius: 4,
                          border: "1px solid #F1F5F9",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
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
                  className="px-4 py-3 rounded-2xl"
                  style={{
                    background: "#FFFFFF",
                    border: "1px solid #F1F5F9",
                    borderBottomLeftRadius: 4,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                  }}
                >
                  <div className="flex gap-1 items-center h-3">
                    {[0, 150, 300].map((delay) => (
                      <span
                        key={delay}
                        className="w-2 h-2 rounded-full bg-slate-300 animate-bounce"
                        style={{ animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Call CTA strip */}
          <div className="px-4 py-2 shrink-0" style={{ borderTop: "1px solid #F1F5F9" }}>
            <a
              href={captacaoUrl(catalog.businessSlug)}
              className="flex items-center justify-center gap-2 w-full py-2 rounded-xl text-[13px] font-semibold transition-colors"
              style={{ color: "#2563EB", background: "#EFF6FF" }}
            >
              <Phone size={14} />
              Preferes uma chamada? Clica aqui
            </a>
          </div>

          {/* Input */}
          <div
            className="px-3 py-3 flex gap-2 items-center shrink-0"
            style={{ borderTop: "1px solid #F1F5F9" }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Escreve uma mensagem…"
              disabled={isBusy}
              className="flex-1 text-[13px] rounded-xl px-3.5 py-2.5 outline-none text-slate-800 placeholder:text-slate-400 disabled:opacity-60"
              style={{
                background: "#F1F5F9",
                border: "1px solid transparent",
              }}
              onFocus={(e) => (e.currentTarget.style.border = "1px solid #93C5FD")}
              onBlur={(e) => (e.currentTarget.style.border = "1px solid transparent")}
            />
            <button
              onClick={() => void sendMessage()}
              disabled={!input.trim() || isBusy}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white transition-all disabled:opacity-40 shrink-0"
              style={{ background: "#2563EB" }}
            >
              <Send size={15} />
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
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 px-6"
      style={{ background: "#F8FAFC" }}>
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: "#DBEAFE" }}
      >
        <Store size={28} style={{ color: "#2563EB" }} />
      </div>
      <div className="text-center">
        {name && <h1 className="text-xl font-bold text-slate-900 mb-1">{name}</h1>}
        <p className="text-slate-500 text-sm max-w-xs">
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F8FAFC" }}>
        <Loader2 size={32} className="animate-spin" style={{ color: "#2563EB" }} />
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
    <div className="min-h-screen" style={{ background: "#F8FAFC" }}>
      {/* ── Sticky Header ── */}
      <header
        className="sticky top-0 z-30 bg-white"
        style={{ borderBottom: "1px solid #F1F5F9", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
      >
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          {/* Logo mark */}
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "#2563EB" }}
          >
            <Store size={15} className="text-white" />
          </div>
          <span className="font-bold text-slate-900 text-sm truncate flex-1 min-w-0">
            {catalog.name}
          </span>
          {catalog.sector && (
            <span
              className="hidden sm:inline-flex text-xs font-medium px-2.5 py-1 rounded-full shrink-0"
              style={{ color: "#2563EB", background: "#EFF6FF", border: "1px solid #BFDBFE" }}
            >
              {catalog.sector}
            </span>
          )}

          <a
            href={captacaoUrl(catalog.businessSlug)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-[13px] font-semibold transition-colors"
            style={{ background: "#2563EB" }}
          >
            <Phone size={13} />
            <span className="hidden sm:inline">Ligar</span>
            <span className="sm:hidden">Ligar</span>
          </a>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="bg-white" style={{ borderBottom: "1px solid #F1F5F9" }}>
        <div className="max-w-5xl mx-auto px-4 py-10 sm:py-14">
          {/* AI badge */}
          <div
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full mb-5"
            style={{ color: "#2563EB", background: "#EFF6FF", border: "1px solid #BFDBFE" }}
          >
            <Sparkles size={12} />
            Assistente IA disponível 24h
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 leading-tight mb-3 max-w-xl">
            {catalog.name}
          </h1>

          {catalog.sector && (
            <p className="text-base font-medium mb-3" style={{ color: "#2563EB" }}>
              {catalog.sector}
            </p>
          )}

          {catalog.description && (
            <p className="text-slate-600 text-base leading-relaxed mb-7 max-w-2xl">
              {catalog.description.length > 320
                ? catalog.description.slice(0, 320) + "…"
                : catalog.description}
            </p>
          )}

          {/* CTAs */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={openChat}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-white font-semibold text-sm transition-colors shadow-sm"
              style={{ background: "#2563EB" }}
            >
              <MessageSquare size={16} />
              Falar com IA
            </button>
            <a
              href={captacaoUrl(catalog.businessSlug)}
              className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-colors shadow-sm"
              style={{
                background: "#FFFFFF",
                color: "#374151",
                border: "1px solid #E5E7EB",
              }}
            >
              <Phone size={16} />
              Ligar agora
            </a>
          </div>
        </div>
      </section>

      {/* ── Products Grid ── */}
      {catalog.offerings.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 py-10">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900 mb-1">Produtos & Serviços</h2>
            <p className="text-slate-500 text-sm">
              Clica em "Saber mais" — a nossa IA responde em segundos.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
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
                />
              ))}
          </div>
        </section>
      )}

      {/* ── Differentials ── */}
      {catalog.differentials.length > 0 && (
        <section className="bg-white" style={{ borderTop: "1px solid #F1F5F9", borderBottom: "1px solid #F1F5F9" }}>
          <div className="max-w-5xl mx-auto px-4 py-10">
            <h2 className="text-xl font-bold text-slate-900 mb-6">Porque escolher-nos?</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {catalog.differentials.map((diff, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: "#DBEAFE" }}
                  >
                    <CheckCircle2 size={14} style={{ color: "#2563EB" }} />
                  </div>
                  <p className="text-slate-700 text-sm leading-relaxed">{diff}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── FAQ ── */}
      {catalog.faq.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 py-10">
          <h2 className="text-xl font-bold text-slate-900 mb-6">Perguntas Frequentes</h2>
          <FaqAccordion faq={catalog.faq} />
        </section>
      )}

      {/* ── Footer CTA ── */}
      <section
        className="mt-4"
        style={{ background: "#1E3A8A" }}
      >
        <div className="max-w-5xl mx-auto px-4 py-12 text-center">
          <div
            className="w-14 h-14 rounded-2xl mx-auto mb-5 flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.15)" }}
          >
            <Sparkles size={24} className="text-white" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">
            Ainda tens dúvidas?
          </h2>
          <p className="text-blue-200 text-sm mb-7 max-w-xs mx-auto">
            A nossa IA responde em segundos, 24h por dia, 7 dias por semana.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={openChat}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-colors"
              style={{ background: "#FFFFFF", color: "#1E3A8A" }}
            >
              <MessageSquare size={16} />
              Falar com IA agora
            </button>
            <a
              href={captacaoUrl(catalog.businessSlug)}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-colors"
              style={{ background: "rgba(255,255,255,0.12)", color: "#FFFFFF", border: "1px solid rgba(255,255,255,0.2)" }}
            >
              <Phone size={16} />
              Ligar agora
            </a>
          </div>
        </div>
      </section>

      {/* ── Powered by tag ── */}
      <div
        className="text-center py-4"
        style={{ background: "#172554" }}
      >
        <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>
          Catálogo gerado por AI Call Funnel
        </p>
      </div>

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
