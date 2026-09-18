/**
 * Página pública de captação de leads.
 *
 * Aceita parâmetros UTM na URL e inicia o funil (chat → chamada) igual ao Chat,
 * mas registando o lead no backend com a origem.
 * URL exemplo: /captacao?utm_source=facebook&utm_medium=cpc&utm_campaign=verao
 *
 * É esta página que os anúncios devem usar como destino.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { Redirect } from "wouter";
import { ChatLayout } from "../components/ChatLayout";
import { ChatBubble, type BubbleRole } from "../components/ChatBubble";
import { ChatInput } from "../components/ChatInput";
import { IncomingCallModal } from "../components/IncomingCallModal";
import { CallScreen } from "../components/CallScreen";
import { useGeminiLive, type ProductCard } from "../hooks/useGeminiLive";
import { type LeadOrigin, type ChatMessage } from "../lib/api";
import { visitorApi } from "../lib/visitorAccess";
import { useBusinessSlug } from "../hooks/useBusinessSlug";
import { recordVisit } from "../lib/visitedBusinesses";

interface Message {
  id: string;
  role: BubbleRole;
  text: string;
  ts: string;
}

type Stage = "chat" | "typing" | "call_incoming" | "call_active";

function useCallTimer() {
  const [s, setS] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setS((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return s;
}

function readUtmParams(): LeadOrigin {
  try {
    const p = new URLSearchParams(window.location.search);
    return {
      source:   p.get("utm_source")   ?? undefined,
      medium:   p.get("utm_medium")   ?? undefined,
      campaign: p.get("utm_campaign") ?? undefined,
      content:  p.get("utm_content")  ?? undefined,
      term:     p.get("utm_term")     ?? undefined,
      url:      window.location.href,
    };
  } catch {
    return {};
  }
}

function readInitialMessage(): string {
  try {
    return new URLSearchParams(window.location.search).get("message") ?? "Quero saber mais sobre isso";
  } catch {
    return "Quero saber mais sobre isso";
  }
}

function CaptacaoProductOverlay({
  products,
  onSelect,
}: {
  products: ProductCard[];
  onSelect: (product: ProductCard) => void;
}) {
  return (
    <div
      className="absolute inset-x-0 bottom-0 z-30 rounded-t-2xl px-4 pt-4 pb-5"
      style={{
        background: "#FFFFFF",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.18)",
        maxHeight: "58%",
        overflowY: "auto",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[15px] font-bold" style={{ color: "#0A2540" }}>
            Produtos disponíveis
          </p>
          <p className="text-[12px] mt-0.5" style={{ color: "#8898AA" }}>
            Escolhe um produto para saber mais
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {products.map((product, index) => (
          <button
            key={`${product.name}-${index}`}
            onClick={() => onSelect(product)}
            className="overflow-hidden rounded-2xl text-left transition-transform active:scale-[0.98]"
            style={{
              background: "#FFFFFF",
              border: "1px solid #E6EBF1",
            }}
          >
            <div className="h-24 flex items-center justify-center" style={{ background: "#F1F5F9" }}>
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="h-full w-full object-cover"
                  onError={(event) => { event.currentTarget.style.display = "none"; }}
                />
              ) : (
                <span className="text-2xl">🛍️</span>
              )}
            </div>
            <div className="p-2.5">
                <p className="text-[13px] font-semibold leading-tight line-clamp-2" style={{ color: "#0A2540" }}>
                {product.name}
              </p>
              {product.price && (
                <p className="mt-1 text-[12px] font-bold" style={{ color: "#635BFF" }}>
                  {product.price}
                </p>
              )}
              <span className="mt-2 block rounded-xl py-1.5 text-center text-[11px] font-semibold" style={{ background: "#635BFF", color: "#FFFFFF" }}>
                Quero saber mais
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Captacao() {
  const [inputValue, setInputValue] = useState(readInitialMessage);
  const [messages, setMessages] = useState<Message[]>([]);
  const [stage, setStage] = useState<Stage>("chat");
  const [hasSent, setHasSent] = useState(false);
  const [leadId, setLeadId] = useState<string | null>(null);

  const utmRef = useRef<LeadOrigin>(readUtmParams());
  const chatMsgsRef = useRef<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const businessSlug = useBusinessSlug();
  const gemini = useGeminiLive(leadId, businessSlug ?? "");
  const callElapsed = useCallTimer();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, stage]);

  const addMessage = useCallback((role: BubbleRole, text: string): ChatMessage => {
    const ts = new Date().toISOString();
    const id = `${Date.now()}-${Math.random()}`;
    setMessages((prev) => [...prev, { id, role, text, ts }]);
    return { role: role === "user" ? "user" : "bot", text, ts };
  }, []);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text || hasSent) return;

    const userMsg = addMessage("user", text);
    chatMsgsRef.current.push(userMsg);
    setInputValue("");
    setHasSent(true);
    setStage("typing");

    setTimeout(async () => {
      const botText = "Olá 👋 Obrigado pelo teu interesse. Vou ligar agora para te ajudar e perceber exatamente o que procuras.";
      const botMsg = addMessage("bot", botText);
      chatMsgsRef.current.push(botMsg);
      setStage("chat");

      // The live call is bound to a visitor capability. Do not start an
      // unlinked call if creating that capability failed.
      try {
        const { leadId: id } = await visitorApi(businessSlug ?? "").createLeadSession(
          utmRef.current,
          chatMsgsRef.current,
        );
        setLeadId(id);
        recordVisit(businessSlug ?? "");
        setTimeout(() => setStage("call_incoming"), 1000);
      } catch {
        console.warn("[Captacao] Failed to create lead session");
        addMessage("bot", "Não foi possível iniciar uma conversa segura. Verifica a ligação e tenta novamente.");
        setHasSent(false);
      }
    }, 1200);
  }, [inputValue, hasSent, addMessage, businessSlug]);

  const handleAccept = useCallback(() => {
    setStage("call_active");
    gemini.connect();
  }, [gemini]);

  const handleReject = useCallback(() => setStage("chat"), []);

  const handleEndCall = useCallback(() => {
    gemini.disconnect();
    setStage("chat");
    addMessage("bot", "Obrigado pelo contacto. Um consultor poderá continuar o atendimento pelo WhatsApp.");
  }, [gemini, addMessage]);

  useEffect(() => {
    if (gemini.callState === "error" && stage === "call_active") {
      setStage("chat");
      addMessage("system", "A ligação foi interrompida. Tenta de novo.");
    }
  }, [gemini.callState, stage, addMessage]);

  if (!businessSlug) return <Redirect to="/" />;

  return (
    <ChatLayout businessSlug={businessSlug}>
      <div className="flex flex-col h-full relative overflow-hidden">
        {stage === "call_incoming" && (
          <IncomingCallModal onAccept={handleAccept} onReject={handleReject} />
        )}

        {stage === "call_active" ? (
          <div className="relative flex-1 min-h-0 overflow-hidden">
            <CallScreen
              isAiSpeaking={gemini.isAiSpeaking}
              isUserSpeaking={gemini.isUserSpeaking}
              onEnd={handleEndCall}
              onMinimize={handleEndCall}
              elapsedSeconds={callElapsed}
            />
            {gemini.shownProducts && gemini.shownProducts.length > 0 && (
              <CaptacaoProductOverlay
                products={gemini.shownProducts}
                onSelect={(product) => {
                  gemini.sendText(`Quero saber mais sobre o ${product.name}`);
                  gemini.clearProducts();
                }}
              />
            )}
          </div>
        ) : (
          <>
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

            <ChatInput
              value={inputValue}
              onChange={setInputValue}
              onSend={handleSend}
              disabled={hasSent}
            />
          </>
        )}
      </div>
    </ChatLayout>
  );
}
