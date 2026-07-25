import { useState, useCallback, useRef, useEffect } from "react";
import { CallFunnelService, type ProductCard } from "../services/callFunnelService";
import { startAudioCapture, type AudioCapture } from "../lib/audioCapture";
import { AudioPlayer } from "../lib/audioPlayer";

export type CallState = "idle" | "connecting" | "active" | "error" | "ended";
export type { ProductCard };

export interface AgentMessage {
  id: string;
  text: string;
}

export interface GeminiLiveState {
  callState: CallState;
  isAiSpeaking: boolean;
  isUserSpeaking: boolean;
  errorMessage: string | null;
  shownProducts: ProductCard[] | null;
  agentMessages: AgentMessage[];
  connect: () => void;
  disconnect: () => void;
  sendText: (text: string) => void;
  clearProducts: () => void;
  clearAgentMessages: () => void;
}

const VAD_THRESHOLD = 0.012;

let _msgCounter = 0;
function makeAgentMsgId() { return `am-${++_msgCounter}`; }

export function useGeminiLive(leadId?: string | null, businessSlug?: string): GeminiLiveState {
  const [callState, setCallState] = useState<CallState>("idle");
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [shownProducts, setShownProducts] = useState<ProductCard[] | null>(null);
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);

  const serviceRef = useRef<CallFunnelService | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const captureRef = useRef<AudioCapture | null>(null);
  const vadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callStateRef = useRef<CallState>("idle");
  callStateRef.current = callState;

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
    setShownProducts(null);
    setAgentMessages([]);
  }, []);

  const connect = useCallback(() => {
    if (callStateRef.current !== "idle" && callStateRef.current !== "error") return;

    setCallState("connecting");
    setErrorMessage(null);
    setShownProducts(null);
    wsReadyRef.current = false;

    let player: AudioPlayer | null = null;
    try {
      player = new AudioPlayer();
      player.unlock();
      playerRef.current = player;
    } catch (e) {
      console.error("[CallFunnel] AudioPlayer creation failed:", e);
    }

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

      onTranscript: () => {},
      onUserTranscript: () => {},

      onShowProducts: (products) => {
        setShownProducts(products);
      },

      onAgentMessage: (text) => {
        setAgentMessages((prev) => [...prev, { id: makeAgentMsgId(), text }]);
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
    service.connect(leadId ?? undefined, businessSlug);
    console.log("[CallFunnel] WebSocket connecting", leadId ? `(leadId=${leadId})` : "", businessSlug ? `(businessSlug=${businessSlug})` : "");

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
  }, [cleanup, leadId, businessSlug]);

  const disconnect = useCallback(() => {
    cleanup();
    setCallState("ended");
  }, [cleanup]);

  const sendText = useCallback((text: string) => {
    serviceRef.current?.sendText(text);
  }, []);

  const clearProducts = useCallback(() => {
    setShownProducts(null);
  }, []);

  const clearAgentMessages = useCallback(() => {
    setAgentMessages([]);
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  return {
    callState,
    isAiSpeaking,
    isUserSpeaking,
    errorMessage,
    shownProducts,
    agentMessages,
    connect,
    disconnect,
    sendText,
    clearProducts,
    clearAgentMessages,
  };
}
