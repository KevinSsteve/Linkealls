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

/**
 * @param leadId - When provided, passed to the WS server so the call session
 *   is linked to the lead record for post-call extraction.
 */
export function useGeminiLive(leadId?: string | null): GeminiLiveState {
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
    let player: AudioPlayer | null = null;
    try {
      player = new AudioPlayer();
      player.unlock();
      playerRef.current = player;
    } catch (e) {
      console.error("[CallFunnel] AudioPlayer creation failed:", e);
    }

    // ── Step 2: WebSocket ────────────────────────────────────────────────────
    const service = new CallFunnelService({
      onReady: () => {
        wsReadyRef.current = true;
        console.log("[CallFunnel] Server ready — Gemini session open");
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
        // Transcript received but not displayed — handled server-side
      },

      onUserTranscript: () => {
        // User transcript handled server-side
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
    // Pass leadId as a query param so the server links transcripts to the lead
    service.connect(leadId ?? undefined);
    console.log("[CallFunnel] WebSocket connecting", leadId ? `(leadId=${leadId})` : "");

    // ── Step 3: Mic capture ──────────────────────────────────────────────────
    startAudioCapture((base64) => {
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
        if (wsReadyRef.current) setCallState("active");
      })
      .catch((err) => {
        console.error("[CallFunnel] getUserMedia failed:", err);
        setErrorMessage("Acesso ao microfone negado. Permite o acesso nas definições e tenta de novo.");
        setCallState("error");
        cleanup();
      });
  }, [cleanup, leadId]);

  const disconnect = useCallback(() => {
    cleanup();
    setCallState("ended");
  }, [cleanup]);

  useEffect(() => () => cleanup(), [cleanup]);

  return { callState, isAiSpeaking, isUserSpeaking, errorMessage, connect, disconnect };
}
