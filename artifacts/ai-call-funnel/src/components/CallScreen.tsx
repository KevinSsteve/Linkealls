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
  const [s, setS] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setS((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const m = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${m}:${ss}`;
}

const BAR_HEIGHTS = [3, 6, 10, 14, 10, 6, 3];

export function CallScreen({ isAiSpeaking, isUserSpeaking, transcripts, onEnd }: CallScreenProps) {
  const timer = useCallTimer();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts]);

  /* Animate audio bars */
  useEffect(() => {
    if (!isAiSpeaking) return;
    const id = setInterval(() => setFrame((f) => f + 1), 120);
    return () => clearInterval(id);
  }, [isAiSpeaking]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Status bar ── */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{
          background: "linear-gradient(135deg, #093626 0%, #061F18 100%)",
          borderBottom: "1px solid rgba(0,200,150,0.15)",
        }}
      >
        {/* Left: wave + label */}
        <div className="flex items-center gap-2">
          <div className="flex items-end gap-[3px] h-5">
            {BAR_HEIGHTS.map((base, i) => {
              const animated = isAiSpeaking
                ? base + Math.sin((frame * 0.8 + i) * 1.3) * 5
                : 3;
              return (
                <span
                  key={i}
                  className="rounded-full transition-all duration-150"
                  style={{
                    width: "3px",
                    height: `${Math.max(3, animated)}px`,
                    background: isAiSpeaking
                      ? "rgba(0,200,150,0.85)"
                      : "rgba(0,200,150,0.3)",
                  }}
                />
              );
            })}
          </div>
          <span className="text-xs font-medium" style={{ color: "#00C896" }}>
            Em chamada
          </span>
        </div>

        {/* Right: mic + timer */}
        <div className="flex items-center gap-3">
          {isUserSpeaking ? (
            <Mic size={14} style={{ color: "#34D399" }} />
          ) : (
            <MicOff size={14} style={{ color: "#3E576F" }} />
          )}
          <span
            className="font-mono text-sm font-semibold tabular-nums"
            style={{ color: "#EAF0F7" }}
          >
            {timer}
          </span>
        </div>
      </div>

      {/* ── Transcripts ── */}
      <div className="flex-1 overflow-y-auto chat-bg px-3 py-4 min-h-0">
        {transcripts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 opacity-40">
            <div className="flex items-end gap-[5px] h-10">
              {BAR_HEIGHTS.map((h, i) => (
                <span
                  key={i}
                  className="rounded-full"
                  style={{ width: "4px", height: `${h}px`, background: "#00C896" }}
                />
              ))}
            </div>
            <p className="text-sm text-center" style={{ color: "#7B96B2" }}>
              A transcrição aparecerá aqui
            </p>
          </div>
        ) : (
          <>
            {transcripts.map((t) => (
              <ChatBubble
                key={t.id}
                role={t.role === "ai" ? "bot" : "user"}
                text={t.text}
              />
            ))}
          </>
        )}

        {isAiSpeaking && <ChatBubble role="bot" text="" isTyping />}
        <div ref={bottomRef} />
      </div>

      {/* ── End call ── */}
      <div
        className="flex justify-center py-5 flex-shrink-0"
        style={{ borderTop: "1px solid #111E30", background: "#060C14" }}
      >
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={onEnd}
            className="w-16 h-16 rounded-full flex items-center justify-center active:scale-90 transition-transform"
            style={{
              background: "linear-gradient(135deg, #C0392B 0%, #96200F 100%)",
              boxShadow: "0 8px 24px rgba(192,57,43,0.4)",
            }}
          >
            <PhoneOff size={25} className="text-white" />
          </button>
          <span className="text-xs" style={{ color: "#3E576F" }}>
            Terminar chamada
          </span>
        </div>
      </div>
    </div>
  );
}
