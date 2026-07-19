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

type Stage =
  | "chat"           // Normal chat
  | "typing"         // Bot is "typing"
  | "call_incoming"  // Incoming call modal
  | "call_active"    // Voice call active
  | "call_ended";    // Call ended, goodbye shown

export function Chat() {
  // Pre-fill input from URL ?message= param
  const initialMessage = (() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("message") ?? "Quero saber mais sobre isso";
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

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, stage]);

  const addMessage = useCallback((role: BubbleRole, text: string): string => {
    const id = `${Date.now()}-${Math.random()}`;
    setMessages((prev) => [...prev, { id, role, text }]);
    return id;
  }, []);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text || hasSent) return;

    // 1. Show user message in chat
    addMessage("user", text);
    setInputValue("");
    setHasSent(true);
    setStage("typing");

    // 2. Bot "typing" → reply after 1.2s
    setTimeout(() => {
      const botReply =
        "Olá 👋 Obrigado pelo teu interesse. Vou ligar agora para te ajudar e perceber exatamente o que procuras.";
      addMessage("bot", botReply);
      setStage("chat");

      // 3. Show incoming call modal 1s after bot reply
      setTimeout(() => {
        setStage("call_incoming");
      }, 1000);
    }, 1200);
  }, [inputValue, hasSent, addMessage]);

  const handleAcceptCall = useCallback(() => {
    setStage("call_active");
    gemini.connect();
  }, [gemini]);

  const handleRejectCall = useCallback(() => {
    setStage("chat");
  }, []);

  const handleEndCall = useCallback(() => {
    gemini.disconnect();
    setStage("call_ended");
    // Add goodbye message to chat
    addMessage("bot", "Obrigado pelo contacto. Um consultor poderá continuar o atendimento pelo WhatsApp.");
    // Return to normal chat view after a moment
    setTimeout(() => setStage("chat"), 500);
  }, [gemini, addMessage]);

  // If Gemini errors during call, fall back
  useEffect(() => {
    if (gemini.callState === "error" && stage === "call_active") {
      setStage("chat");
      addMessage("system", "A ligação foi interrompida. Tenta de novo.");
    }
  }, [gemini.callState, stage, addMessage]);

  return (
    <ChatLayout>
      <div className="flex flex-col h-full relative">
        {/* Active call view */}
        {stage === "call_active" && (
          <CallScreen
            isAiSpeaking={gemini.isAiSpeaking}
            isUserSpeaking={gemini.isUserSpeaking}
            transcripts={gemini.transcripts}
            onEnd={handleEndCall}
          />
        )}

        {/* Incoming call modal */}
        {stage === "call_incoming" && (
          <IncomingCallModal
            onAccept={handleAcceptCall}
            onReject={handleRejectCall}
          />
        )}

        {/* Chat view (shown when not in active call) */}
        {stage !== "call_active" && (
          <>
            {/* Messages area */}
            <div className="flex-1 overflow-y-auto chat-bg px-3 py-4">
              {messages.length === 0 && (
                <div className="flex justify-center mt-8">
                  <span className="bg-[#FFF3CD]/80 text-[#856404] text-[11px] px-3 py-1 rounded-full">
                    Hoje
                  </span>
                </div>
              )}

              {messages.map((msg) => (
                <ChatBubble key={msg.id} role={msg.role} text={msg.text} />
              ))}

              {/* Typing indicator */}
              {stage === "typing" && <ChatBubble role="bot" text="" isTyping />}

              <div ref={bottomRef} />
            </div>

            {/* Input bar */}
            <ChatInput
              value={inputValue}
              onChange={setInputValue}
              onSend={handleSend}
              disabled={hasSent || stage === "typing"}
            />
          </>
        )}
      </div>
    </ChatLayout>
  );
}
