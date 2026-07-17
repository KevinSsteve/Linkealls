import { useVoiceCall, type CallState } from "../hooks/useVoiceCall";

const STATUS_LABEL: Record<CallState, string> = {
  idle: "Desligado",
  connecting: "A ligar...",
  active: "Em chamada",
  error: "Erro de ligação",
};

const STATUS_COLOR: Record<CallState, string> = {
  idle: "bg-gray-500",
  connecting: "bg-yellow-400 animate-pulse",
  active: "bg-green-400 animate-pulse",
  error: "bg-red-500",
};

function SpeakingRing({
  active,
  color,
  icon,
  label,
}: {
  active: boolean;
  color: string;
  icon: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`relative w-20 h-20 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
          active
            ? `${color} shadow-lg scale-110`
            : "border-gray-600 bg-gray-800/40"
        }`}
      >
        {active && (
          <span
            className={`absolute inset-0 rounded-full opacity-40 animate-ping`}
            style={{ border: "2px solid currentColor" }}
          />
        )}
        <span className="text-3xl select-none">{icon}</span>
      </div>
      <span className="text-sm text-gray-400 font-medium">{label}</span>
    </div>
  );
}

/** Dimmed caption that fades in when text is present */
function Transcript({ text, side }: { text: string; side: "left" | "right" }) {
  if (!text) return null;
  return (
    <p
      className={`text-xs text-gray-400 max-w-[160px] text-center leading-relaxed transition-opacity duration-300 ${
        side === "left" ? "self-end" : "self-start"
      }`}
    >
      {text}
    </p>
  );
}

export function CallInterface() {
  const {
    callState,
    isAiSpeaking,
    isUserSpeaking,
    aiTranscript,
    userTranscript,
    errorMessage,
    startCall,
    endCall,
  } = useVoiceCall();

  const isIdle = callState === "idle" || callState === "error";
  const isConnecting = callState === "connecting";
  const isActive = callState === "active";

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-white gap-8 p-6">
      {/* Title */}
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Chamada por Voz com IA
        </h1>
        <p className="text-sm text-gray-500">Gemini Live · Bidirecional em tempo real</p>
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-2.5">
        <span className={`w-2.5 h-2.5 rounded-full ${STATUS_COLOR[callState]}`} />
        <span className="text-base text-gray-300">{STATUS_LABEL[callState]}</span>
      </div>

      {/* Speaking indicators */}
      {isActive && (
        <div className="flex flex-col items-center gap-4 w-full max-w-xs">
          <div className="flex gap-12 justify-center">
            <SpeakingRing
              active={isUserSpeaking}
              color="border-blue-400 bg-blue-400/10"
              icon="🎤"
              label="Tu"
            />
            <SpeakingRing
              active={isAiSpeaking}
              color="border-violet-400 bg-violet-400/10"
              icon="🤖"
              label="IA"
            />
          </div>

          {/* Transcription captions */}
          <div className="flex gap-4 w-full justify-around min-h-[2.5rem]">
            <Transcript text={userTranscript} side="left" />
            <Transcript text={aiTranscript} side="right" />
          </div>
        </div>
      )}

      {/* Idle placeholder */}
      {callState === "idle" && (
        <div className="flex gap-12 opacity-30 pointer-events-none">
          <SpeakingRing active={false} color="" icon="🎤" label="Tu" />
          <SpeakingRing active={false} color="" icon="🤖" label="IA" />
        </div>
      )}

      {/* Connecting placeholder */}
      {callState === "connecting" && (
        <div className="flex gap-12 opacity-40 pointer-events-none animate-pulse">
          <SpeakingRing active={false} color="" icon="🎤" label="Tu" />
          <SpeakingRing active={false} color="" icon="🤖" label="IA" />
        </div>
      )}

      {/* Error message */}
      {errorMessage && (
        <p className="text-sm text-red-400 text-center max-w-xs">{errorMessage}</p>
      )}

      {/* Call button */}
      <div>
        {isIdle ? (
          <button
            onClick={startCall}
            className="px-10 py-3.5 bg-green-600 hover:bg-green-500 active:bg-green-700 rounded-full font-semibold text-base transition-colors shadow-lg shadow-green-900/40"
          >
            Iniciar Chamada
          </button>
        ) : (
          <button
            onClick={endCall}
            disabled={isConnecting}
            className="px-10 py-3.5 bg-red-600 hover:bg-red-500 active:bg-red-700 rounded-full font-semibold text-base transition-colors shadow-lg shadow-red-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConnecting ? "A ligar..." : "Encerrar Chamada"}
          </button>
        )}
      </div>

      {/* Hint */}
      {callState === "idle" && (
        <p className="text-xs text-gray-600 text-center max-w-xs">
          Ao iniciar, o teu microfone será ativado e ficará ligado à IA em
          tempo real.
        </p>
      )}
    </div>
  );
}
