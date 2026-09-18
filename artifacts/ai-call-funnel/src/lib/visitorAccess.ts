/**
 * Browser storage and request helpers for anonymous visitor capabilities.
 *
 * Capabilities intentionally live in sessionStorage (not a URL and not durable
 * localStorage). A browser restart therefore requires the visitor to start a
 * new conversation instead of silently reviving access to old private data.
 */
const API_BASE = import.meta.env.DEV
  ? `${import.meta.env.BASE_URL}api`
  : "/api";
const KEY_PREFIX = "linkealls:visitor-access:v1:";

export interface VisitorLeadOrigin {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  url?: string;
}

export interface VisitorAccess {
  businessSlug: string;
  leadId: string;
  orderId?: string;
  visitorToken: string;
}

interface LeadSessionResponse {
  leadId: string;
  visitorToken: string;
  chatMessages: Array<{ role: "user" | "bot" | "agent"; text: string; ts: string }>;
  createdAt: string;
  updatedAt: string;
}

function key(slug: string, leadId: string): string {
  return `${KEY_PREFIX}${slug}:${leadId}`;
}

function currentKey(slug: string): string {
  return `${KEY_PREFIX}${slug}:current`;
}

function canUse(value: unknown): value is VisitorAccess {
  if (!value || typeof value !== "object") return false;
  const access = value as Record<string, unknown>;
  return typeof access.businessSlug === "string" &&
    typeof access.leadId === "string" &&
    typeof access.visitorToken === "string" &&
    (access.orderId === undefined || typeof access.orderId === "string");
}

export function saveVisitorAccess(access: VisitorAccess): void {
  try {
    sessionStorage.setItem(key(access.businessSlug, access.leadId), JSON.stringify(access));
    sessionStorage.setItem(currentKey(access.businessSlug), access.leadId);
  } catch {
    // The request can continue in-memory even if a privacy mode blocks storage.
  }
}

export function loadVisitorAccess(businessSlug: string, leadId: string): VisitorAccess | null {
  try {
    const raw = sessionStorage.getItem(key(businessSlug, leadId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return canUse(parsed) && parsed.businessSlug === businessSlug && parsed.leadId === leadId
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function loadCurrentVisitorAccess(businessSlug: string): VisitorAccess | null {
  try {
    const leadId = sessionStorage.getItem(currentKey(businessSlug));
    return leadId ? loadVisitorAccess(businessSlug, leadId) : null;
  } catch {
    return null;
  }
}

function requireAccess(businessSlug: string, leadId: string): VisitorAccess {
  const access = loadVisitorAccess(businessSlug, leadId);
  if (!access) throw new Error("Esta sessão de visitante expirou. Inicia uma nova conversa.");
  return access;
}

async function visitorRequest<T>(
  businessSlug: string,
  path: string,
  init: RequestInit = {},
  access?: VisitorAccess,
): Promise<T> {
  const res = await fetch(`${API_BASE}/b/${encodeURIComponent(businessSlug)}${path}`, {
    ...init,
    credentials: "omit",
    headers: {
      "Content-Type": "application/json",
      ...(access ? { Authorization: `Visitor ${access.visitorToken}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(body?.error ?? `Erro do servidor (${res.status})`);
  if (!body) throw new Error("Resposta inválida do servidor");
  return body;
}

export function visitorApi(businessSlug: string) {
  return {
    createLeadSession: async (
      origin: VisitorLeadOrigin,
      chatMessages: LeadSessionResponse["chatMessages"],
    ): Promise<{ leadId: string; visitorToken: string }> => {
      const result = await visitorRequest<{ leadId: string; visitorToken: string }>(
        businessSlug,
        "/leads/session",
        { method: "POST", body: JSON.stringify({ origin, chatMessages }) },
      );
      saveVisitorAccess({ businessSlug, leadId: result.leadId, visitorToken: result.visitorToken });
      return result;
    },
    getLeadSession: (leadId: string): Promise<LeadSessionResponse> =>
      visitorRequest(businessSlug, `/leads/${encodeURIComponent(leadId)}/session`, {}, requireAccess(businessSlug, leadId)),
    sendLeadChat: <T extends { reply: string; products?: unknown[] }>(leadId: string, message: string): Promise<T> =>
      visitorRequest(businessSlug, `/leads/${encodeURIComponent(leadId)}/chat`, {
        method: "POST",
        body: JSON.stringify({ message }),
      }, requireAccess(businessSlug, leadId)),
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
    getOrderStatus: <T>(orderId: string, leadId: string): Promise<T> =>
      visitorRequest(businessSlug, `/orders/${encodeURIComponent(orderId)}/status`, {}, requireAccess(businessSlug, leadId)),
    getOrderTracking: <T>(orderId: string, leadId: string): Promise<T> =>
      visitorRequest(businessSlug, `/orders/${encodeURIComponent(orderId)}/tracking`, {}, requireAccess(businessSlug, leadId)),
    requestOrderProofUrl: (orderId: string, leadId: string, file: Pick<File, "name" | "size" | "type">) =>
      visitorRequest<{ uploadURL: string; objectPath: string }>(
        businessSlug,
        `/orders/${encodeURIComponent(orderId)}/proof/request-url`,
        { method: "POST", body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }) },
        requireAccess(businessSlug, leadId),
      ),
    submitOrderProof: <T>(orderId: string, leadId: string, objectPath: string): Promise<T> =>
      visitorRequest(
        businessSlug,
        `/orders/${encodeURIComponent(orderId)}/proof`,
        { method: "POST", body: JSON.stringify({ objectPath }) },
        requireAccess(businessSlug, leadId),
      ),
  };
}