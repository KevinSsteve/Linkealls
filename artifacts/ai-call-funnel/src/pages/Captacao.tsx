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
import { ChatLayout } from "../components/ChatLayout";
import { ChatBubble, type BubbleRole } from "../components/ChatBubble";
import { ChatInput } from "../components/ChatInput";
import { IncomingCallModal } from "../components/IncomingCallModal";
import { CallScreen } from "../components/CallScreen";
import { useGeminiLive } from "../hooks/useGeminiLive";
import { createLeadSession, type LeadOrigin, type ChatMessage } from "../lib/api";

interface Message {
  id: string;
  role: BubbleRole;
  text: string;
  ts: string;
}

type Stage = "chat" | "typing" | "call_incoming" | "call_active";

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

export function Captacao() {
  const [inputValue, setInputValue] = useState(readInitialMessage);
  const [messages, setMessages] = useState<Message[]>([]);
  const [stage, setStage] = useState<Stage>("chat");
  const [hasSent, setHasSent] = useState(false);
  const [leadId, setLeadId] = useState<string | null>(null);

  const utmRef = useRef<LeadOrigin>(readUtmParams());
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

      // Create lead session in the background
      try {
        const { leadId: id } = await createLeadSession(
          utmRef.current,
          chatMsgsRef.current,
        );
        setLeadId(id);
      } catch {
        // Non-fatal — call still works without a lead record
        console.warn("[Captacao] Failed to create lead session");
      }

      setTimeout(() => setStage("call_incoming"), 1000);
    }, 1200);
  }, [inputValue, hasSent, addMessage]);

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

  return (
    <ChatLayout>
      <div className="flex flex-col h-full relative overflow-hidden">
        {stage === "call_incoming" && (
          <IncomingCallModal onAccept={handleAccept} onReject={handleReject} />
        )}

        {stage === "call_active" ? (
          <CallScreen
            isAiSpeaking={gemini.isAiSpeaking}
            isUserSpeaking={gemini.isUserSpeaking}
            onEnd={handleEndCall}
          />
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
