import { useEffect, useRef, useCallback } from "react";
import { PhoneCall, PhoneOff } from "lucide-react";
import { useDialogFocus } from "../hooks/useDialogFocus";

interface IncomingCallModalProps {
  onAccept: () => void;
  onReject: () => void;
}

function safeClose(ctx: AudioContext): void {
  try {
    if (ctx.state !== "closed") ctx.close().catch(() => {});
  } catch { /* ignore */ }
}

function createRingtone(): () => void {
  const ctx = new AudioContext();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;

  const ring = () => {
    if (stopped || ctx.state === "closed") return;
    try {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.frequency.value = 480;
      osc2.frequency.value = 440;
      osc1.type = "sine";
      osc2.type = "sine";
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
      osc1.start(ctx.currentTime);
      osc2.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.9);
      osc2.stop(ctx.currentTime + 0.9);
    } catch { /* ignore if context changed state */ }

    timer = setTimeout(() => { if (!stopped) ring(); }, 2800);
  };

  ring();

  // Returned stop fn is idempotent — safe to call multiple times
  return () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    safeClose(ctx);
  };
}

export function IncomingCallModal({ onAccept, onReject }: IncomingCallModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    stopRef.current = createRingtone();
    return () => {
      stopRef.current?.();
      stopRef.current = null;
    };
  }, []);

  const accept = useCallback(() => {
    const stop = stopRef.current;
    stopRef.current = null;
    stop?.();
    onAccept();
  }, [onAccept]);

  const reject = useCallback(() => {
    const stop = stopRef.current;
    stopRef.current = null;
    stop?.();
    onReject();
  }, [onReject]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") reject();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [reject]);

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Chamada do assistente IA"
      className="absolute inset-0 z-50 flex flex-col items-center slide-up overflow-hidden"
      style={{ background: "linear-gradient(180deg, #211b2c 0%, var(--header-bg) 48%, #100d16 100%)" }}
    >
      {/* Top glow */}
      <div
        className="absolute top-0 left-1/2 w-72 h-72 rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(142,214,196,0.12) 0%, transparent 70%)",
          filter: "blur(30px)",
          transform: "translateX(-50%) translateY(-30%)",
        }}
      />

      {/* Info */}
      <div className="flex flex-col items-center gap-6 pt-20 flex-1">
        <p className="text-[11px] tracking-[0.18em] uppercase font-medium" style={{ color: "#c8c2cc" }}>
          Chamada recebida
        </p>

        {/* Avatar + rings */}
        <div className="relative flex items-center justify-center w-40 h-40">
          {[0, 0.6, 1.2].map((delay) => (
            <span
              key={delay}
              className="pulse-ring absolute rounded-full"
              style={{
                width: "140px", height: "140px",
                border: `1px solid rgba(142,214,196,${0.3 - delay * 0.08})`,
                animationDelay: `${delay}s`,
              }}
            />
          ))}
          <div
            className="relative w-24 h-24 rounded-full flex items-center justify-center text-5xl font-bold text-white z-10"
            style={{
              background: "linear-gradient(135deg, #31806c 0%, #174e42 100%)",
              boxShadow: "0 0 48px rgba(49,128,108,0.35), 0 0 0 1px rgba(142,214,196,0.24)",
            }}
          >
            A
          </div>
        </div>

        <div className="text-center">
          <h2 className="text-2xl font-semibold tracking-tight" style={{ color: "#EAF0F7" }}>
            Assistente IA
          </h2>
          <div className="flex items-center justify-center gap-1.5 mt-2">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "#8ed6c4" }} />
            <p className="text-sm" style={{ color: "#c8c2cc" }}>A ligar…</p>
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex items-end justify-center gap-20 pb-20 w-full">
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={reject}
            aria-label="Recusar chamada"
            className="w-16 h-16 rounded-full flex items-center justify-center active:scale-90 transition-transform"
            style={{ background: "linear-gradient(135deg,#C0392B,#96200F)", boxShadow: "0 8px 24px rgba(192,57,43,0.4)" }}
          >
            <PhoneOff size={25} className="text-white" />
          </button>
          <span className="text-xs" style={{ color: "#c8c2cc" }}>Recusar</span>
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            onClick={accept}
            aria-label="Atender chamada"
            className="w-16 h-16 rounded-full flex items-center justify-center active:scale-90 transition-transform glow-pulse"
            style={{ background: "linear-gradient(135deg,#31806c,#174e42)", boxShadow: "0 8px 24px rgba(36,106,89,0.45)" }}
          >
            <PhoneCall size={25} className="text-white" />
          </button>
          <span className="text-xs" style={{ color: "#c8c2cc" }}>Atender</span>
        </div>
      </div>
    </div>
  );
}
