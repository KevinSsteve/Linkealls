import { useState, useEffect, useRef, useCallback } from "react";
import { Redirect } from "wouter";
import { ChatLayout } from "../components/ChatLayout";
import { ChatBubble, type BubbleRole } from "../components/ChatBubble";
import { ChatInput } from "../components/ChatInput";
import { IncomingCallModal } from "../components/IncomingCallModal";
import { CallScreen } from "../components/CallScreen";
import { InlineCheckout } from "../components/InlineCheckout";
import { BuyModal, parsePriceAoa } from "../components/BuyModal";
import { useGeminiLive, type ProductCard, type AgentMessage } from "../hooks/useGeminiLive";
import { businessApi, type ChatMessage, type OrderTracking } from "../lib/api";
import { visitorApi } from "../lib/visitorAccess";
import {
  loadCurrentVisitorAccess,
  type LeadSessionResponse,
  type TrafficSessionCreative,
  type VisitorAccess,
} from "../lib/visitorAccess";
import { restoreTrafficConversation } from "../lib/trafficConversation";
import { useBusinessSlug } from "../hooks/useBusinessSlug";
import { recordVisit } from "../lib/visitedBusinesses";
import { useAuth } from "@/context/AuthContext";
import {
  X,
  ShoppingBag,
  ImageOff,
  MessageSquare,
  Phone,
  ChevronUp,
  ShoppingCart,
  CheckCircle2,
  Clock3,
  PackageCheck,
  RefreshCw,
  Trash2,
} from "lucide-react";
import "../styles/customer-ux.css";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: BubbleRole;
  text: string;
  ts: string;
}

type Stage = "chat" | "typing" | "call_incoming" | "call_active" | "call_ended";

/** A product the visitor is explicitly trying to buy via the BuyModal (non-call path). */
interface ModalOffering {
  name: string;
  price: string;
  description: string;
  imageUrl?: string;
}

function formatTime(s: number) {
  const m = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${m}:${ss}`;
}

const FULFILLMENT_LABELS: Record<OrderTracking["fulfillmentStatus"], string> = {
  novo: "Nova",
  em_preparacao: "Em preparação",
  pronto: "Pronta",
  entregue: "Entregue",
  cancelado: "Cancelada",
};

function formatOrderAmount(amount: string): string {
  return `${Number(amount).toLocaleString("pt-AO", { maximumFractionDigits: 2 })} Kz`;
}

function OrderTrackingCard({
  tracking,
  loading,
  error,
  onRefresh,
}: {
  tracking: OrderTracking | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  if (loading && !tracking) {
    return (
      <div className="mx-1 mb-3 rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--ink-soft)" }}>
          <RefreshCw size={14} className="animate-spin" /> A carregar o estado da encomenda…
        </div>
      </div>
    );
  }
  if (error && !tracking) {
    return (
      <div className="mx-1 mb-3 rounded-2xl p-4" style={{ background: "var(--errorBg)", border: "1px solid var(--errorBorder)", color: "var(--errorText)" }}>
        <p className="text-[13px]">{error}</p>
        <button onClick={onRefresh} className="mt-2 text-[12px] font-semibold underline">Tentar novamente</button>
      </div>
    );
  }
  if (!tracking) return null;

  const paid = tracking.status === "paga";
  return (
    <div className="mx-1 mb-3 rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "0 2px 8px rgba(23, 19, 31,0.06)" }}>
      <div className="flex items-start justify-between gap-3 px-4 py-3" style={{ background: "var(--subtle)", borderBottom: "1px solid var(--border)" }}>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--ink-faint)" }}>A tua encomenda</p>
          <p className="mt-1 truncate text-[14px] font-semibold" style={{ color: "var(--ink)" }}>{tracking.offeringName}</p>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--ink-soft)" }}>{tracking.quantity} unidade{tracking.quantity !== 1 ? "s" : ""} · {formatOrderAmount(tracking.amount)}</p>
        </div>
        <button onClick={onRefresh} disabled={loading} className="shrink-0 rounded-full p-2 disabled:opacity-40 touch-target-min" aria-label="Actualizar estado">
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} style={{ color: "var(--ink)" }} />
        </button>
      </div>
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: paid ? "#166534" : "#B45309" }}>
          {paid ? <CheckCircle2 size={16} /> : <Clock3 size={16} />}
          {paid ? "Pagamento confirmado" : "Pagamento ainda não confirmado"}
        </div>
        <div className="mt-2 flex items-center gap-2 text-[13px]" style={{ color: "var(--ink)" }}>
          <PackageCheck size={16} style={{ color: "var(--green)" }} />
          <span>Estado: <strong>{FULFILLMENT_LABELS[tracking.fulfillmentStatus]}</strong></span>
        </div>
        <div className="mt-3 space-y-2 border-l-2 pl-3" style={{ borderColor: "#D8E1EA" }}>
          {tracking.events.map((event, index) => (
            <div key={`${event.createdAt}-${event.type}-${index}`} className="relative">
              <span className="absolute -left-[19px] top-1.5 h-2 w-2 rounded-full" style={{ background: index === tracking.events.length - 1 ? "var(--green)" : "#AAB7C4" }} />
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>{event.content}</p>
              <p className="mt-0.5 text-[10px]" style={{ color: "var(--ink-faint)" }}>
                {new Date(event.createdAt).toLocaleString("pt-AO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Minimised call banner ─────────────────────────────────────────────────

function MinimizedCallBanner({
  elapsed,
  isAiSpeaking,
  hasProducts,
  onExpand,
  onEnd,
}: {
  elapsed: number;
  isAiSpeaking: boolean;
  hasProducts: boolean;
  onExpand: () => void;
  onEnd: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 flex-shrink-0"
      style={{
        background: "var(--ink)",
        borderBottom: "1px solid rgba(0,0,0,0.08)",
      }}
    >
      {/* Pulsing dot */}
      <span className="relative flex items-center justify-center shrink-0">
        <span
          className="absolute inline-flex rounded-full opacity-75 animate-ping"
          style={{ width: 10, height: 10, background: "#2E8B72", animationDuration: "1.3s" }}
        />
        <span
          className="relative inline-flex rounded-full"
          style={{ width: 8, height: 8, background: "#2E8B72" }}
        />
      </span>

      {/* Label */}
      <button onClick={onExpand} className="flex-1 flex items-center gap-2 text-left">
        <span className="text-[13px] font-semibold text-white">Em chamada</span>
        <span className="text-[12px] font-mono tabular-nums" style={{ color: "rgba(255,255,255,0.65)" }}>
          {formatTime(elapsed)}
        </span>
        {isAiSpeaking && (
          <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}>
            A falar…
          </span>
        )}
        {hasProducts && !isAiSpeaking && (
          <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}>
            Ver produtos ↓
          </span>
        )}
      </button>

      {/* End call (small) */}
      <button
        onClick={onEnd}
        className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center active:scale-90 transition-transform touch-target-min"
        style={{ background: "#EF4444" }}
        aria-label="Terminar chamada"
      >
        <Phone size={16} className="text-white" style={{ transform: "rotate(135deg)" }} />
      </button>

      {/* Expand */}
      <button
        onClick={onExpand}
        className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center active:scale-90 touch-target-min"
        style={{ background: "rgba(255,255,255,0.15)" }}
        aria-label="Expandir chamada"
      >
        <ChevronUp size={18} style={{ color: "#fff" }} />
      </button>
    </div>
  );
}

// ─── Agent text message bubble ─────────────────────────────────────────────

function AgentMsgBubble({ msg, onDismiss }: { msg: AgentMessage; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-2 mb-2">
      <div
        className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5"
        style={{ background: "var(--green-light)" }}
      >
        <MessageSquare size={11} style={{ color: "var(--green)" }} />
      </div>
      <div
        className="flex-1 rounded-2xl rounded-tl-sm px-3 py-2 text-[13px] leading-relaxed whitespace-pre-line"
        style={{
          background: "var(--surface)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
          color: "var(--ink)",
        }}
      >
        {msg.text}
      </div>
      <button onClick={onDismiss} className="shrink-0 mt-1 opacity-40 hover:opacity-70 touch-target-min">
        <X size={16} style={{ color: "#8696A0" }} />
      </button>
    </div>
  );
}

// ─── Overlay: agent messages during full-screen call ──────────────────────

function AgentMessageOverlay({
  messages,
  onDismissAll,
}: {
  messages: AgentMessage[];
  onDismissAll: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  if (messages.length === 0) return null;

  return (
    <div
      className="absolute inset-x-0 top-0 z-10 flex flex-col pointer-events-none"
      style={{ maxHeight: "45%" }}
    >
      <div
        className="w-full shrink-0"
        style={{
          height: 20,
          background: "linear-gradient(180deg, rgba(7,94,84,0.4) 0%, transparent 100%)",
        }}
      />
      <div
        ref={scrollRef}
        className="flex flex-col gap-2 overflow-y-auto px-4 pb-2 pointer-events-auto"
        style={{ scrollbarWidth: "none" }}
      >
        {messages.map((m) => (
          <div key={m.id} className="flex items-start gap-2">
            <div
              className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5"
              style={{ background: "var(--green-light)" }}
            >
              <MessageSquare size={11} style={{ color: "var(--green)" }} />
            </div>
            <div
              className="flex-1 rounded-2xl rounded-tl-sm px-3 py-2 text-[13px] leading-relaxed whitespace-pre-line"
              style={{
                background: "rgba(255,255,255,0.92)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                color: "var(--ink)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
              }}
            >
              {m.text}
            </div>
            <button
              className="shrink-0 mt-0.5 opacity-40 hover:opacity-80 transition-opacity touch-target-min"
              onClick={onDismissAll}
            >
              <X size={16} style={{ color: "#8696A0" }} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Product card ──────────────────────────────────────────────────────────

function ProductCardItem({
  product,
  onSelect,
  onBuy,
}: {
  product: ProductCard;
  onSelect: () => void;
  onBuy?: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const canBuy = !!onBuy && !!product.price && parsePriceAoa(product.price) !== null;

  return (
    <div
      className="flex-shrink-0 flex flex-col rounded-2xl overflow-hidden"
      style={{
        width: 150,
        background: "var(--surface)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
      }}
    >
      <div
        className="w-full flex items-center justify-center"
        style={{ height: 110, background: "var(--subtle)", flexShrink: 0 }}
      >
        {product.imageUrl && !imgError ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <ShoppingBag size={28} style={{ color: "#8696A0" }} />
            {imgError && <ImageOff size={12} style={{ color: "#8696A0" }} />}
          </div>
        )}
      </div>

      <div className="flex flex-col flex-1 p-2.5 gap-1">
        <p className="text-[13px] font-semibold leading-tight line-clamp-2" style={{ color: "var(--ink)" }}>
          {product.name}
        </p>
        {product.price && (
          <p className="text-[12px] font-bold" style={{ color: "var(--green)" }}>
            {product.price}
          </p>
        )}
        {product.description && (
          <p className="text-[11px] leading-relaxed line-clamp-2" style={{ color: "var(--ink-soft)" }}>
            {product.description}
          </p>
        )}
        <div className="mt-auto pt-1.5 flex flex-col gap-1.5">
          {canBuy && (
            <button
              onClick={onBuy}
              className="w-full py-1.5 rounded-xl text-[12px] font-semibold transition-colors flex items-center justify-center gap-1"
              style={{ background: "var(--green)", color: "#FFFFFF" }}
            >
              <ShoppingCart size={11} />
              Comprar
            </button>
          )}
          <button
            onClick={onSelect}
            className="w-full py-1.5 rounded-xl text-[12px] font-semibold transition-colors"
            style={{
              background: canBuy ? "var(--subtle)" : "var(--green)",
              color: canBuy ? "var(--ink-soft)" : "#FFFFFF",
            }}
          >
            {canBuy ? "Perguntar" : "Selecionar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Product vitrine overlay (inside full call screen) ─────────────────────

function ProductVitrine({
  products,
  onSelect,
  onBuy,
  onClose,
}: {
  products: ProductCard[];
  onSelect: (p: ProductCard) => void;
  onBuy: (p: ProductCard) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl"
      style={{
        background: "var(--surface)",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.15)",
        paddingTop: 8,
        maxHeight: "72%",
      }}
    >
      {/* Handle */}
      <div className="flex justify-center pt-2 pb-1 shrink-0">
        <div className="w-10 h-1 rounded-full" style={{ background: "#E9EDEF" }} />
      </div>

      <div className="flex items-center justify-between px-4 pb-3 flex-shrink-0">
        <div>
        <p className="text-[15px] font-bold" style={{ color: "var(--ink)" }}>Escolhe o que queres</p>
          <p className="text-[12px] mt-0.5" style={{ color: "#8696A0" }}>
            {products.length} produto{products.length !== 1 ? "s" : ""} disponíve
            {products.length !== 1 ? "is" : "l"}
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-11 h-11 rounded-full flex items-center justify-center touch-target-min"
          style={{ background: "var(--subtle)" }}
        >
          <X size={18} style={{ color: "var(--ink-soft)" }} />
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto px-4 pb-5 scrollbar-none flex-shrink-0">
        {products.map((p, i) => (
          <ProductCardItem
            key={i}
            product={p}
            onSelect={() => onSelect(p)}
            onBuy={() => onBuy(p)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Inline product shelf (shown in chat when call is minimised) ───────────

function InlineProductShelf({
  products,
  onSelect,
  onBuy,
  onClose,
}: {
  products: ProductCard[];
  onSelect: (p: ProductCard) => void;
  onBuy: (p: ProductCard) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="mx-3 mb-2 rounded-2xl overflow-hidden"
      style={{
        background: "var(--surface)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <p className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
          Produtos disponíveis
        </p>
        <button onClick={onClose} className="touch-target-min">
          <X size={18} style={{ color: "#8696A0" }} />
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto px-3 pb-3 scrollbar-none">
        {products.map((p, i) => (
          <ProductCardItem
            key={i}
            product={p}
            onSelect={() => onSelect(p)}
            onBuy={() => onBuy(p)}
          />
        ))}
      </div>
    </div>
  );
}

function TrafficCreativeCard({ creative }: { creative: TrafficSessionCreative }) {
  const [mediaError, setMediaError] = useState(false);
  const [mediaKey, setMediaKey] = useState(0);
  const mediaUrl = creative.mediaUrl
    ? import.meta.env.DEV && creative.mediaUrl.startsWith("/api/")
      ? `${import.meta.env.BASE_URL}${creative.mediaUrl.slice(1)}`
      : creative.mediaUrl
    : "";

  const retryMedia = () => {
    setMediaError(false);
    setMediaKey((value) => value + 1);
  };

  return (
    <article
      className="mb-3 overflow-hidden rounded-2xl"
      style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "0 2px 8px rgba(23,19,31,0.08)" }}
      aria-label="Anúncio que iniciou esta conversa"
    >
      {!mediaError && mediaUrl ? (
        creative.mediaType === "video" ? (
          <video
            key={mediaKey}
            src={mediaUrl}
            controls
            playsInline
            preload="metadata"
            onError={() => setMediaError(true)}
            className="block aspect-video w-full bg-black object-contain"
          />
        ) : (
          <img
            key={mediaKey}
            src={mediaUrl}
            alt="Imagem do anúncio"
            onError={() => setMediaError(true)}
            className="block aspect-video w-full object-cover"
          />
        )
      ) : (
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-[var(--subtle)] px-6 text-center">
          <ImageOff size={28} style={{ color: "var(--ink-faint)" }} />
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>Não foi possível carregar o conteúdo do anúncio.</p>
          {mediaUrl && (
            <button type="button" onClick={retryMedia} className="text-xs font-semibold underline" style={{ color: "var(--green)" }}>
              Tentar novamente
            </button>
          )}
        </div>
      )}
      <div className="px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--ink-faint)" }}>
          Anúncio que viste
        </p>
        <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed" style={{ color: "var(--ink)" }}>
          {creative.description}
        </p>
      </div>
    </article>
  );
}

// ─── Main Chat component ───────────────────────────────────────────────────

export function Chat() {
  const initialMessage = (() => {
    try {
      return new URLSearchParams(window.location.search).get("message") ?? "Quero saber mais sobre isso";
    } catch {
      return "Quero saber mais sobre isso";
    }
  })();
  const businessSlug = useBusinessSlug();

  const [inputValue, setInputValue] = useState(initialMessage);
  const [messages, setMessages] = useState<Message[]>([]);
  const [stage, setStage] = useState<Stage>("chat");
  const [isBusy, setIsBusy] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(Boolean(businessSlug));
  const [callTriggered, setCallTriggered] = useState(false);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [trafficCreative, setTrafficCreative] = useState<TrafficSessionCreative | null>(null);
  const [trafficWelcomeStatus, setTrafficWelcomeStatus] =
    useState<LeadSessionResponse["trafficWelcomeStatus"]>(null);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [welcomeRetry, setWelcomeRetry] = useState(0);
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);
  const [tracking, setTracking] = useState<OrderTracking | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);

  // ── Call minimize state ──────────────────────────────────────────────────
  const [isCallMinimized, setIsCallMinimized] = useState(false);

  // ── Shared call timer (used by both CallScreen and MinimizedCallBanner) ──
  const [callElapsed, setCallElapsed] = useState(0);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Dismissed agent messages (per-id set) ───────────────────────────────
  const [dismissedAgentMsgIds, setDismissedAgentMsgIds] = useState<Set<string>>(new Set());

  // ── Buy modal (non-call path — visitor initiates buy from product shelf) ─
  const [buyModalOffering, setBuyModalOffering] = useState<ModalOffering | null>(null);
  // Product cards returned by the text-chat endpoint (the voice hook owns
  // shownProducts separately).
  const [chatProducts, setChatProducts] = useState<ProductCard[] | null>(null);

  const chatMsgsRef = useRef<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const welcomeAttemptsRef = useRef(new Set<string>());
  const gemini = useGeminiLive(leadId, businessSlug ?? "");

  // Auth context — detect B2B mode (logged-in owner chatting with another business)
  const { user, isLoggedIn } = useAuth();
  const isB2BMode = isLoggedIn && !!user && user.handle !== businessSlug;

  // Restore only the capability held in this browser session. Conversation
  // identifiers and visitor capabilities are intentionally never read from a
  // URL, where browser history, referrers, and shared links could expose them.
  const hydrateSession = useCallback((access: VisitorAccess, session: LeadSessionResponse) => {
    const restored = session.chatMessages.map((message, index) => ({
      id: `restored-${index}-${message.ts}`,
      role: message.role === "user" ? "user" as const : "bot" as const,
      text: message.text,
      ts: message.ts,
    }));
    setMessages(restored);
    chatMsgsRef.current = session.chatMessages;
    setLeadId(access.leadId);
    setTrackingOrderId(access.orderId ?? null);
    setTrafficCreative(session.trafficCreative);
    setTrafficWelcomeStatus(session.trafficWelcomeStatus);
    setCallTriggered(restored.length > 0 || Boolean(session.trafficCreative));
  }, []);

  const restoreSession = useCallback(async () => {
    if (!businessSlug) {
      setIsRestoringSession(false);
      return;
    }
    setIsRestoringSession(true);
    setConversationError(null);
    try {
      const restoredSession = await restoreTrafficConversation(businessSlug);
      if (restoredSession) hydrateSession(restoredSession.access, restoredSession.session);
    } catch {
      setConversationError("Não foi possível reabrir esta conversa. Verifica a ligação e tenta novamente.");
    } finally {
      setIsRestoringSession(false);
    }
  }, [businessSlug, hydrateSession]);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    if (
      !businessSlug ||
      !leadId ||
      !trafficCreative ||
      trafficWelcomeStatus === "complete" ||
      messages.length > 0
    ) return;
    const attemptKey = `${leadId}:${welcomeRetry}`;
    if (welcomeAttemptsRef.current.has(attemptKey)) return;
    welcomeAttemptsRef.current.add(attemptKey);
    let cancelled = false;

    const refreshUntilReady = async (): Promise<void> => {
      const api = visitorApi(businessSlug);
      setIsBusy(true);
      setStage("typing");
      setConversationError(null);
      try {
        const welcome = await api.startTrafficWelcome<{
          started: boolean;
          status: "pending" | "processing" | "complete" | "failed";
          reply?: string;
          products?: ProductCard[];
        }>(leadId);
        if (welcome.products?.length) setChatProducts(welcome.products);

        for (let attempt = 0; attempt < 20 && !cancelled; attempt += 1) {
          const access = loadCurrentVisitorAccess(businessSlug);
          if (!access) throw new Error("A sessão de visitante expirou");
          const session = await api.getLeadSession(leadId);
          if (session.chatMessages.length > 0 || session.trafficWelcomeStatus === "complete") {
            hydrateSession(access, session);
            return;
          }
          if (session.trafficWelcomeStatus === "failed") {
            throw new Error("O assistente não conseguiu responder");
          }
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
        }
        if (!cancelled) throw new Error("A resposta está a demorar mais do que o esperado");
      } catch {
        if (!cancelled) {
          setConversationError("Não foi possível obter a primeira resposta. Podes tentar novamente sem perder a conversa.");
          setTrafficWelcomeStatus("failed");
        }
      } finally {
        if (!cancelled) {
          setStage("chat");
          setIsBusy(false);
        }
      }
    };

    void refreshUntilReady();
    return () => { cancelled = true; };
  }, [
    businessSlug,
    hydrateSession,
    leadId,
    messages.length,
    trafficCreative,
    trafficWelcomeStatus,
    welcomeRetry,
  ]);

  const endConversation = useCallback(async () => {
    if (!businessSlug || !window.confirm("Terminar esta conversa guardada neste dispositivo?")) return;
    setIsBusy(true);
    try {
      await visitorApi(businessSlug).endLeadSession();
      setMessages([]);
      chatMsgsRef.current = [];
      setLeadId(null);
      setTrafficCreative(null);
      setTrafficWelcomeStatus(null);
      setTrackingOrderId(null);
      setTracking(null);
      setCallTriggered(false);
      setConversationError(null);
      setInputValue("Quero saber mais sobre isso");
    } catch {
      setConversationError("Não foi possível terminar a conversa. Tenta novamente.");
    } finally {
      setIsBusy(false);
    }
  }, [businessSlug]);

  const refreshTracking = useCallback(async () => {
    if (!businessSlug || !leadId || !trackingOrderId) return;
    setTrackingLoading(true);
    setTrackingError(null);
    try {
      const { tracking: next } = await visitorApi(businessSlug)
        .getOrderTracking<{ tracking: OrderTracking }>(trackingOrderId, leadId);
      setTracking(next);
    } catch {
      setTrackingError("Não foi possível actualizar o estado da encomenda.");
    } finally {
      setTrackingLoading(false);
    }
  }, [businessSlug, leadId, trackingOrderId]);

  useEffect(() => {
    if (!trackingOrderId || !leadId) return;
    void refreshTracking();
    const interval = window.setInterval(() => void refreshTracking(), 10000);
    return () => window.clearInterval(interval);
  }, [leadId, refreshTracking, trackingOrderId]);

  const handleOrderPaid = useCallback((orderId: string, orderLeadId: string) => {
    setLeadId(orderLeadId);
    setCallTriggered(true);
    setTrackingOrderId(orderId);
    setTracking(null);
    setBuyModalOffering(null);
  }, []);

  const handleInlineOrderPaid = useCallback((orderId: string) => {
    if (leadId) {
      setTrackingOrderId(orderId);
      setTracking(null);
    }
    gemini.clearCheckout();
  }, [gemini, leadId]);

  // Fetch business name to show in header
  const [businessName, setBusinessName] = useState<string | null>(null);
  useEffect(() => {
    if (!businessSlug) return;
    businessApi(businessSlug).getCatalog()
      .then((c) => { if (c.name) setBusinessName(c.name); })
      .catch(() => {});
  }, [businessSlug]);

  // Start/stop the shared timer when the call goes active
  useEffect(() => {
    if (stage === "call_active") {
      setCallElapsed(0);
      callTimerRef.current = setInterval(() => setCallElapsed((n) => n + 1), 1000);
    } else {
      // Call is no longer active — stop timer and collapse minimize state
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
      setIsCallMinimized(false);
    }
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, [stage]);

  useEffect(() => {
    if (!isCallMinimized) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, stage, isCallMinimized]);

  const addMessage = useCallback((role: BubbleRole, text: string): ChatMessage => {
    const ts = new Date().toISOString();
    const id = `${Date.now()}-${Math.random()}`;
    setMessages((prev) => [...prev, { id, role, text, ts }]);
    return { role: role === "user" ? "user" : "bot", text, ts };
  }, []);

  // ── First message ────────────────────────────────────────────────────────
  const handleFirstSend = useCallback(
    async (text: string) => {
      setIsBusy(true);
      setStage("typing");
      await new Promise((r) => setTimeout(r, isB2BMode ? 600 : 1200));

      // A scoped lead is a hard prerequisite for the call flow — without it
      // the call would run unattributed to any business (cross-tenant risk).
      let newLeadId: string | null = null;
      try {
        if (!businessSlug) throw new Error("missing business slug");

        // B2B: include sender's business identity in the lead origin so the
        // receiving owner can see who they're talking to in their Conversas panel.
        const origin: Record<string, string> = { url: window.location.href };
        if (isB2BMode && user) {
          origin.source = "b2b-mercado";
          origin.medium = "negocio";
          origin.content = `${user.name}${user.handle ? ` (@${user.handle})` : ""}`;
        }

        const { leadId: id } = await visitorApi(businessSlug).createLeadSession(
          origin,
          chatMsgsRef.current,
        );
        newLeadId = id;
        setLeadId(id);
        recordVisit(businessSlug);
      } catch {
        console.warn("[Chat] Failed to create lead session");
        addMessage(
          "bot",
          "Ocorreu um problema ao iniciar a conversa. Verifica a ligação e tenta enviar a mensagem de novo.",
        );
        setStage("chat");
        setIsBusy(false);
        return null;
      }

      if (isB2BMode) {
        // B2B mode: get AI text reply directly — no voice call trigger
        try {
          const { reply, products } = await visitorApi(businessSlug ?? "")
            .sendLeadChat<{ reply: string; products?: ProductCard[] }>(newLeadId!, text);
          addMessage("bot", reply);
          setChatProducts(products?.length ? products : null);
        } catch {
          addMessage("bot", "Desculpa, não consegui responder neste momento. Tenta de novo.");
        }
        setCallTriggered(true);
        setStage("chat");
        setIsBusy(false);
        return newLeadId;
      }

      // Consumer mode — greet + trigger incoming call
      const botText =
        "Olá. Obrigado pelo teu interesse. Vou ligar agora para te ajudar e perceber exactamente o que precisas.";
      const botMsg = addMessage("bot", botText);
      chatMsgsRef.current.push(botMsg);
      setStage("chat");

      setCallTriggered(true);
      setIsBusy(false);
      setTimeout(() => setStage("call_incoming"), 1000);
      return newLeadId;
    },
    [addMessage, businessSlug, isB2BMode, user],
  );

  // ── Subsequent chat messages ─────────────────────────────────────────────
  const handleChatSend = useCallback(
    async (text: string, currentLeadId: string) => {
      setIsBusy(true);
      setStage("typing");
      try {
        const { reply, products } = await visitorApi(businessSlug ?? "")
          .sendLeadChat<{ reply: string; products?: ProductCard[] }>(currentLeadId, text);
        addMessage("bot", reply);
        setChatProducts(products?.length ? products : null);
      } catch {
        addMessage("bot", "Desculpa, não consegui responder neste momento. Tenta de novo.");
      } finally {
        setStage("chat");
        setIsBusy(false);
      }
    },
    [addMessage],
  );

  // ── Main send handler ────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text || isBusy || isRestoringSession) return;
    const userMsg = addMessage("user", text);
    chatMsgsRef.current.push(userMsg);
    setInputValue("");

    if (!callTriggered) {
      void handleFirstSend(text);
    } else if (leadId) {
      void handleChatSend(text, leadId);
    } else {
      setIsBusy(true);
      setStage("typing");
      setTimeout(() => {
        addMessage("bot", "Obrigado pela mensagem! Estamos a processar o teu pedido.");
        setStage("chat");
        setIsBusy(false);
      }, 1000);
    }
  }, [inputValue, isBusy, isRestoringSession, callTriggered, leadId, addMessage, handleFirstSend, handleChatSend]);

  // ── Call flow ────────────────────────────────────────────────────────────
  const handleAccept = useCallback(() => {
    setStage("call_active");
    setIsCallMinimized(false);
    gemini.connect();
  }, [gemini]);

  const handleReject = useCallback(() => {
    setStage("chat");
    setIsBusy(false);
    addMessage(
      "bot",
      "Sem problema! 😊 Podes escrever aqui as tuas questões à vontade. Quando quiseres falar por voz, basta tocar no botão de chamada no topo.",
    );
  }, [addMessage]);

  const handleEndCall = useCallback(() => {
    gemini.disconnect();
    setStage("chat");
    setIsCallMinimized(false);
    setIsBusy(false);
    addMessage("bot", "Chamada terminada 📞 Se tiveres mais alguma questão, escreve aqui. Estou à disposição!");
  }, [gemini, addMessage]);

  const handleMinimize = useCallback(() => {
    setIsCallMinimized(true);
  }, []);

  const handleExpand = useCallback(() => {
    setIsCallMinimized(false);
  }, []);

  // ── Product selection (chat / inquiry) ──────────────────────────────────
  const handleProductSelect = useCallback(
    (product: ProductCard) => {
      gemini.sendText(`Quero saber mais sobre o ${product.name}`);
      gemini.clearProducts();
      setChatProducts(null);
      // If minimised, expand call so the user can hear the response
      if (isCallMinimized) setIsCallMinimized(false);
    },
    [gemini, isCallMinimized],
  );

  // ── Product buy (opens BuyModal for non-call path, or tells agent to checkout during call) ──
  const handleProductBuy = useCallback(
    (product: ProductCard) => {
      const isCallActive = stage === "call_active";
      if (isCallActive) {
        // During a live call: tell the agent the visitor wants to buy — agent will call initiate_checkout
        gemini.sendText(`Quero comprar o ${product.name}`);
        gemini.clearProducts();
        if (isCallMinimized) setIsCallMinimized(false);
      } else {
        // Outside a call: open the BuyModal directly
        setBuyModalOffering({
          name: product.name,
          price: product.price,
          description: product.description,
          imageUrl: product.imageUrl,
        });
        gemini.clearProducts();
        setChatProducts(null);
      }
    },
    [stage, gemini, isCallMinimized],
  );

  // ── Payment result from InlineCheckout ──────────────────────────────────
  const handlePaymentResult = useCallback(
    (orderId: string, status: string, offeringName: string) => {
      gemini.sendPaymentResult(orderId, status, offeringName);
    },
    [gemini],
  );

  // ── Header phone button ──────────────────────────────────────────────────
  const handleCallFromHeader = useCallback(() => {
    if (stage === "call_active") {
      // If minimised → expand; otherwise nothing
      setIsCallMinimized(false);
      return;
    }
    if (stage === "call_incoming" || isBusy) return;
    setStage("call_incoming");
  }, [stage, isBusy]);

  // ── Error recovery ───────────────────────────────────────────────────────
  useEffect(() => {
    if (gemini.callState === "error" && stage === "call_active") {
      setStage("chat");
      setIsCallMinimized(false);
      setIsBusy(false);
      addMessage("system", "A ligação foi interrompida. Tenta de novo.");
    }
  }, [gemini.callState, stage, addMessage]);

  // ── Visible agent messages (not dismissed) ───────────────────────────────
  const visibleAgentMessages = gemini.agentMessages.filter(
    (m) => !dismissedAgentMsgIds.has(m.id),
  );

  const dismissAgentMessage = useCallback((id: string) => {
    setDismissedAgentMsgIds((prev) => new Set([...prev, id]));
  }, []);

  const dismissAllAgentMessages = useCallback(() => {
    setDismissedAgentMsgIds(new Set(gemini.agentMessages.map((m) => m.id)));
  }, [gemini.agentMessages]);

  // Clear dismissed set when call ends
  useEffect(() => {
    if (stage !== "call_active") setDismissedAgentMsgIds(new Set());
  }, [stage]);

  const isCallActive = stage === "call_active";
  // B2B visitors don't trigger voice calls — text-only conversation
  const canCall = callTriggered && !isBusy && !isB2BMode;

  // ── RENDER ───────────────────────────────────────────────────────────────
  if (!businessSlug) return <Redirect to="/" />;

  // Derive Offering shape from the modal offering so BuyModal accepts it
  const buyModalOfferingAsOffering = buyModalOffering
    ? {
        name: buyModalOffering.name,
        price: buyModalOffering.price,
        description: buyModalOffering.description,
        imageUrl: buyModalOffering.imageUrl,
        id: 0,
        slug: "",
        order: 0,
        featured: false,
        catalogEnabled: false,
      }
    : null;

  return (
    <ChatLayout
      onBack={() => window.history.back()}
      onCall={canCall ? handleCallFromHeader : undefined}
      businessSlug={businessSlug}
      businessName={businessName ?? undefined}
    >
      {/* BuyModal — opened when visitor clicks "Comprar" outside of a call */}
      {buyModalOfferingAsOffering && (
        <BuyModal
          businessSlug={businessSlug}
          offering={buyModalOfferingAsOffering}
          onClose={() => setBuyModalOffering(null)}
          leadId={leadId}
          onOrderPaid={handleOrderPaid}
        />
      )}

      <div className="flex flex-col h-full overflow-hidden">
        {/* ── Incoming call overlay ── */}
        {stage === "call_incoming" && (
          <IncomingCallModal onAccept={handleAccept} onReject={handleReject} />
        )}

        {/* ── Minimised call banner ── */}
        {isCallActive && isCallMinimized && (
          <MinimizedCallBanner
            elapsed={callElapsed}
            isAiSpeaking={gemini.isAiSpeaking}
            hasProducts={!!gemini.shownProducts?.length}
            onExpand={handleExpand}
            onEnd={handleEndCall}
          />
        )}

        {/* ── Full call screen (shown when active & NOT minimised) ── */}
        {isCallActive && !isCallMinimized && (
          <div className="relative flex-1 min-h-0 overflow-hidden">
            {/*
              CallScreen fills the container.
              Overlays (vitrine, agent messages) are stacked above it via z-index
              within the same 'position: relative' ancestor.
            */}
            <div className="absolute inset-0">
              <CallScreen
                isAiSpeaking={gemini.isAiSpeaking}
                isUserSpeaking={gemini.isUserSpeaking}
                onEnd={handleEndCall}
                onMinimize={handleMinimize}
                elapsedSeconds={callElapsed}
              />
            </div>

            {/* Agent text messages — top overlay */}
            <AgentMessageOverlay
              messages={visibleAgentMessages}
              onDismissAll={dismissAllAgentMessages}
            />

            {/* Inline checkout overlay — shown when agent initiates payment during the call */}
            {businessSlug && gemini.activeCheckout && (
              <div className="absolute inset-x-0 bottom-0 z-40 flex flex-col justify-end pb-20 px-0">
                <InlineCheckout
                  businessSlug={businessSlug}
                    leadId={leadId}
                  checkout={gemini.activeCheckout}
                  onDone={(orderId, status, offeringName) => {
                    handlePaymentResult(orderId, status, offeringName);
                  }}
                  onDismiss={gemini.clearCheckout}
                   onOrderPaid={handleInlineOrderPaid}
                />
              </div>
            )}

            {/* Product vitrine — bottom overlay (hidden when checkout is active) */}
            {!gemini.activeCheckout && gemini.shownProducts && gemini.shownProducts.length > 0 && (
              <ProductVitrine
                products={gemini.shownProducts}
                onSelect={handleProductSelect}
                onBuy={handleProductBuy}
                onClose={gemini.clearProducts}
              />
            )}
          </div>
        )}

        {/* ── Chat view (always rendered when not in full call screen) ── */}
        {(!isCallActive || isCallMinimized) && (
          <>
            <div className="flex-1 overflow-y-auto chat-bg px-3 py-3 min-h-0">
              {/* Date label */}
              <div className="flex justify-center mb-3">
                <span
                  className="text-[11px] px-3 py-1.5 rounded-full"
                  style={{
                    background: "rgba(255,255,255,0.85)",
                    color: "#8696A0",
                  }}
                >
                  Hoje
                </span>
              </div>

              {leadId && (
                <div className="mb-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void endConversation()}
                    disabled={isBusy}
                    className="flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold disabled:opacity-50"
                    style={{ background: "rgba(255,255,255,0.8)", color: "var(--ink-soft)", border: "1px solid var(--border)" }}
                  >
                    <Trash2 size={13} /> Terminar conversa
                  </button>
                </div>
              )}

              {trafficCreative && <TrafficCreativeCard creative={trafficCreative} />}

              {messages.map((m) => (
                <ChatBubble key={m.id} role={m.role} text={m.text} />
              ))}
              {conversationError && (
                <div
                  className="my-3 rounded-2xl p-3"
                  style={{ background: "var(--errorBg)", border: "1px solid var(--errorBorder)", color: "var(--errorText)" }}
                >
                  <p className="text-[13px] leading-relaxed">{conversationError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      if (trafficCreative && leadId) {
                        welcomeAttemptsRef.current.delete(`${leadId}:${welcomeRetry}`);
                        setWelcomeRetry((value) => value + 1);
                      } else {
                        void restoreSession();
                      }
                    }}
                    className="mt-2 flex items-center gap-1 text-[12px] font-semibold underline"
                  >
                    <RefreshCw size={13} /> Tentar novamente
                  </button>
                </div>
              )}
              {isRestoringSession && (
                <div className="flex justify-center py-4">
                  <RefreshCw size={20} className="animate-spin" style={{ color: "var(--green)" }} />
                </div>
              )}
              {(trackingOrderId || trackingLoading || trackingError) && (
                <OrderTrackingCard
                  tracking={tracking}
                  loading={trackingLoading}
                  error={trackingError}
                  onRefresh={() => void refreshTracking()}
                />
              )}

              {/* Agent messages as chat bubbles when call is minimised */}
              {isCallActive && isCallMinimized && visibleAgentMessages.length > 0 && (
                <div className="mt-1">
                  {visibleAgentMessages.map((m) => (
                    <AgentMsgBubble
                      key={m.id}
                      msg={m}
                      onDismiss={() => dismissAgentMessage(m.id)}
                    />
                  ))}
                </div>
              )}

              {stage === "typing" && <ChatBubble role="bot" text="" isTyping />}

              <div ref={bottomRef} />
            </div>

            {/* Inline product shelf (when minimised and products available) */}
            {isCallActive && isCallMinimized && gemini.shownProducts && gemini.shownProducts.length > 0 && (
              <InlineProductShelf
                products={gemini.shownProducts}
                onSelect={handleProductSelect}
                onBuy={handleProductBuy}
                onClose={gemini.clearProducts}
              />
            )}

            {/* Product cards from the normal text chat (outside a call too). */}
            {!isCallActive && chatProducts && chatProducts.length > 0 && (
              <InlineProductShelf
                products={chatProducts}
                onSelect={handleProductSelect}
                onBuy={handleProductBuy}
                onClose={() => setChatProducts(null)}
              />
            )}

            {/* Inline checkout panel (shown when the AI agent initiates a payment during a call) */}
            {businessSlug && gemini.activeCheckout && (
              <InlineCheckout
                businessSlug={businessSlug}
                leadId={leadId}
                checkout={gemini.activeCheckout}
                onDone={(orderId, status, offeringName) => {
                  handlePaymentResult(orderId, status, offeringName);
                }}
                onDismiss={gemini.clearCheckout}
                onOrderPaid={handleInlineOrderPaid}
              />
            )}

            <ChatInput
              value={inputValue}
              onChange={setInputValue}
              onSend={handleSend}
              disabled={isBusy || isRestoringSession}
            />
          </>
        )}
      </div>
    </ChatLayout>
  );
}
