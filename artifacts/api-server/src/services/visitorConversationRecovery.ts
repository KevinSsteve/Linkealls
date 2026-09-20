import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, leadsTable } from "@workspace/db";

export const VISITOR_RECOVERY_TTL_MS = 7 * 24 * 60 * 60_000;
const TOKEN_VERSION = 1;

interface RecoveryPayload {
  v: number;
  businessId: number;
  leadId: string;
  familyId: string;
  iat: number;
  exp: number;
  nonce: string;
}

function recoveryKey(): Buffer {
  const secret = process.env["SESSION_SECRET"];
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("É necessária uma chave partilhada de sessão com pelo menos 32 caracteres");
  }
  return createHmac("sha256", secret)
    .update("linkealls:visitor-conversation-recovery:v1")
    .digest();
}

function signature(body: string): string {
  return createHmac("sha256", recoveryKey())
    .update(`recovery.${body}`)
    .digest("base64url");
}

function isPayload(value: unknown): value is RecoveryPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return payload.v === TOKEN_VERSION &&
    typeof payload.businessId === "number" &&
    Number.isSafeInteger(payload.businessId) &&
    payload.businessId > 0 &&
    typeof payload.leadId === "string" &&
    /^[0-9a-f-]{36}$/i.test(payload.leadId) &&
    typeof payload.familyId === "string" &&
    /^[0-9a-f-]{36}$/i.test(payload.familyId) &&
    typeof payload.iat === "number" &&
    typeof payload.exp === "number" &&
    typeof payload.nonce === "string" &&
    payload.nonce.length >= 40;
}

function issueRecoveryToken(
  businessId: number,
  leadId: string,
  familyId: string,
  expiresAt: Date,
  now = new Date(),
): string {
  const payload: RecoveryPayload = {
    v: TOKEN_VERSION,
    businessId,
    leadId,
    familyId,
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor(expiresAt.getTime() / 1000),
    nonce: randomBytes(32).toString("base64url"),
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `vr1.${body}.${signature(body)}`;
}

function verifyRecoveryToken(token: string, businessId: number, now = new Date()): RecoveryPayload | null {
  const [version, body, suppliedSignature, ...rest] = token.split(".");
  if (version !== "vr1" || !body || !suppliedSignature || rest.length > 0) return null;
  const expected = Buffer.from(signature(body), "utf8");
  const supplied = Buffer.from(suppliedSignature, "utf8");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const payload: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!isPayload(payload)) return null;
    const nowSeconds = Math.floor(now.getTime() / 1000);
    return payload.businessId === businessId &&
      payload.iat <= nowSeconds + 60 &&
      payload.exp > nowSeconds
      ? payload
      : null;
  } catch {
    return null;
  }
}

export function createVisitorRecoveryFamily(now = new Date()): {
  familyId: string;
  expiresAt: Date;
} {
  return {
    familyId: randomUUID(),
    expiresAt: new Date(now.getTime() + VISITOR_RECOVERY_TTL_MS),
  };
}

export function visitorRecoveryCookieName(businessSlug: string): string {
  if (!/^[a-z0-9-]{3,80}$/.test(businessSlug)) {
    throw new Error("Slug de negócio inválido para recuperação");
  }
  return `linkealls_visitor_${businessSlug}`;
}

export function readCookie(header: string | undefined, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rawValue.join("="));
  }
  return null;
}

export function visitorRecoveryTokenForLead(
  businessId: number,
  lead: { id: string; visitorRecoveryFamilyId: string | null; visitorRecoveryExpiresAt: Date | null },
): string {
  if (!lead.visitorRecoveryFamilyId || !lead.visitorRecoveryExpiresAt) {
    throw new Error("Lead sem família de recuperação");
  }
  return issueRecoveryToken(
    businessId,
    lead.id,
    lead.visitorRecoveryFamilyId,
    lead.visitorRecoveryExpiresAt,
  );
}

export async function rotateVisitorRecovery(
  businessId: number,
  token: string,
  now = new Date(),
): Promise<{ leadId: string; token: string; expiresAt: Date } | null> {
  const payload = verifyRecoveryToken(token, businessId, now);
  if (!payload) return null;
  const nextExpiry = new Date(now.getTime() + VISITOR_RECOVERY_TTL_MS);
  const rows = await db.update(leadsTable)
    .set({ visitorRecoveryExpiresAt: nextExpiry, updatedAt: now })
    .where(and(
      eq(leadsTable.id, payload.leadId),
      eq(leadsTable.businessId, businessId),
      eq(leadsTable.visitorRecoveryFamilyId, payload.familyId),
      gt(leadsTable.visitorRecoveryExpiresAt, now),
      isNull(leadsTable.visitorRecoveryRevokedAt),
    ))
    .returning({
      leadId: leadsTable.id,
      familyId: leadsTable.visitorRecoveryFamilyId,
    });
  const recovered = rows[0];
  if (!recovered?.familyId) return null;
  return {
    leadId: recovered.leadId,
    token: issueRecoveryToken(businessId, recovered.leadId, recovered.familyId, nextExpiry, now),
    expiresAt: nextExpiry,
  };
}

export async function revokeVisitorRecovery(
  businessId: number,
  token: string,
  now = new Date(),
): Promise<void> {
  const payload = verifyRecoveryToken(token, businessId, now);
  if (!payload) return;
  await db.update(leadsTable)
    .set({
      visitorRecoveryRevokedAt: now,
      trafficClickKey: null,
      updatedAt: now,
    })
    .where(and(
      eq(leadsTable.id, payload.leadId),
      eq(leadsTable.businessId, businessId),
      eq(leadsTable.visitorRecoveryFamilyId, payload.familyId),
    ));
}