import { loadVisitorAccess, saveVisitorAccess } from "../lib/visitorAccess";

export interface ProductCard {
  name: string;
  price: string;
  description: string;
  imageUrl?: string;
}

export interface CheckoutInfo {
  orderId: string;
  leadId: string;
  /** Fresh order-scoped capability issued by the WS relay after checkout. */
  visitorToken: string;
  offeringName: string;
  amount: number;
  simulated: boolean;
  merchantTransactionId: string;
}

export type ServerMessage =
  | { type: "ready" }
  | { type: "audio"; data: string }
  | { type: "turn_complete" }
  | { type: "interrupted" }
  | { type: "transcript"; text: string }
  | { type: "user_transcript"; text: string }
  | { type: "show_products"; products: ProductCard[] }
  | { type: "agent_message"; text: string }
  | ({ type: "checkout" } & CheckoutInfo)
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
  /** Called when the AI sends a text message to display in the chat during a call. */
  onAgentMessage?: (text: string) => void;
  /** Called when the AI initiates a product checkout. */
  onCheckout?: (info: CheckoutInfo) => void;
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
   * @param leadId - Lead ID to authenticate the WS session so the server
   *   can link transcripts to the correct lead for post-call extraction.
   * @param businessSlug - Business slug so the server loads the right AI profile.
   */
  connect(leadId?: string, businessSlug?: string): void {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    // In dev, requests must stay under the artifact base path (e.g.
    // /ai-call-funnel/api/...) so they reach the Vite dev server, whose proxy
    // forwards them to the API server. In production, the deployment proxy
    // routes root /api/* directly to the API server.
    const base = import.meta.env.BASE_URL; // ends with '/'
    const apiPath = import.meta.env.DEV
      ? `${base}api/call-funnel-ws`
      : "/api/call-funnel-ws";
    const params = new URLSearchParams();
    if (businessSlug) params.set("businessSlug", businessSlug);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const url = `${proto}//${window.location.host}${apiPath}${qs}`;
    const access = leadId && businessSlug ? loadVisitorAccess(businessSlug, leadId) : null;
    if (!access) {
      this.callbacks.onError("Esta sessão de visitante expirou. Inicia uma nova conversa.");
      return;
    }

    // Authenticate before the relay creates any provider session. The token
    // stays out of URLs and handshake headers that proxies may log or echo.
    this.ws = new WebSocket(url);
    const socket = this.ws;
    socket.onopen = () => {
      socket.send(JSON.stringify({
        type: "authenticate", leadId: access.leadId, visitorToken: access.visitorToken,
      }));
    };

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
          case "agent_message":   this.callbacks.onAgentMessage?.(msg.text); break;
          case "checkout": {
            if (!msg.visitorToken || !msg.orderId || msg.leadId !== access.leadId) {
              this.callbacks.onError("A encomenda não devolveu um acesso de visitante válido.");
              break;
            }
            saveVisitorAccess({
              businessSlug: access.businessSlug, leadId: msg.leadId,
              orderId: msg.orderId, visitorToken: msg.visitorToken,
            });
            this.callbacks.onCheckout?.({
              orderId: msg.orderId, leadId: msg.leadId, visitorToken: msg.visitorToken,
              offeringName: msg.offeringName, amount: msg.amount,
              simulated: msg.simulated, merchantTransactionId: msg.merchantTransactionId,
            });
            break;
          }
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

  sendPaymentResult(orderId: string, status: string, offeringName?: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "payment_result", orderId, status, offeringName }));
    }
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
