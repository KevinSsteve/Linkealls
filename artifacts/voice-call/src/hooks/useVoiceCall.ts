import { useState, useCallback, useRef, useEffect } from "react";
import { CallService } from "../services/callService";
import { startAudioCapture, type AudioCapture } from "../services/audioCapture";
import { AudioPlayer } from "../services/audioPlayer";

export type CallState = "idle" | "connecting" | "active" | "error";

export interface VoiceCallState {
  callState: CallState;
  isAiSpeaking: boolean;
  isUserSpeaking: boolean;
  errorMessage: string | null;
  startCall: () => void;
  endCall: () => void;
}

const VAD_THRESHOLD = 0.012; // RMS volume threshold for voice activity detection

export function useVoiceCall(): VoiceCallState {
  const [callState, setCallState] = useState<CallState>("idle");
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const serviceRef = useRef<CallService | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const captureRef = useRef<AudioCapture | null>(null);
  const vadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callStateRef = useRef<CallState>("idle");

  // Keep ref in sync with state so callbacks always see the current value
  callStateRef.current = callState;

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
  }, []);

  const startCall = useCallback(() => {
    if (callStateRef.current !== "idle" && callStateRef.current !== "error") {
      return;
    }

    setCallState("connecting");
    setErrorMessage(null);

    const player = new AudioPlayer();
    playerRef.current = player;

    const service = new CallService({
      onReady: () => {
        // Start capturing audio from the microphone
        startAudioCapture((base64) => {
          service.sendAudio(base64);
        })
          .then((capture) => {
            captureRef.current = capture;

            // Poll volume for visual voice activity detection
            vadTimerRef.current = setInterval(() => {
              setIsUserSpeaking(capture.getVolume() > VAD_THRESHOLD);
            }, 100);

            setCallState("active");
          })
          .catch(() => {
            setErrorMessage(
              "Acesso ao microfone negado. Permite o acesso e tenta de novo.",
            );
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
      },

      onInterrupted: () => {
        player.interrupt();
        setIsAiSpeaking(false);
      },

      onError: (message) => {
        setErrorMessage(message);
        setCallState("error");
        cleanup();
      },

      onClose: () => {
        if (callStateRef.current !== "idle") {
          setCallState("idle");
          cleanup();
        }
      },
    });

    serviceRef.current = service;
    service.connect();
  }, [cleanup]);

  const endCall = useCallback(() => {
    cleanup();
    setCallState("idle");
  }, [cleanup]);

  // Clean up on unmount
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return {
    callState,
    isAiSpeaking,
    isUserSpeaking,
    errorMessage,
    startCall,
    endCall,
  };
}
