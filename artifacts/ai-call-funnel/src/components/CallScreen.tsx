import { useEffect, useRef, useState } from "react";
import { PhoneOff } from "lucide-react";

interface CallScreenProps {
  isAiSpeaking: boolean;
  isUserSpeaking: boolean;
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

const NUM_BARS = 20;

export function CallScreen({ isAiSpeaking, isUserSpeaking, onEnd }: CallScreenProps) {
  const timer = useCallTimer();
  const [frame, setFrame] = useState(0);

  /* Animate audio bars */
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => f + 1), 80);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: "linear-gradient(180deg, #060C14 0%, #071A11 100%)" }}
    >
      {/* ── Timer bar ── */}
      <div
        className="flex items-center justify-between px-5 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(0,200,150,0.1)" }}
      >
        <span className="text-sm font-medium" style={{ color: "#00C896" }}>
          Em chamada
        </span>
        <span
          className="font-mono text-sm font-semibold tabular-nums"
          style={{ color: "#EAF0F7" }}
        >
          {timer}
        </span>
      </div>

      {/* ── Central visualizer ── */}
      <div className="flex-1 flex flex-col items-center justify-center gap-10">
        {/* Avatar ring */}
        <div className="relative flex items-center justify-center">
          {/* Pulsing outer ring when speaking */}
          {isAiSpeaking && (
            <>
              <div
                className="absolute rounded-full animate-ping"
                style={{
                  width: 128,
                  height: 128,
                  background: "rgba(0,200,150,0.15)",
                  animationDuration: "1.4s",
                }}
              />
              <div
                className="absolute rounded-full animate-ping"
                style={{
                  width: 104,
                  height: 104,
                  background: "rgba(0,200,150,0.2)",
                  animationDuration: "1s",
                  animationDelay: "0.2s",
                }}
              />
            </>
          )}
          {/* Avatar circle */}
          <div
            className="relative w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold"
            style={{
              background: isAiSpeaking
                ? "linear-gradient(135deg, #00C896 0%, #007A5E 100%)"
                : "linear-gradient(135deg, #1A2F3E 0%, #0D1F2C 100%)",
              boxShadow: isAiSpeaking
                ? "0 0 40px rgba(0,200,150,0.4)"
                : "0 0 20px rgba(0,0,0,0.4)",
              transition: "all 0.3s ease",
              color: isAiSpeaking ? "#fff" : "#3E576F",
            }}
          >
            AI
          </div>
        </div>

        {/* Waveform bars */}
        <div className="flex items-end gap-[3px]" style={{ height: 56 }}>
          {Array.from({ length: NUM_BARS }).map((_, i) => {
            const phase = (frame * 0.6 + i * 0.7) % (Math.PI * 2);
            const heightPct = isAiSpeaking
              ? 0.2 + 0.8 * Math.abs(Math.sin(phase))
              : isUserSpeaking
              ? 0.1 + 0.3 * Math.abs(Math.sin(phase * 1.5 + i))
              : 0.06;
            const h = Math.max(4, Math.round(heightPct * 56));
            const active = isAiSpeaking || isUserSpeaking;
            return (
              <span
                key={i}
                className="rounded-full transition-all"
                style={{
                  width: "3px",
                  height: `${h}px`,
                  background: isAiSpeaking
                    ? `rgba(0,200,150,${0.4 + 0.6 * heightPct})`
                    : isUserSpeaking
                    ? `rgba(52,211,153,${0.3 + 0.5 * heightPct})`
                    : "rgba(62,87,111,0.4)",
                  transitionDuration: active ? "80ms" : "300ms",
                }}
              />
            );
          })}
        </div>

        {/* Status label */}
        <p
          className="text-sm"
          style={{ color: isAiSpeaking ? "#00C896" : isUserSpeaking ? "#34D399" : "#3E576F" }}
        >
          {isAiSpeaking ? "A falar…" : isUserSpeaking ? "A ouvir…" : "Em espera"}
        </p>
      </div>

      {/* ── End call ── */}
      <div
        className="flex justify-center py-8 flex-shrink-0"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
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
