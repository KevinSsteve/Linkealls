import { useState, useEffect, useRef, useCallback } from "react";
import { Redirect } from "wouter";
import { ChatLayout } from "../components/ChatLayout";
import { ChatBubble, type BubbleRole } from "../components/ChatBubble";
import { ChatInput } from "../components/ChatInput";
import { IncomingCallModal } from "../components/IncomingCallModal";
import { CallScreen } from "../components/CallScreen";
import { useGeminiLive, type ProductCard, type AgentMessage } from "../hooks/useGeminiLive";
import { businessApi, type ChatMessage } from "../lib/api";
import { useBusinessSlug } from "../hooks/useBusinessSlug";
import { recordVisit } from "../lib/visitedBusinesses";
import {
  X,
  ShoppingBag,
  ImageOff,
  MessageSquare,
  Phone,
  ChevronUp,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: BubbleRole;
  text: string;
  ts: string;
}

type Stage = "chat" | "typing" | "call_incoming" | "call_active" | "call_ended";

function formatTime(s: number) {
  const m = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${m}:${ss}`;
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
        background: "#075E54",
        borderBottom: "1px solid rgba(0,0,0,0.08)",
      }}
    >
      {/* Pulsing dot */}
      <span className="relative flex items-center justify-center shrink-0">
        <span
          className="absolute inline-flex rounded-full opacity-75 animate-ping"
          style={{ width: 10, height: 10, background: "#25D366", animationDuration: "1.3s" }}
        />
        <span
          className="relative inline-flex rounded-full"
          style={{ width: 8, height: 8, background: "#25D366" }}
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
        className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform"
        style={{ background: "#EF4444" }}
        aria-label="Terminar chamada"
      >
        <Phone size={14} className="text-white" style={{ transform: "rotate(135deg)" }} />
      </button>

      {/* Expand */}
      <button
        onClick={onExpand}
        className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center active:scale-90"
        style={{ background: "rgba(255,255,255,0.15)" }}
        aria-label="Expandir chamada"
      >
        <ChevronUp size={15} style={{ color: "#fff" }} />
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
        style={{ background: "#D9FDD3" }}
      >
        <MessageSquare size={11} style={{ color: "#25D366" }} />
      </div>
      <div
        className="flex-1 rounded-2xl rounded-tl-sm px-3 py-2 text-[13px] leading-relaxed whitespace-pre-line"
        style={{
          background: "#FFFFFF",
          boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
          color: "#111B21",
        }}
      >
        {msg.text}
      </div>
      <button onClick={onDismiss} className="shrink-0 mt-1 opacity-40 hover:opacity-70">
        <X size={13} style={{ color: "#8696A0" }} />
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
              style={{ background: "#D9FDD3" }}
            >
              <MessageSquare size={11} style={{ color: "#25D366" }} />
            </div>
            <div
              className="flex-1 rounded-2xl rounded-tl-sm px-3 py-2 text-[13px] leading-relaxed whitespace-pre-line"
              style={{
                background: "rgba(255,255,255,0.92)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                color: "#111B21",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
              }}
            >
              {m.text}
            </div>
            <button
              className="shrink-0 mt-0.5 opacity-40 hover:opacity-80 transition-opacity"
              onClick={onDismissAll}
            >
              <X size={13} style={{ color: "#8696A0" }} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Product card ──────────────────────────────────────────────────────────

function ProductCardItem({ product, onSelect }: { product: ProductCard; onSelect: () => void }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className="flex-shrink-0 flex flex-col rounded-2xl overflow-hidden"
      style={{
        width: 150,
        background: "#FFFFFF",
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
      }}
    >
      <div
        className="w-full flex items-center justify-center"
        style={{ height: 110, background: "#F0F2F5", flexShrink: 0 }}
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
        <p className="text-[13px] font-semibold leading-tight line-clamp-2" style={{ color: "#111B21" }}>
          {product.name}
        </p>
        {product.price && (
          <p className="text-[12px] font-bold" style={{ color: "#25D366" }}>
            {product.price}
          </p>
        )}
        {product.description && (
          <p className="text-[11px] leading-relaxed line-clamp-2" style={{ color: "#667781" }}>
            {product.description}
          </p>
        )}
        <div className="mt-auto pt-1.5">
          <button
            onClick={onSelect}
            className="w-full py-2 rounded-xl text-[12px] font-semibold transition-colors"
            style={{ background: "#25D366", color: "#FFFFFF" }}
          >
            Selecionar
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
  onClose,
}: {
  products: ProductCard[];
  onSelect: (p: ProductCard) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl"
      style={{
        background: "#FFFFFF",
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
          <p className="text-[15px] font-bold" style={{ color: "#111B21" }}>Escolhe o que queres 👇</p>
          <p className="text-[12px] mt-0.5" style={{ color: "#8696A0" }}>
            {products.length} produto{products.length !== 1 ? "s" : ""} disponíve
            {products.length !== 1 ? "is" : "l"}
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: "#F0F2F5" }}
        >
          <X size={15} style={{ color: "#667781" }} />
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto px-4 pb-5 scrollbar-none flex-shrink-0">
        {products.map((p, i) => (
          <ProductCardItem key={i} product={p} onSelect={() => onSelect(p)} />
        ))}
      </div>
    </div>
  );
}

// ─── Inline product shelf (shown in chat when call is minimised) ───────────

function InlineProductShelf({
  products,
  onSelect,
  onClose,
}: {
  products: ProductCard[];
  onSelect: (p: ProductCard) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="mx-3 mb-2 rounded-2xl overflow-hidden"
      style={{
        background: "#FFFFFF",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        border: "1px solid #E9EDEF",
      }}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <p className="text-[13px] font-semibold" style={{ color: "#111B21" }}>
          Produtos sugeridos pelo assistente 🤖
        </p>
        <button onClick={onClose}>
          <X size={14} style={{ color: "#8696A0" }} />
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto px-3 pb-3 scrollbar-none">
        {products.map((p, i) => (
          <ProductCardItem key={i} product={p} onSelect={() => onSelect(p)} />
        ))}
      </div>
    </div>
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

  const [inputValue, setInputValue] = useState(initialMessage);
  const [messages, setMessages] = useState<Message[]>([]);
  const [stage, setStage] = useState<Stage>("chat");
  const [isBusy, setIsBusy] = useState(false);
  const [callTriggered, setCallTriggered] = useState(false);
  const [leadId, setLeadId] = useState<string | null>(null);

  // ── Call minimize state ──────────────────────────────────────────────────
  const [isCallMinimized, setIsCallMinimized] = useState(false);

  // ── Shared call timer (used by both CallScreen and MinimizedCallBanner) ──
  const [callElapsed, setCallElapsed] = useState(0);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Dismissed agent messages (per-id set) ───────────────────────────────
  const [dismissedAgentMsgIds, setDismissedAgentMsgIds] = useState<Set<string>>(new Set());

  const chatMsgsRef = useRef<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const businessSlug = useBusinessSlug();
  const gemini = useGeminiLive(leadId, businessSlug ?? "");

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
      await new Promise((r) => setTimeout(r, 1200));

      // A scoped lead is a hard prerequisite for the call flow — without it
      // the call would run unattributed to any business (cross-tenant risk).
      let newLeadId: string | null = null;
      try {
        if (!businessSlug) throw new Error("missing business slug");
        const { leadId: id } = await businessApi(businessSlug).createLeadSession(
          { url: window.location.href },
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

      const botText =
        "Olá 👋 Obrigado pelo teu interesse. Vou ligar agora para te ajudar e perceber exactamente o que precisas.";
      const botMsg = addMessage("bot", botText);
      chatMsgsRef.current.push(botMsg);
      setStage("chat");

      setCallTriggered(true);
      setIsBusy(false);
      setTimeout(() => setStage("call_incoming"), 1000);
      return newLeadId;
    },
    [addMessage, businessSlug],
  );

  // ── Subsequent chat messages ─────────────────────────────────────────────
  const handleChatSend = useCallback(
    async (text: string, currentLeadId: string) => {
      setIsBusy(true);
      setStage("typing");
      try {
        const { reply } = await businessApi(businessSlug ?? "").sendLeadChat(currentLeadId, text);
        addMessage("bot", reply);
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
    if (!text || isBusy) return;
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
  }, [inputValue, isBusy, callTriggered, leadId, addMessage, handleFirstSend, handleChatSend]);

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

  // ── Product selection ────────────────────────────────────────────────────
  const handleProductSelect = useCallback(
    (product: ProductCard) => {
      gemini.sendText(`Quero o ${product.name}`);
      gemini.clearProducts();
      // If minimised, expand call so the user can hear the response
      if (isCallMinimized) setIsCallMinimized(false);
    },
    [gemini, isCallMinimized],
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
  const canCall = callTriggered && !isBusy;

  // ── RENDER ───────────────────────────────────────────────────────────────
  if (!businessSlug) return <Redirect to="/" />;

  return (
    <ChatLayout
      onBack={() => window.history.back()}
      onCall={canCall ? handleCallFromHeader : undefined}
      businessSlug={businessSlug}
    >
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

            {/* Product vitrine — bottom overlay */}
            {gemini.shownProducts && gemini.shownProducts.length > 0 && (
              <ProductVitrine
                products={gemini.shownProducts}
                onSelect={handleProductSelect}
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

              {messages.map((m) => (
                <ChatBubble key={m.id} role={m.role} text={m.text} />
              ))}

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
                onClose={gemini.clearProducts}
              />
            )}

            <ChatInput
              value={inputValue}
              onChange={setInputValue}
              onSend={handleSend}
              disabled={isBusy}
            />
          </>
        )}
      </div>
    </ChatLayout>
  );
}
