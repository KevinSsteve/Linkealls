/**
 * Browser storage and request helpers for anonymous visitor capabilities.
 *
 * Capabilities intentionally live in sessionStorage and never in URLs or
 * durable JavaScript-readable storage. Browser restarts recover through a
 * rotating opaque HttpOnly cookie and receive a fresh capability.
 */
const API_BASE = import.meta.env.DEV
  ? `${import.meta.env.BASE_URL}api`
  : "/api";
const KEY_PREFIX = "linkealls:visitor-access:v1:";
// Some privacy modes deny sessionStorage. Keep access within this document in
// that case rather than reporting a successful session that cannot be used.
const memoryAccess = new Map<string, VisitorAccess>();
const currentLeads = new Map<string, string>();

export interface VisitorLeadOrigin {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  url?: string;
  trafficCreativeSlug?: string;
}

export interface VisitorAccess {
  businessSlug: string;
  leadId: string;
  orderId?: string;
  visitorToken: string;
}

export interface TrafficSessionCreative {
  id: string;
  slug: string;
  description: string;
  mediaType: "image" | "video";
  mediaMimeType?: string;
  mediaUrl?: string;
}

export interface LeadContact {
  status: "pending" | "consented" | "declined";
  phone: string | null;
  purpose: string | null;
  capturedAt: string | null;
}

export interface WhatsAppHandoff {
  phone: string;
  url: string;
}

export interface LeadSessionResponse {
  leadId: string;
  chatMessages: Array<{ role: "user" | "bot" | "agent"; text: string; ts: string }>;
  trafficCreative: TrafficSessionCreative | null;
  trafficWelcomeStatus: "pending" | "processing" | "complete" | "failed" | null;
  contact: LeadContact;
  whatsappHandoff: WhatsAppHandoff | null;
  createdAt: string;
  updatedAt: string;
}

function key(slug: string, leadId: string, orderId?: string): string {
  return `${KEY_PREFIX}${slug}:${leadId}${orderId ? `:order:${orderId}` : ""}`;
}

function currentKey(slug: string): string {
  return `${KEY_PREFIX}${slug}:current`;
}

function canUse(value: unknown): value is VisitorAccess {
  if (!value || typeof value !== "object") return false;
  const access = value as Record<string, unknown>;
  return typeof access.businessSlug === "string" &&
    typeof access.leadId === "string" &&
    typeof access.visitorToken === "string" && access.visitorToken.length > 0 &&
    (access.orderId === undefined || typeof access.orderId === "string");
}

export function saveVisitorAccess(access: VisitorAccess): void {
  if (!canUse(access)) throw new Error("Resposta sem acesso de visitante válido");
  const accessKey = key(access.businessSlug, access.leadId);
  memoryAccess.set(accessKey, access);
  currentLeads.set(access.businessSlug, access.leadId);
  if (access.orderId) memoryAccess.set(key(access.businessSlug, access.leadId, access.orderId), access);
  try {
    sessionStorage.setItem(accessKey, JSON.stringify(access));
    if (access.orderId) {
      sessionStorage.setItem(key(access.businessSlug, access.leadId, access.orderId), JSON.stringify(access));
    }
    sessionStorage.setItem(currentKey(access.businessSlug), access.leadId);
  } catch {
    // The request can continue in-memory even if a privacy mode blocks storage.
  }
}

export function loadVisitorAccess(businessSlug: string, leadId: string, orderId?: string): VisitorAccess | null {
  const accessKey = key(businessSlug, leadId, orderId);
  try {
    const raw = sessionStorage.getItem(accessKey);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return canUse(parsed) && parsed.businessSlug === businessSlug && parsed.leadId === leadId &&
      (orderId === undefined || parsed.orderId === orderId)
      ? parsed
      : memoryAccess.get(accessKey) ?? null;
  } catch {
    return memoryAccess.get(accessKey) ?? null;
  }
}

export function loadCurrentVisitorAccess(businessSlug: string): VisitorAccess | null {
  try {
    const leadId = sessionStorage.getItem(currentKey(businessSlug)) ?? currentLeads.get(businessSlug);
    return leadId ? loadVisitorAccess(businessSlug, leadId) : null;
  } catch {
    const leadId = currentLeads.get(businessSlug);
    return leadId ? loadVisitorAccess(businessSlug, leadId) : null;
  }
}

export function clearVisitorAccess(businessSlug: string): void {
  currentLeads.delete(businessSlug);
  for (const accessKey of [...memoryAccess.keys()]) {
    if (accessKey.startsWith(`${KEY_PREFIX}${businessSlug}:`)) memoryAccess.delete(accessKey);
  }
  try {
    const keys: string[] = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const storageKey = sessionStorage.key(index);
      if (storageKey?.startsWith(`${KEY_PREFIX}${businessSlug}:`)) keys.push(storageKey);
    }
    for (const storageKey of keys) sessionStorage.removeItem(storageKey);
  } catch {
    // Memory state was already cleared.
  }
}

function requireAccess(businessSlug: string, leadId: string, orderId?: string): VisitorAccess {
  const access = loadVisitorAccess(businessSlug, leadId, orderId);
  if (!access) throw new Error("Esta sessão de visitante expirou. Inicia uma nova conversa.");
  return access;
}

class VisitorRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function visitorRequest<T>(
  businessSlug: string,
  path: string,
  init: RequestInit = {},
  access?: VisitorAccess,
): Promise<T> {
  const res = await fetch(`${API_BASE}/b/${encodeURIComponent(businessSlug)}${path}`, {
    ...init,
    credentials: init.credentials ?? "omit",
    headers: {
      "Content-Type": "application/json",
      ...(access ? { Authorization: `Visitor ${access.visitorToken}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new VisitorRequestError(body?.error ?? `Erro do servidor (${res.status})`, res.status);
  if (!body) throw new Error("Resposta inválida do servidor");
  return body;
}

export function visitorApi(businessSlug: string) {
  return {
    createLeadSession: async (
      origin: VisitorLeadOrigin,
      chatMessages: LeadSessionResponse["chatMessages"],
      trafficClickKey?: string,
    ): Promise<{ leadId: string; visitorToken: string }> => {
      const result = await visitorRequest<{ leadId: string; visitorToken: string }>(
        businessSlug,
        "/leads/session",
        {
          method: "POST",
          credentials: "include",
          body: JSON.stringify({ origin, chatMessages, trafficClickKey }),
        },
      );
      saveVisitorAccess({ businessSlug, leadId: result.leadId, visitorToken: result.visitorToken });
      return result;
    },
    getLeadSession: async (leadId: string): Promise<LeadSessionResponse> =>
      visitorRequest(businessSlug, `/leads/${encodeURIComponent(leadId)}/session`, {}, requireAccess(businessSlug, leadId)),
    recoverLeadSession: async (): Promise<VisitorAccess | null> => {
      const res = await fetch(`${API_BASE}/b/${encodeURIComponent(businessSlug)}/leads/recovery`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.status === 404) return null;
      const body = (await res.json().catch(() => null)) as
        | { leadId: string; visitorToken: string; error?: string }
        | null;
      if (!res.ok || !body) throw new Error(body?.error ?? "Não foi possível recuperar a conversa");
      const access = { businessSlug, leadId: body.leadId, visitorToken: body.visitorToken };
      saveVisitorAccess(access);
      return access;
    },
    endLeadSession: async (): Promise<void> => {
      try {
        const res = await fetch(`${API_BASE}/b/${encodeURIComponent(businessSlug)}/leads/recovery`, {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok && res.status !== 404) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "Não foi possível terminar a conversa");
        }
      } finally {
        clearVisitorAccess(businessSlug);
      }
    },
    startTrafficWelcome: async <T extends {
      started: boolean;
      status: "pending" | "processing" | "complete" | "failed";
      reply?: string;
      products?: unknown[];
    }>(leadId: string): Promise<T> =>
      visitorRequest(
        businessSlug,
        `/leads/${encodeURIComponent(leadId)}/traffic-welcome`,
        { method: "POST", body: "{}" },
        requireAccess(businessSlug, leadId),
      ),
    sendLeadChat: async <T extends { reply: string; products?: unknown[] }>(leadId: string, message: string, requestId = crypto.randomUUID()): Promise<T> => {
      const access = requireAccess(businessSlug, leadId);
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await visitorRequest(businessSlug, `/leads/${encodeURIComponent(leadId)}/chat`, {
            method: "POST",
            body: JSON.stringify({ message, requestId }),
          }, access);
        } catch (error) {
          const retryable = !(error instanceof VisitorRequestError)
            || error.status >= 500
            || (error.status === 409 && /processada|processamento/i.test(error.message));
          if (!retryable || attempt >= 4) throw error;
          await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        }
      }
    },
    captureLeadContact: async (
      leadId: string,
      input: { action: "consent"; phone: string } | { action: "decline" },
    ): Promise<{ contact: LeadContact; whatsappHandoff: WhatsAppHandoff | null }> =>
      visitorRequest(
        businessSlug,
        `/leads/${encodeURIComponent(leadId)}/contact`,
        { method: "POST", body: JSON.stringify(input) },
        requireAccess(businessSlug, leadId),
      ),
    recordWhatsAppClick: async (leadId: string): Promise<void> => {
      const access = requireAccess(businessSlug, leadId);
      const res = await fetch(`${API_BASE}/b/${encodeURIComponent(businessSlug)}/leads/${encodeURIComponent(leadId)}/whatsapp-click`, {
        method: "POST",
        credentials: "omit",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Visitor ${access.visitorToken}`,
        },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Não foi possível registar o clique");
      }
    },
    recordSalesEvent: async (leadId: string, event: "cta_accepted" | "cta_declined"): Promise<void> => {
      const access = requireAccess(businessSlug, leadId);
      const res = await fetch(`${API_BASE}/b/${encodeURIComponent(businessSlug)}/leads/${encodeURIComponent(leadId)}/sales-event`, {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/json", Authorization: `Visitor ${access.visitorToken}` },
        body: JSON.stringify({ event }),
      });
      if (!res.ok) throw new Error("Não foi possível registar o resultado");
    },
    createOrder: async (data: {
      offeringName: string;
      quantity: number;
      phone: string;
      buyerName?: string;
      leadId?: string;
      customerNotes?: string;
    }): Promise<{
      orderId: string;
      leadId: string;
      visitorToken: string;
      merchantTransactionId: string;
      amount: number;
      status: string;
      simulated: boolean;
    }> => {
      const access = data.leadId ? requireAccess(businessSlug, data.leadId) : undefined;
      const result = await visitorRequest<{
        orderId: string; leadId: string; visitorToken: string; merchantTransactionId: string;
        amount: number; status: string; simulated: boolean;
      }>(businessSlug, "/orders", { method: "POST", body: JSON.stringify(data) }, access);
      saveVisitorAccess({
        businessSlug,
        leadId: result.leadId,
        orderId: result.orderId,
        visitorToken: result.visitorToken,
      });
      return result;
    },
    getOrderStatus: async <T>(orderId: string, leadId: string): Promise<T> =>
      visitorRequest(businessSlug, `/orders/${encodeURIComponent(orderId)}/status`, {}, requireAccess(businessSlug, leadId, orderId)),
    getOrderTracking: async <T>(orderId: string, leadId: string): Promise<T> =>
      visitorRequest(businessSlug, `/orders/${encodeURIComponent(orderId)}/tracking`, {}, requireAccess(businessSlug, leadId, orderId)),
    requestOrderProofUrl: async (orderId: string, leadId: string, file: Pick<File, "name" | "size" | "type">) =>
      visitorRequest<{ uploadURL: string; objectPath: string }>(
        businessSlug,
        `/orders/${encodeURIComponent(orderId)}/proof/request-url`,
        { method: "POST", body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }) },
        requireAccess(businessSlug, leadId, orderId),
      ),
    submitOrderProof: async <T>(orderId: string, leadId: string, objectPath: string): Promise<T> =>
      visitorRequest(
        businessSlug,
        `/orders/${encodeURIComponent(orderId)}/proof`,
        { method: "POST", body: JSON.stringify({ objectPath }) },
        requireAccess(businessSlug, leadId, orderId),
      ),
  };
}