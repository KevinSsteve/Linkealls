export interface ProductCard {
  name: string;
  price: string;
  description: string;
  imageUrl?: string;
}

export type ServerMessage =
  | { type: "ready" }
  | { type: "audio"; data: string }
  | { type: "turn_complete" }
  | { type: "interrupted" }
  | { type: "transcript"; text: string }
  | { type: "user_transcript"; text: string }
  | { type: "show_products"; products: ProductCard[] }
  | { type: "closed" }
  | { type: "error"; message: string };

export interface CallFunnelServiceCallbacks {
  onReady: () => void;
  onAudio: (base64: string) => void;
  onTurnComplete: () => void;
  onInterrupted: () => void;
  onTranscript?: (text: string) => void;
  onUserTranscript?: (text: string) => void;
  onShowProducts?: (products: ProductCard[]) => void;
  onError: (message: string) => void;
  onClose: () => void;
}

/** Manages the WebSocket connection to the Call Funnel backend relay. */
export class CallFunnelService {
  private ws: WebSocket | null = null;
  private callbacks: CallFunnelServiceCallbacks;

  constructor(callbacks: CallFunnelServiceCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * @param leadId - Optional lead ID to attach to the WS session so the server
   *   can link transcripts to the correct lead for post-call extraction.
   */
  connect(leadId?: string): void {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    // In dev, requests must stay under the artifact base path (e.g.
    // /ai-call-funnel/api/...) so they reach the Vite dev server, whose proxy
    // forwards them to the API server. In production, the deployment proxy
    // routes root /api/* directly to the API server.
    const base = import.meta.env.BASE_URL; // ends with '/'
    const apiPath = import.meta.env.DEV
      ? `${base}api/call-funnel-ws`
      : "/api/call-funnel-ws";
    const qs = leadId ? `?leadId=${encodeURIComponent(leadId)}` : "";
    const url = `${proto}//${window.location.host}${apiPath}${qs}`;
    console.log("[CallFunnel] WebSocket connecting to", url);

    this.ws = new WebSocket(url);

    this.ws.onmessage = (event: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        switch (msg.type) {
          case "ready":           this.callbacks.onReady(); break;
          case "audio":           this.callbacks.onAudio(msg.data); break;
          case "turn_complete":   this.callbacks.onTurnComplete(); break;
          case "interrupted":     this.callbacks.onInterrupted(); break;
          case "transcript":      this.callbacks.onTranscript?.(msg.text); break;
          case "user_transcript": this.callbacks.onUserTranscript?.(msg.text); break;
          case "show_products":   this.callbacks.onShowProducts?.(msg.products); break;
          case "error":           this.callbacks.onError(msg.message); break;
          case "closed":          this.callbacks.onClose(); break;
        }
      } catch {
        // Ignore malformed messages
      }
    };

    this.ws.onerror = () => {
      this.callbacks.onError("Erro de ligação — não foi possível contactar o servidor.");
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

  sendText(text: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "user_text", text }));
    }
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
