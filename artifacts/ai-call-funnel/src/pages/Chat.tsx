import { useState, useEffect, useRef, useCallback } from "react";
import { ChatLayout } from "../components/ChatLayout";
import { ChatBubble, type BubbleRole } from "../components/ChatBubble";
import { ChatInput } from "../components/ChatInput";
import { IncomingCallModal } from "../components/IncomingCallModal";
import { CallScreen } from "../components/CallScreen";
import { useGeminiLive, type ProductCard } from "../hooks/useGeminiLive";
import { createLeadSession, sendLeadChat, type ChatMessage } from "../lib/api";
import { X, ShoppingBag, ImageOff } from "lucide-react";

interface Message {
  id: string;
  role: BubbleRole;
  text: string;
  ts: string;
}

type Stage = "chat" | "typing" | "call_incoming" | "call_active" | "call_ended";

// ─── Product Card component ────────────────────────────────────────────────

function ProductCardItem({
  product,
  onSelect,
}: {
  product: ProductCard;
  onSelect: () => void;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className="flex-shrink-0 flex flex-col rounded-2xl overflow-hidden"
      style={{
        width: 150,
        background: "linear-gradient(160deg, #111B2A 0%, #0D1520 100%)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* Image */}
      <div
        className="w-full flex items-center justify-center"
        style={{ height: 110, background: "#080E18", flexShrink: 0 }}
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
            <ShoppingBag size={28} className="text-[#3E576F]" />
            {imgError && <ImageOff size={12} className="text-[#3E576F]" />}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col flex-1 p-2.5 gap-1">
        <p className="text-[13px] font-semibold text-[#EAF0F7] leading-tight line-clamp-2">
          {product.name}
        </p>
        {product.price && (
          <p className="text-[12px] font-bold" style={{ color: "#00BFA5" }}>
            {product.price}
          </p>
        )}
        {product.description && (
          <p className="text-[11px] text-[#4A6580] leading-relaxed line-clamp-2">
            {product.description}
          </p>
        )}
        <div className="mt-auto pt-1.5">
          <button
            onClick={onSelect}
            className="w-full py-2 rounded-xl text-[12px] font-semibold transition-colors"
            style={{ background: "#00BFA5", color: "#050D14" }}
          >
            Selecionar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Product Vitrine (bottom sheet overlay during call) ────────────────────

function ProductVitrine({
  products,
  onSelect,
  onClose,
}: {
  products: ProductCard[];
  onSelect: (product: ProductCard) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute inset-x-0 bottom-0 z-20 flex flex-col"
      style={{
        background: "linear-gradient(180deg, rgba(5,10,18,0) 0%, rgba(5,10,18,0.97) 8%, #050A12 100%)",
        paddingTop: 32,
        maxHeight: "70%",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-3 flex-shrink-0">
        <div>
          <p className="text-[14px] font-bold text-[#EAF0F7]">Escolhe o que queres 👇</p>
          <p className="text-[11px] text-[#3E576F] mt-0.5">
            {products.length} produto{products.length !== 1 ? "s" : ""} disponíve{products.length !== 1 ? "is" : "l"}
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full flex items-center justify-center text-[#3E576F] hover:text-[#EAF0F7] transition-colors"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <X size={15} />
        </button>
      </div>

      {/* Horizontal scroll cards */}
      <div className="flex gap-3 overflow-x-auto px-4 pb-5 scrollbar-none flex-shrink-0">
        {products.map((p, i) => (
          <ProductCardItem key={i} product={p} onSelect={() => onSelect(p)} />
        ))}
      </div>
    </div>
  );
}

// ─── Main Chat component ────────────────────────────────────────────────────

export function Chat() {
  const initialMessage = (() => {
    try {
      const p = new URLSearchParams(window.location.search);
      return p.get("message") ?? "Quero saber mais sobre isso";
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

  const chatMsgsRef = useRef<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const gemini = useGeminiLive(leadId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, stage]);

  const addMessage = useCallback((role: BubbleRole, text: string): ChatMessage => {
    const ts = new Date().toISOString();
    const id = `${Date.now()}-${Math.random()}`;
    setMessages((prev) => [...prev, { id, role, text, ts }]);
    return { role: role === "user" ? "user" : "bot", text, ts };
  }, []);

  // ── First message: create lead + trigger call flow ───────────────────────
  const handleFirstSend = useCallback(async (text: string) => {
    setIsBusy(true);
    setStage("typing");
    await new Promise((r) => setTimeout(r, 1200));

    const botText =
      "Olá 👋 Obrigado pelo teu interesse. Vou ligar agora para te ajudar e perceber exactamente o que precisas.";
    const botMsg = addMessage("bot", botText);
    chatMsgsRef.current.push(botMsg);
    setStage("chat");

    let newLeadId: string | null = null;
    try {
      const { leadId: id } = await createLeadSession(
        { url: window.location.href },
        chatMsgsRef.current,
      );
      newLeadId = id;
      setLeadId(id);
    } catch {
      console.warn("[Chat] Failed to create lead session");
    }

    setCallTriggered(true);
    setIsBusy(false);
    setTimeout(() => setStage("call_incoming"), 1000);
    return newLeadId;
  }, [addMessage]);

  // ── Subsequent messages: Gemini text chat ───────────────────────────────
  const handleChatSend = useCallback(async (text: string, currentLeadId: string) => {
    setIsBusy(true);
    setStage("typing");
    try {
      const { reply } = await sendLeadChat(currentLeadId, text);
      addMessage("bot", reply);
    } catch {
      addMessage("bot", "Desculpa, não consegui responder neste momento. Tenta de novo.");
    } finally {
      setStage("chat");
      setIsBusy(false);
    }
  }, [addMessage]);

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

  // ── Call flow handlers ───────────────────────────────────────────────────
  const handleAccept = useCallback(() => {
    setStage("call_active");
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
    setIsBusy(false);
    addMessage(
      "bot",
      "Chamada terminada 📞 Se tiveres mais alguma questão, escreve aqui. Estou à disposição!",
    );
  }, [gemini, addMessage]);

  // ── Product selection from vitrine ──────────────────────────────────────
  const handleProductSelect = useCallback((product: ProductCard) => {
    gemini.sendText(`Quero o ${product.name}`);
    gemini.clearProducts();
  }, [gemini]);

  // ── Phone button in header ───────────────────────────────────────────────
  const handleCallFromHeader = useCallback(() => {
    if (stage === "call_active" || stage === "call_incoming" || isBusy) return;
    setStage("call_incoming");
  }, [stage, isBusy]);

  // ── Error recovery ───────────────────────────────────────────────────────
  useEffect(() => {
    if (gemini.callState === "error" && stage === "call_active") {
      setStage("chat");
      setIsBusy(false);
      addMessage("system", "A ligação foi interrompida. Tenta de novo.");
    }
  }, [gemini.callState, stage, addMessage]);

  const canCall = callTriggered && stage === "chat" && !isBusy;

  return (
    <ChatLayout
      onBack={() => window.history.back()}
      onCall={canCall ? handleCallFromHeader : undefined}
    >
      <div className="flex flex-col h-full relative overflow-hidden">
        {/* ── Incoming call overlay ── */}
        {stage === "call_incoming" && (
          <IncomingCallModal onAccept={handleAccept} onReject={handleReject} />
        )}

        {/* ── Active call ── */}
        {stage === "call_active" ? (
          <div className="relative flex-1 min-h-0">
            <CallScreen
              isAiSpeaking={gemini.isAiSpeaking}
              isUserSpeaking={gemini.isUserSpeaking}
              onEnd={handleEndCall}
            />
            {/* ── Product vitrine overlay ── */}
            {gemini.shownProducts && gemini.shownProducts.length > 0 && (
              <ProductVitrine
                products={gemini.shownProducts}
                onSelect={handleProductSelect}
                onClose={gemini.clearProducts}
              />
            )}
          </div>
        ) : (
          <>
            {/* ── Chat messages ── */}
            <div className="flex-1 overflow-y-auto chat-bg px-3 py-3 min-h-0">
              <div className="flex justify-center mb-3">
                <span
                  className="text-[11px] px-3 py-1 rounded-full"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    color: "#3E576F",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  Hoje
                </span>
              </div>

              {messages.map((m) => (
                <ChatBubble key={m.id} role={m.role} text={m.text} />
              ))}

              {stage === "typing" && <ChatBubble role="bot" text="" isTyping />}

              <div ref={bottomRef} />
            </div>

            {/* ── Input ── */}
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
