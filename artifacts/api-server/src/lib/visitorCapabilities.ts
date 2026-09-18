import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * A visitor capability is deliberately independent from database identifiers:
 * UUIDs are locators, not credentials.  The compact signed value is sent only
 * in the Authorization header and is never accepted in URLs.
 */
const VERSION = 1;
const CONVERSATION_TTL_SECONDS = 7 * 24 * 60 * 60;
const ORDER_TTL_SECONDS = 30 * 24 * 60 * 60;

export type VisitorCapabilityScope = "conversation" | "order";

interface VisitorCapabilityPayload {
  v: number;
  scope: VisitorCapabilityScope;
  businessId: number;
  leadId: string;
  orderId?: string;
  iat: number;
  exp: number;
  nonce: string;
}

export class VisitorCapabilityError extends Error {
  constructor(message = "Acesso de visitante inválido ou expirado") {
    super(message);
    this.name = "VisitorCapabilityError";
  }
}

function signingKey(): Buffer {
  const raw = process.env["VISITOR_CAPABILITY_SECRET"];
  if (raw !== undefined) {
    if (Buffer.byteLength(raw, "utf8") < 32) {
      throw new Error("VISITOR_CAPABILITY_SECRET tem de ter pelo menos 32 caracteres");
    }
    return Buffer.from(raw, "utf8");
  }
  // An optional dedicated key isolates visitor-token rotation. Otherwise derive
  // a domain-separated key from the existing shared session secret, never a
  // process-local random value (which would break across autoscale replicas).
  const sessionSecret = process.env["SESSION_SECRET"];
  if (!sessionSecret || Buffer.byteLength(sessionSecret, "utf8") < 32) {
    throw new Error("É necessária uma chave partilhada de sessão com pelo menos 32 caracteres");
  }
  return createHmac("sha256", sessionSecret)
    .update("linkealls:visitor-capabilities:v1")
    .digest();
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signature(encodedPayload: string): string {
  return createHmac("sha256", signingKey())
    .update(`visitor.${encodedPayload}`)
    .digest("base64url");
}

function isPayload(value: unknown): value is VisitorCapabilityPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return payload.v === VERSION &&
    (payload.scope === "conversation" || payload.scope === "order") &&
    typeof payload.businessId === "number" &&
    Number.isSafeInteger(payload.businessId) &&
    payload.businessId > 0 &&
    typeof payload.leadId === "string" &&
    /^[0-9a-f-]{36}$/i.test(payload.leadId) &&
    (payload.orderId === undefined || (typeof payload.orderId === "string" && /^[0-9a-f-]{36}$/i.test(payload.orderId))) &&
    typeof payload.iat === "number" &&
    typeof payload.exp === "number" &&
    typeof payload.nonce === "string" &&
    payload.nonce.length >= 40;
}

function issue(scope: VisitorCapabilityScope, businessId: number, leadId: string, orderId?: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: VisitorCapabilityPayload = {
    v: VERSION,
    scope,
    businessId,
    leadId,
    ...(orderId ? { orderId } : {}),
    iat: now,
    exp: now + (scope === "order" ? ORDER_TTL_SECONDS : CONVERSATION_TTL_SECONDS),
    nonce: randomBytes(32).toString("base64url"),
  };
  const body = encode(payload);
  return `v1.${body}.${signature(body)}`;
}

export function issueConversationCapability(businessId: number, leadId: string): string {
  return issue("conversation", businessId, leadId);
}

export function issueOrderCapability(businessId: number, leadId: string, orderId: string): string {
  return issue("order", businessId, leadId, orderId);
}

export function visitorTokenFromAuthorization(authorization?: string): string | null {
  const match = /^Visitor\s+([A-Za-z0-9._-]+)$/.exec(authorization ?? "");
  return match?.[1] ?? null;
}

export function verifyVisitorCapability(
  token: string | null,
  expected: {
    businessId: number;
    leadId: string;
    orderId?: string;
    scope?: VisitorCapabilityScope;
  },
): VisitorCapabilityPayload {
  if (!token) throw new VisitorCapabilityError();
  const [version, encodedPayload, suppliedSignature, ...rest] = token.split(".");
  if (version !== "v1" || !encodedPayload || !suppliedSignature || rest.length > 0) {
    throw new VisitorCapabilityError();
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new VisitorCapabilityError();
  }
  if (!isPayload(payload)) throw new VisitorCapabilityError();

  const expectedSignature = Buffer.from(signature(encodedPayload), "utf8");
  const actualSignature = Buffer.from(suppliedSignature, "utf8");
  if (
    expectedSignature.length !== actualSignature.length ||
    !timingSafeEqual(expectedSignature, actualSignature)
  ) {
    throw new VisitorCapabilityError();
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    payload.exp <= now ||
    payload.iat > now + 60 ||
    payload.businessId !== expected.businessId ||
    payload.leadId !== expected.leadId ||
    (expected.orderId !== undefined && (payload.scope !== "order" || payload.orderId !== expected.orderId)) ||
    (expected.scope !== undefined && payload.scope !== expected.scope)
  ) {
    throw new VisitorCapabilityError();
  }
  return payload;
}