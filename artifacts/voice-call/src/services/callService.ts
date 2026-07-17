export type ServerMessage =
  | { type: "ready" }
  | { type: "audio"; data: string }
  | { type: "turn_complete" }
  | { type: "interrupted" }
  | { type: "transcript"; text: string }
  | { type: "user_transcript"; text: string }
  | { type: "closed" }
  | { type: "error"; message: string };

export interface CallServiceCallbacks {
  onReady: () => void;
  onAudio: (base64: string) => void;
  onTurnComplete: () => void;
  onInterrupted: () => void;
  onTranscript?: (text: string) => void;
  onUserTranscript?: (text: string) => void;
  onError: (message: string) => void;
  onClose: () => void;
}

/** Manages the WebSocket connection to the backend voice relay. */
export class CallService {
  private ws: WebSocket | null = null;
  private callbacks: CallServiceCallbacks;

  constructor(callbacks: CallServiceCallbacks) {
    this.callbacks = callbacks;
  }

  connect(): void {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/api/voice-ws`;

    this.ws = new WebSocket(url);

    this.ws.onmessage = (event: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        switch (msg.type) {
          case "ready":
            this.callbacks.onReady();
            break;
          case "audio":
            this.callbacks.onAudio(msg.data);
            break;
          case "turn_complete":
            this.callbacks.onTurnComplete();
            break;
          case "interrupted":
            this.callbacks.onInterrupted();
            break;
          case "transcript":
            this.callbacks.onTranscript?.(msg.text);
            break;
          case "user_transcript":
            this.callbacks.onUserTranscript?.(msg.text);
            break;
          case "error":
            this.callbacks.onError(msg.message);
            break;
          case "closed":
            this.callbacks.onClose();
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    };

    this.ws.onerror = () => {
      this.callbacks.onError("Connection error — could not reach the server.");
    };

    this.ws.onclose = () => {
      this.callbacks.onClose();
    };
  }

  sendAudio(base64: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "audio", data: base64 }));
    }
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
