import { useState, useCallback, useRef, useEffect } from "react";
import { CallFunnelService } from "../services/callFunnelService";
import { startAudioCapture, type AudioCapture } from "../lib/audioCapture";
import { AudioPlayer } from "../lib/audioPlayer";

export type CallState = "idle" | "connecting" | "active" | "error" | "ended";

export interface GeminiLiveState {
  callState: CallState;
  isAiSpeaking: boolean;
  isUserSpeaking: boolean;
  errorMessage: string | null;
  connect: () => void;
  disconnect: () => void;
}

const VAD_THRESHOLD = 0.012;

export function useGeminiLive(): GeminiLiveState {
  const [callState, setCallState] = useState<CallState>("idle");
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const serviceRef = useRef<CallFunnelService | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const captureRef = useRef<AudioCapture | null>(null);
  const vadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callStateRef = useRef<CallState>("idle");
  callStateRef.current = callState;

  // True once the server has confirmed the Gemini session is open.
  // Audio chunks are only sent after this point to avoid the server discarding them.
  const wsReadyRef = useRef(false);

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
    wsReadyRef.current = false;
    setIsAiSpeaking(false);
    setIsUserSpeaking(false);
  }, []);

  const connect = useCallback(() => {
    if (callStateRef.current !== "idle" && callStateRef.current !== "error") return;

    setCallState("connecting");
    setErrorMessage(null);
    wsReadyRef.current = false;

    // ── Step 1: AudioPlayer ──────────────────────────────────────────────────
    // Must be created AND unlocked inside the user-gesture call stack so that
    // iOS Safari grants audio playback permission.
    // Wrapped in try/catch: if AudioContext creation fails (e.g., browser limit),
    // we still proceed with the WebSocket so Gemini at least connects.
    let player: AudioPlayer | null = null;
    try {
      player = new AudioPlayer();
      player.unlock(); // plays a silent buffer to fully unlock the AudioContext on iOS
      playerRef.current = player;
    } catch (e) {
      console.error("[CallFunnel] AudioPlayer creation failed:", e);
      // Continue without playback — at least the WS/mic will work
    }

    // ── Step 2: WebSocket ────────────────────────────────────────────────────
    // Connect WS IMMEDIATELY so that the server-side Gemini session starts
    // opening while getUserMedia permission dialog may still be showing.
    const service = new CallFunnelService({
      onReady: () => {
        wsReadyRef.current = true;
        console.log("[CallFunnel] Server ready — Gemini session open");
        // If mic permission was already granted, go active now.
        // Otherwise wait for the startAudioCapture promise to resolve.
        if (captureRef.current) setCallState("active");
      },

      onAudio: (base64) => {
        const p = playerRef.current;
        if (p) {
          p.enqueue(base64);
          setIsAiSpeaking(true);
        }
      },

      onTurnComplete: () => {
        setIsAiSpeaking(false);
      },

      onInterrupted: () => {
        playerRef.current?.interrupt();
        setIsAiSpeaking(false);
      },

      onTranscript: () => {
        // Transcript received but not displayed — no-op
      },

      onUserTranscript: () => {
        // User transcript received but not displayed — no-op
      },

      onError: (message) => {
        console.error("[CallFunnel] WS error:", message);
        setErrorMessage(message);
        setCallState("error");
        cleanup();
      },

      onClose: () => {
        console.log("[CallFunnel] WS closed");
        if (callStateRef.current !== "idle" && callStateRef.current !== "ended") {
          setCallState("idle");
          cleanup();
        }
      },
    });

    serviceRef.current = service;
    service.connect();
    console.log("[CallFunnel] WebSocket connecting");

    // ── Step 3: Mic capture ──────────────────────────────────────────────────
    // getUserMedia MUST be called inside the user-gesture call stack.
    startAudioCapture((base64) => {
      // Only send audio after server confirms the Gemini session is ready.
      if (wsReadyRef.current) {
        serviceRef.current?.sendAudio(base64);
      }
    })
      .then((capture) => {
        console.log("[CallFunnel] Mic capture started");
        captureRef.current = capture;
        vadTimerRef.current = setInterval(() => {
          setIsUserSpeaking(capture.getVolume() > VAD_THRESHOLD);
        }, 100);
        // If the server already sent "ready" before mic permission was granted,
        // switch to active now.
        if (wsReadyRef.current) setCallState("active");
      })
      .catch((err) => {
        console.error("[CallFunnel] getUserMedia failed:", err);
        setErrorMessage("Acesso ao microfone negado. Permite o acesso nas definições e tenta de novo.");
        setCallState("error");
        cleanup();
      });
  }, [cleanup]);

  const disconnect = useCallback(() => {
    cleanup();
    setCallState("ended");
  }, [cleanup]);

  useEffect(() => () => cleanup(), [cleanup]);

  return { callState, isAiSpeaking, isUserSpeaking, errorMessage, connect, disconnect };
}
