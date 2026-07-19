import { useState, useCallback, useRef, useEffect } from "react";
import { startAudioCapture, type AudioCapture } from "../lib/audioCapture";
import { AudioPlayer } from "../lib/audioPlayer";

export type CallState = "idle" | "connecting" | "active" | "error" | "ended";

export interface TranscriptMessage {
  id: string;
  role: "ai" | "user";
  text: string;
  timestamp: Date;
}

type ServerMessage =
  | { type: "ready" }
  | { type: "audio"; data: string }
  | { type: "turn_complete" }
  | { type: "interrupted" }
  | { type: "transcript"; text: string }
  | { type: "user_transcript"; text: string }
  | { type: "closed" }
  | { type: "error"; message: string };

export interface GeminiLiveState {
  callState: CallState;
  isAiSpeaking: boolean;
  isUserSpeaking: boolean;
  transcripts: TranscriptMessage[];
  errorMessage: string | null;
  connect: () => void;
  disconnect: () => void;
}

const VAD_THRESHOLD = 0.012;

export function useGeminiLive(): GeminiLiveState {
  const [callState, setCallState] = useState<CallState>("idle");
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [transcripts, setTranscripts] = useState<TranscriptMessage[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const captureRef = useRef<AudioCapture | null>(null);
  const vadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callStateRef = useRef<CallState>("idle");
  callStateRef.current = callState;

  // Accumulate partial transcripts within a turn
  const aiPartialRef = useRef("");
  const userPartialRef = useRef("");

  const addTranscript = useCallback((role: "ai" | "user", text: string) => {
    if (!text.trim()) return;
    setTranscripts((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, role, text: text.trim(), timestamp: new Date() },
    ]);
  }, []);

  const cleanup = useCallback(() => {
    if (vadTimerRef.current) { clearInterval(vadTimerRef.current); vadTimerRef.current = null; }
    captureRef.current?.stop(); captureRef.current = null;
    playerRef.current?.destroy(); playerRef.current = null;
    wsRef.current?.close(); wsRef.current = null;
    setIsAiSpeaking(false);
    setIsUserSpeaking(false);
    aiPartialRef.current = "";
    userPartialRef.current = "";
  }, []);

  const connect = useCallback(() => {
    if (callStateRef.current !== "idle" && callStateRef.current !== "error") return;

    setCallState("connecting");
    setErrorMessage(null);
    setTranscripts([]);
    aiPartialRef.current = "";
    userPartialRef.current = "";

    const player = new AudioPlayer();
    playerRef.current = player;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/api/call-funnel-ws`);
    wsRef.current = ws;

    ws.onmessage = (event: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;

        switch (msg.type) {
          case "ready":
            // Mic capture starts after "ready" — this is when we open the mic
            startAudioCapture((base64) => {
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: "audio", data: base64 }));
              }
            })
              .then((capture) => {
                captureRef.current = capture;
                vadTimerRef.current = setInterval(() => {
                  setIsUserSpeaking(capture.getVolume() > VAD_THRESHOLD);
                }, 100);
                setCallState("active");
              })
              .catch(() => {
                setErrorMessage("Acesso ao microfone negado.");
                setCallState("error");
                cleanup();
              });
            break;

          case "audio":
            player.enqueue(msg.data);
            setIsAiSpeaking(true);
            break;

          case "turn_complete":
            setIsAiSpeaking(false);
            // Flush accumulated AI transcript for this turn
            if (aiPartialRef.current.trim()) {
              addTranscript("ai", aiPartialRef.current);
              aiPartialRef.current = "";
            }
            if (userPartialRef.current.trim()) {
              addTranscript("user", userPartialRef.current);
              userPartialRef.current = "";
            }
            break;

          case "interrupted":
            player.interrupt();
            setIsAiSpeaking(false);
            // Flush any partial before interruption
            if (aiPartialRef.current.trim()) {
              addTranscript("ai", aiPartialRef.current);
              aiPartialRef.current = "";
            }
            break;

          case "transcript":
            // Accumulate AI transcript within a turn
            aiPartialRef.current += (aiPartialRef.current ? " " : "") + msg.text;
            break;

          case "user_transcript":
            // Accumulate user transcript within a turn
            userPartialRef.current += (userPartialRef.current ? " " : "") + msg.text;
            break;

          case "error":
            setErrorMessage(msg.message);
            setCallState("error");
            cleanup();
            break;

          case "closed":
            if (callStateRef.current !== "idle") {
              setCallState("idle");
              cleanup();
            }
            break;
        }
      } catch { /* ignore */ }
    };

    ws.onerror = () => {
      setErrorMessage("Erro de ligação ao servidor.");
      setCallState("error");
      cleanup();
    };

    ws.onclose = () => {
      if (callStateRef.current !== "idle" && callStateRef.current !== "ended") {
        cleanup();
      }
    };
  }, [cleanup, addTranscript]);

  const disconnect = useCallback(() => {
    cleanup();
    setCallState("ended");
  }, [cleanup]);

  useEffect(() => () => cleanup(), [cleanup]);

  return { callState, isAiSpeaking, isUserSpeaking, transcripts, errorMessage, connect, disconnect };
}
