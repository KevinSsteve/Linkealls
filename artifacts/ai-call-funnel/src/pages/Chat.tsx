import { useState, useEffect, useRef, useCallback } from "react";
import { ChatLayout } from "../components/ChatLayout";
import { ChatBubble, type BubbleRole } from "../components/ChatBubble";
import { ChatInput } from "../components/ChatInput";
import { IncomingCallModal } from "../components/IncomingCallModal";
import { CallScreen } from "../components/CallScreen";
import { useGeminiLive } from "../hooks/useGeminiLive";
import { createLeadSession, sendLeadChat, type ChatMessage } from "../lib/api";

interface Message {
  id: string;
  role: BubbleRole;
  text: string;
  ts: string;
}

type Stage = "chat" | "typing" | "call_incoming" | "call_active" | "call_ended";

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

  /**
   * isBusy — true only while an API call is in-flight (typing animation shown).
   * Blocks input temporarily, never permanently.
   */
  const [isBusy, setIsBusy] = useState(false);

  /**
   * callTriggered — true once the first message was sent and the call flow started.
   * Subsequent messages go to Gemini text API instead of re-triggering the call.
   */
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

  // ── First message: create lead + trigger call flow ──────────────────────────
  const handleFirstSend = useCallback(async (text: string) => {
    setIsBusy(true);
    setStage("typing");

    // Small delay for typing feel
    await new Promise((r) => setTimeout(r, 1200));

    const botText =
      "Olá 👋 Obrigado pelo teu interesse. Vou ligar agora para te ajudar e perceber exactamente o que precisas.";
    const botMsg = addMessage("bot", botText);
    chatMsgsRef.current.push(botMsg);
    setStage("chat");

    // Create lead session
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

    // Trigger incoming call after a moment
    setTimeout(() => setStage("call_incoming"), 1000);

    return newLeadId;
  }, [addMessage]);

  // ── Subsequent messages: Gemini text chat ────────────────────────────────────
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

  // ── Main send handler ────────────────────────────────────────────────────────
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
      // Lead creation failed earlier — still show a graceful message
      setIsBusy(true);
      setStage("typing");
      setTimeout(() => {
        addMessage("bot", "Obrigado pela mensagem! Estamos a processar o teu pedido.");
        setStage("chat");
        setIsBusy(false);
      }, 1000);
    }
  }, [inputValue, isBusy, callTriggered, leadId, addMessage, handleFirstSend, handleChatSend]);

  // ── Call flow handlers ───────────────────────────────────────────────────────
  const handleAccept = useCallback(() => {
    setStage("call_active");
    gemini.connect();
  }, [gemini]);

  const handleReject = useCallback(() => {
    setStage("chat");
    setIsBusy(false);
    // Friendly message — IA explains it can continue by text
    addMessage(
      "bot",
      "Sem problema! 😊 Podes escrever aqui as tuas questões à vontade. Quando quiseres falar por voz, basta tocar no botão de chamada no topo.",
    );
  }, [addMessage]);

  const handleEndCall = useCallback(() => {
    gemini.disconnect();
    setStage("chat");
    setIsBusy(false);
    // Let Gemini answer contextually via text — show a brief bridge message
    addMessage(
      "bot",
      "Chamada terminada 📞 Se tiveres mais alguma questão, escreve aqui. Estou à disposição!",
    );
  }, [gemini, addMessage]);

  // ── Phone button in header: re-trigger call ──────────────────────────────────
  const handleCallFromHeader = useCallback(() => {
    if (stage === "call_active" || stage === "call_incoming" || isBusy) return;
    setStage("call_incoming");
  }, [stage, isBusy]);

  // ── Error recovery ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (gemini.callState === "error" && stage === "call_active") {
      setStage("chat");
      setIsBusy(false);
      addMessage("system", "A ligação foi interrompida. Tenta de novo.");
    }
  }, [gemini.callState, stage, addMessage]);

  // Whether the phone button should be available in header
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
          <CallScreen
            isAiSpeaking={gemini.isAiSpeaking}
            isUserSpeaking={gemini.isUserSpeaking}
            onEnd={handleEndCall}
          />
        ) : (
          <>
            {/* ── Chat messages ── */}
            <div className="flex-1 overflow-y-auto chat-bg px-3 py-3 min-h-0">
              {/* Date pill */}
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
