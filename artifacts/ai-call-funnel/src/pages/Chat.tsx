import { useState, useEffect, useRef, useCallback } from "react";
import { ChatLayout } from "../components/ChatLayout";
import { ChatBubble, type BubbleRole } from "../components/ChatBubble";
import { ChatInput } from "../components/ChatInput";
import { IncomingCallModal } from "../components/IncomingCallModal";
import { CallScreen } from "../components/CallScreen";
import { useGeminiLive } from "../hooks/useGeminiLive";

interface Message {
  id: string;
  role: BubbleRole;
  text: string;
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
  const [hasSent, setHasSent] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const gemini = useGeminiLive();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, stage]);

  const addMessage = useCallback((role: BubbleRole, text: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setMessages((prev) => [...prev, { id, role, text }]);
  }, []);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text || hasSent) return;

    addMessage("user", text);
    setInputValue("");
    setHasSent(true);
    setStage("typing");

    setTimeout(() => {
      addMessage(
        "bot",
        "Olá 👋 Obrigado pelo teu interesse. Vou ligar agora para te ajudar e perceber exatamente o que procuras.",
      );
      setStage("chat");
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
    addMessage(
      "bot",
      "Obrigado pelo contacto. Um consultor poderá continuar o atendimento pelo WhatsApp.",
    );
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
        {/* ── Incoming call overlay ── */}
        {stage === "call_incoming" && (
          <IncomingCallModal onAccept={handleAccept} onReject={handleReject} />
        )}

        {/* ── Active call ── */}
        {stage === "call_active" ? (
          <CallScreen
            isAiSpeaking={gemini.isAiSpeaking}
            isUserSpeaking={gemini.isUserSpeaking}
            transcripts={gemini.transcripts}
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
              disabled={hasSent}
            />
          </>
        )}
      </div>
    </ChatLayout>
  );
}
