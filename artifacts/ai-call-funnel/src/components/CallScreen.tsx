import { useEffect, useRef, useState } from "react";
import { PhoneOff, Mic, MicOff } from "lucide-react";
import { ChatBubble } from "./ChatBubble";
import type { TranscriptMessage } from "../hooks/useGeminiLive";

interface CallScreenProps {
  isAiSpeaking: boolean;
  isUserSpeaking: boolean;
  transcripts: TranscriptMessage[];
  onEnd: () => void;
}

function useCallTimer() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function CallScreen({ isAiSpeaking, isUserSpeaking, transcripts, onEnd }: CallScreenProps) {
  const timer = useCallTimer();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts]);

  return (
    <div className="flex flex-col h-full">
      {/* Call status bar */}
      <div
        className="flex items-center justify-between px-4 py-2 flex-shrink-0"
        style={{ background: "linear-gradient(135deg, #056449 0%, #025C4C 100%)" }}
      >
        <div className="flex items-center gap-2">
          {/* Animated voice indicator */}
          <div className="flex items-end gap-[3px] h-5">
            {[1, 2, 3, 4, 3].map((h, i) => (
              <span
                key={i}
                className="w-[3px] rounded-full bg-white/80"
                style={{
                  height: `${isAiSpeaking ? h * 5 : 4}px`,
                  transition: "height 0.15s ease",
                  animationDelay: `${i * 80}ms`,
                }}
              />
            ))}
          </div>
          <span className="text-white/90 text-xs font-medium">Em chamada</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Mic status */}
          <span className="text-white/70 text-xs">
            {isUserSpeaking ? (
              <Mic size={14} className="text-green-300" />
            ) : (
              <MicOff size={14} className="text-white/40" />
            )}
          </span>
          <span className="text-white font-mono text-sm font-semibold tabular-nums">{timer}</span>
        </div>
      </div>

      {/* Transcript area */}
      <div className="flex-1 overflow-y-auto chat-bg px-3 py-4">
        {transcripts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 opacity-50">
            <div className="flex items-end gap-[4px] h-8">
              {[2, 4, 6, 4, 2].map((h, i) => (
                <span
                  key={i}
                  className="w-[4px] rounded-full bg-gray-500"
                  style={{ height: `${h * 5}px` }}
                />
              ))}
            </div>
            <p className="text-gray-500 text-sm text-center">
              A transcrição da conversa aparecerá aqui
            </p>
          </div>
        ) : (
          transcripts.map((t) => (
            <ChatBubble
              key={t.id}
              role={t.role === "ai" ? "bot" : "user"}
              text={t.text}
            />
          ))
        )}

        {/* Live speaking indicator */}
        {isAiSpeaking && (
          <ChatBubble role="bot" text="" isTyping />
        )}

        <div ref={bottomRef} />
      </div>

      {/* End call button */}
      <div className="flex justify-center py-5 bg-white/50 backdrop-blur-sm flex-shrink-0">
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={onEnd}
            className="w-16 h-16 rounded-full flex items-center justify-center shadow-xl active:scale-95 transition-transform"
            style={{ background: "linear-gradient(135deg, #FF3B30 0%, #C0392B 100%)" }}
          >
            <PhoneOff size={26} className="text-white" />
          </button>
          <span className="text-gray-500 text-xs">Terminar chamada</span>
        </div>
      </div>
    </div>
  );
}
