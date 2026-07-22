import { useState, useCallback, useRef, useEffect } from "react";
import { CallFunnelService } from "../services/callFunnelService";
import { startAudioCapture, type AudioCapture } from "../lib/audioCapture";
import { AudioPlayer } from "../lib/audioPlayer";

export type CallState = "idle" | "connecting" | "active" | "error" | "ended";

export interface TranscriptMessage {
  id: string;
  role: "ai" | "user";
  text: string;
  timestamp: Date;
}

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

  const serviceRef = useRef<CallFunnelService | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const captureRef = useRef<AudioCapture | null>(null);
  const vadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callStateRef = useRef<CallState>("idle");
  callStateRef.current = callState;

  // Partial transcript buffers — flushed to chat bubbles on turn_complete / interrupted
  const aiPartialRef = useRef("");
  const userPartialRef = useRef("");

  const addTranscript = useCallback((role: "ai" | "user", text: string) => {
    if (!text.trim()) return;
    setTranscripts((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        role,
        text: text.trim(),
        timestamp: new Date(),
      },
    ]);
  }, []);

  const cleanup = useCallback(() => {
    if (vadTimerRef.current) {
      clearInterval(vadTimerRef.current);
      vadTimerRef.current = null;
    }
    captureRef.current?.stop();
    captureRef.current = null;
    playerRef.current?.destroy();
    playerRef.current = null;
    serviceRef.current?.disconnect();
    serviceRef.current = null;
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

    // Create player synchronously — AudioContext must be created inside the
    // user-gesture call stack (button tap → connect).
    const player = new AudioPlayer();
    playerRef.current = player;

    const service = new CallFunnelService({
      onReady: () => {
        // Mic capture starts after server confirms the Gemini session is ready.
        startAudioCapture((base64) => {
          service.sendAudio(base64);
        })
          .then((capture) => {
            captureRef.current = capture;
            vadTimerRef.current = setInterval(() => {
              setIsUserSpeaking(capture.getVolume() > VAD_THRESHOLD);
            }, 100);
            setCallState("active");
          })
          .catch(() => {
            setErrorMessage("Acesso ao microfone negado. Permite o acesso e tenta de novo.");
            setCallState("error");
            cleanup();
          });
      },

      onAudio: (base64) => {
        player.enqueue(base64);
        setIsAiSpeaking(true);
      },

      onTurnComplete: () => {
        setIsAiSpeaking(false);
        if (aiPartialRef.current.trim()) {
          addTranscript("ai", aiPartialRef.current);
          aiPartialRef.current = "";
        }
        if (userPartialRef.current.trim()) {
          addTranscript("user", userPartialRef.current);
          userPartialRef.current = "";
        }
      },

      onInterrupted: () => {
        player.interrupt();
        setIsAiSpeaking(false);
        if (aiPartialRef.current.trim()) {
          addTranscript("ai", aiPartialRef.current);
          aiPartialRef.current = "";
        }
      },

      onTranscript: (text) => {
        aiPartialRef.current += (aiPartialRef.current ? " " : "") + text;
      },

      onUserTranscript: (text) => {
        userPartialRef.current += (userPartialRef.current ? " " : "") + text;
      },

      onError: (message) => {
        setErrorMessage(message);
        setCallState("error");
        cleanup();
      },

      onClose: () => {
        if (callStateRef.current !== "idle" && callStateRef.current !== "ended") {
          setCallState("idle");
          cleanup();
        }
      },
    });

    serviceRef.current = service;
    service.connect();
  }, [cleanup, addTranscript]);

  const disconnect = useCallback(() => {
    cleanup();
    setCallState("ended");
  }, [cleanup]);

  useEffect(() => () => cleanup(), [cleanup]);

  return { callState, isAiSpeaking, isUserSpeaking, transcripts, errorMessage, connect, disconnect };
}
