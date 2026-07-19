import { useEffect, useRef } from "react";
import { PhoneCall, PhoneOff } from "lucide-react";

interface IncomingCallModalProps {
  onAccept: () => void;
  onReject: () => void;
}

/** Generates a synthetic ringtone using Web Audio API */
function createRingtone() {
  const ctx = new AudioContext();
  let stopped = false;
  let timeoutId: ReturnType<typeof setTimeout>;

  const ring = () => {
    if (stopped) return;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.frequency.value = 480;
    osc2.frequency.value = 440;
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.8);
    osc2.stop(ctx.currentTime + 0.8);

    timeoutId = setTimeout(() => {
      if (!stopped) ring();
    }, 2500);
  };

  ring();

  return () => {
    stopped = true;
    clearTimeout(timeoutId);
    ctx.close();
  };
}

export function IncomingCallModal({ onAccept, onReject }: IncomingCallModalProps) {
  const stopRingtoneRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    stopRingtoneRef.current = createRingtone();
    return () => stopRingtoneRef.current?.();
  }, []);

  const handleAccept = () => {
    stopRingtoneRef.current?.();
    onAccept();
  };

  const handleReject = () => {
    stopRingtoneRef.current?.();
    onReject();
  };

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-between py-16 slide-up"
      style={{
        background: "linear-gradient(180deg, #0D1B22 0%, #0A1118 60%, #0D1B22 100%)",
        backdropFilter: "blur(20px)",
      }}
    >
      {/* Top info */}
      <div className="flex flex-col items-center gap-5">
        <p className="text-[#8696A0] text-sm tracking-widest uppercase">Chamada recebida</p>

        {/* Pulsing avatar */}
        <div className="relative flex items-center justify-center">
          {/* Outer rings */}
          <span className="pulse-ring absolute w-36 h-36 rounded-full border border-[#00A884]/30" />
          <span
            className="pulse-ring absolute w-36 h-36 rounded-full border border-[#00A884]/20"
            style={{ animationDelay: "0.5s" }}
          />

          {/* Avatar */}
          <div className="w-28 h-28 rounded-full bg-gradient-to-br from-[#00A884] to-[#008069] flex items-center justify-center shadow-2xl z-10">
            <span className="text-white text-5xl font-bold">A</span>
          </div>
        </div>

        <div className="text-center">
          <h2 className="text-white text-2xl font-semibold tracking-tight">Assistente IA</h2>
          <p className="text-[#8696A0] text-sm mt-1 animate-pulse">A ligar…</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-16">
        {/* Reject */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={handleReject}
            className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform"
            style={{ background: "linear-gradient(135deg, #FF3B30 0%, #C0392B 100%)" }}
          >
            <PhoneOff size={26} className="text-white" />
          </button>
          <span className="text-[#8696A0] text-xs">Recusar</span>
        </div>

        {/* Accept */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={handleAccept}
            className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform"
            style={{ background: "linear-gradient(135deg, #00A884 0%, #008069 100%)" }}
          >
            <PhoneCall size={26} className="text-white" />
          </button>
          <span className="text-[#8696A0] text-xs">Atender</span>
        </div>
      </div>
    </div>
  );
}
