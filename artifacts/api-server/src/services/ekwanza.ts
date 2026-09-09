/**
 * e-kwanza / AppyPay gateway client — Multicaixa Express (GPO) ONLY.
 *
 * Implements the "Pagamento Integrado v2.7" spec:
 *  - OAuth client_credentials auth against Azure AD (AppyPay)
 *  - POST /charges with paymentMethod GPO_… (push to the buyer's phone)
 *  - GPO callback signature validation (HMAC-SHA256)
 *  - Payouts: POST /Operations/SendToCustomer (wallet) and
 *    /Operations/SendKWiKToCustomer (IBAN), signed with HMAC-SHA256
 *
 * SIMULATION MODE: when gateway credentials are not configured, the module
 * runs in a clearly-flagged simulation mode — charges/payouts succeed locally
 * so the full product flow can be exercised without real money. As soon as
 * the secrets are set, real calls are made instead.
 */
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { logger } from "../lib/logger.js";

// ─── Config ───────────────────────────────────────────────────────────────────

const env = (k: string) => process.env[k]?.trim() || "";

const APPYPAY_CLIENT_ID = env("APPYPAY_CLIENT_ID");
const APPYPAY_CLIENT_SECRET = env("APPYPAY_CLIENT_SECRET");
// NB: o tenant correto é "auth.appypay.co.ao" — o tenant "appypay.onmicrosoft.com"
// rejeita o resource com AADSTS500011 (invalid_resource).
const APPYPAY_AUTH_URL = env("APPYPAY_AUTH_URL") ||
  "https://login.microsoftonline.com/auth.appypay.co.ao/oauth2/token";
const APPYPAY_RESOURCE = env("APPYPAY_RESOURCE");
const APPYPAY_BASE_URL = env("APPYPAY_BASE_URL") || "https://gwy-api.appypay.co.ao/v2.0";
/**
 * paymentMethod id da aplicação GPO, e.g. "GPO_5cc3d5ab-…".
 * O portal mostra só o GUID; o gateway exige o prefixo "GPO_" — normalizamos.
 */
const rawGpoMethod = env("EKWANZA_GPO_PAYMENT_METHOD");
const EKWANZA_GPO_PAYMENT_METHOD =
  rawGpoMethod && !rawGpoMethod.startsWith("GPO_") ? `GPO_${rawGpoMethod}` : rawGpoMethod;
const EKWANZA_MERCHANT_IDENTIFIER = env("EKWANZA_MERCHANT_IDENTIFIER");
const EKWANZA_API_KEY = env("EKWANZA_API_KEY");
const EKWANZA_NOTIFICATION_TOKEN = env("EKWANZA_NOTIFICATION_TOKEN");
const EKWANZA_PARTNER_REGISTRATION = env("EKWANZA_PARTNER_REGISTRATION");
/** Base URL dos endpoints /Operations (payouts). */
const EKWANZA_OPERATIONS_BASE_URL = env("EKWANZA_OPERATIONS_BASE_URL");

/** True when real gateway credentials are missing → simulate locally. */
export const IS_SIMULATION =
  !APPYPAY_CLIENT_ID || !APPYPAY_CLIENT_SECRET || !APPYPAY_RESOURCE || !EKWANZA_GPO_PAYMENT_METHOD;

if (IS_SIMULATION) {
  logger.warn(
    "e-kwanza/AppyPay credentials not configured — payments run in SIMULATION mode. " +
    "Set APPYPAY_CLIENT_ID, APPYPAY_CLIENT_SECRET, APPYPAY_RESOURCE, EKWANZA_GPO_PAYMENT_METHOD, " +
    "EKWANZA_MERCHANT_IDENTIFIER, EKWANZA_API_KEY, EKWANZA_NOTIFICATION_TOKEN, EKWANZA_PARTNER_REGISTRATION " +
    "to go live.",
  );
}

// ─── OAuth token cache ────────────────────────────────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: APPYPAY_CLIENT_ID,
    client_secret: APPYPAY_CLIENT_SECRET,
    resource: APPYPAY_RESOURCE,
  });
  const res = await fetch(APPYPAY_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AppyPay auth failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in?: string | number };
  const ttl = Number(data.expires_in ?? 3000) * 1000;
  cachedToken = { token: data.access_token, expiresAt: Date.now() + ttl };
  return data.access_token;
}

// ─── Charges (GPO — Multicaixa Express push) ─────────────────────────────────

export interface GpoChargeResult {
  simulated: boolean;
  /**
   * Synchronous outcome. The gateway's POST /charges blocks until the buyer
   * approves/declines or the 60s window expires, so in real mode the response
   * already carries the final result ("paid"/"failed"). "pending" only when
   * the response is inconclusive (or in simulation, where the webhook/simulate
   * endpoint settles later).
   */
  outcome: "pending" | "paid" | "failed";
  /** Buyer-facing failure message (real mode, outcome === "failed"). */
  failureMessage?: string;
  /** Raw gateway response (real mode). */
  raw?: unknown;
}

/**
 * The gateway validates Description strictly (INVALID_FORMAT on colons,
 * accents, "x2", etc.). Spec examples only use [A-Za-z0-9_], so strip
 * diacritics and map everything else to underscores.
 */
export function sanitizeGpoDescription(input: string): string {
  const cleaned = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return cleaned || "Linkealls";
}

/**
 * Create a GPO charge: the buyer receives a Multicaixa Express push on their
 * phone and approves the payment there. Settlement arrives via webhook.
 */
export async function createGpoCharge(params: {
  amount: number;
  merchantTransactionId: string;
  phoneNumber: string;
  description: string;
}): Promise<GpoChargeResult> {
  if (IS_SIMULATION) {
    logger.info({ ...params }, "[SIMULAÇÃO] Charge GPO criada — aprova via endpoint de simulação");
    return { simulated: true, outcome: "pending" };
  }
  const token = await getAccessToken();
  const res = await fetch(`${APPYPAY_BASE_URL}/charges`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      amount: params.amount,
      currency: "AOA",
      description: sanitizeGpoDescription(params.description),
      merchantTransactionId: params.merchantTransactionId,
      paymentMethod: EKWANZA_GPO_PAYMENT_METHOD,
      paymentInfo: { phoneNumber: params.phoneNumber },
      options: {
        MerchantIdentifier: EKWANZA_MERCHANT_IDENTIFIER,
        ApiKey: EKWANZA_API_KEY,
      },
    }),
  });
  const raw = await res.json().catch(() => null) as {
    responseStatus?: { successful?: boolean; status?: string | null; code?: number; message?: string };
  } | null;
  if (!res.ok) {
    logger.error({ status: res.status, raw }, "GPO charge failed");
    throw new Error(`Falha ao criar cobrança Multicaixa Express (${res.status})`);
  }
  const rs = raw?.responseStatus;
  let outcome: GpoChargeResult["outcome"] = "pending";
  if (rs?.successful === true) outcome = "paid";
  else if (rs?.successful === false) outcome = "failed";
  if (outcome === "failed") {
    logger.warn({ raw }, "GPO charge declined/expired (synchronous)");
  }
  return {
    simulated: false,
    outcome,
    failureMessage: outcome === "failed"
      ? (rs?.code === 211
        ? "O pagamento não foi aprovado a tempo na app Multicaixa Express (60 segundos). Tenta novamente."
        : "O pagamento foi recusado. Verifica o saldo e tenta novamente.")
      : undefined,
    raw,
  };
}

// ─── Webhook signature ────────────────────────────────────────────────────────

/**
 * Validate the x-signature header of a payment notification.
 * Per spec: HMAC-SHA256 over code + operationCode + partnerRegistration +
 * notificationToken, keyed with the merchant API key.
 */
export function verifyNotificationSignature(
  signature: string | undefined,
  code: string,
  operationCode: string,
): boolean {
  if (!EKWANZA_API_KEY || !EKWANZA_NOTIFICATION_TOKEN || !EKWANZA_PARTNER_REGISTRATION) {
    // Cannot verify without credentials — reject in real mode.
    return false;
  }
  if (!signature) return false;
  const payload = `${code}${operationCode}${EKWANZA_PARTNER_REGISTRATION}${EKWANZA_NOTIFICATION_TOKEN}`;
  const expected = createHmac("sha256", EKWANZA_API_KEY).update(payload).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(signature.trim().toLowerCase(), "hex");
  } catch {
    return false;
  }
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

// ─── Payouts ─────────────────────────────────────────────────────────────────

export interface PayoutResult {
  simulated: boolean;
  ok: boolean;
  pending?: boolean;
  ekzOperationCode?: string;
  ekzTransactionCode?: string;
  errorStatus?: string;
}

function payoutSignature(fields: string[]): string {
  return createHmac("sha256", EKWANZA_API_KEY).update(fields.join("")).digest("hex");
}

const PAYOUT_ERRORS: Record<string, string> = {
  "27": "Número de telemóvel inválido",
  "29": "Conta da plataforma sem saldo suficiente",
  "31": "Número de telemóvel não encontrado no e-kwanza",
  "32": "KWiK não está ativo para este destino",
  "36": "Montante superior ao máximo de transação",
  "37": "Montante inferior ao mínimo de transação",
  "87": "Montante inválido",
  "180": "Credenciais/assinatura inválidas",
};

export function payoutErrorMessage(status: string | undefined): string {
  return (status && PAYOUT_ERRORS[status]) || "Falha no processamento do levantamento";
}

async function callPayout(path: string, data: Record<string, string>, signedFields: string[]): Promise<PayoutResult> {
  if (IS_SIMULATION) {
    logger.info({ path, data: { ...data, token: "***" } }, "[SIMULAÇÃO] Payout processado localmente");
    return {
      simulated: true, ok: true,
      ekzOperationCode: `SIM-${randomUUID().slice(0, 8)}`,
      ekzTransactionCode: `SIMTX-${randomUUID().slice(0, 8)}`,
    };
  }
  const timestamp = new Date().toISOString();
  const signature = payoutSignature([timestamp, ...signedFields]);
  const res = await fetch(`${EKWANZA_OPERATIONS_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": EKWANZA_API_KEY },
    body: JSON.stringify({ data, meta: { timestamp, signature } }),
  });
  const raw = (await res.json().catch(() => ({}))) as {
    status?: number | string; ekzOperationCode?: string; ekzTransactionCode?: string;
  };
  if (res.ok || res.status === 202) {
    return {
      simulated: false,
      ok: true,
      pending: res.status === 202 || String(raw.status) === "347",
      ekzOperationCode: raw.ekzOperationCode,
      ekzTransactionCode: raw.ekzTransactionCode,
    };
  }
  logger.error({ status: res.status, raw }, "e-kwanza payout failed");
  return { simulated: false, ok: false, errorStatus: String(raw.status ?? res.status) };
}

/** Pay out to an e-kwanza wallet (mobile number). */
export function sendToCustomer(params: { mobileNumber: string; amount: number; operationCode: string }): Promise<PayoutResult> {
  return callPayout(
    "/Operations/SendToCustomer",
    {
      mobileNumber: params.mobileNumber,
      token: EKWANZA_NOTIFICATION_TOKEN,
      amount: String(params.amount),
      operationCode: params.operationCode,
    },
    [params.mobileNumber, EKWANZA_NOTIFICATION_TOKEN, params.operationCode],
  );
}

/** Pay out to a KWiK IBAN. May stay pending (HTTP 202 / status 347). */
export function sendKwikToCustomer(params: { iban: string; amount: number; operationCode: string }): Promise<PayoutResult> {
  return callPayout(
    "/Operations/SendKWiKToCustomer",
    {
      IBAN: params.iban,
      token: EKWANZA_NOTIFICATION_TOKEN,
      amount: String(params.amount),
      operationCode: params.operationCode,
    },
    [params.iban, EKWANZA_NOTIFICATION_TOKEN, params.operationCode],
  );
}

/** Check the state of a pending KWiK payout. */
export async function getKwikPayoutStatus(externalReferenceId: string): Promise<"processed" | "processing" | "cancelled" | "voided" | "unknown"> {
  if (IS_SIMULATION) return "processed";
  try {
    const res = await fetch(
      `${EKWANZA_OPERATIONS_BASE_URL}/Operations/SendKWiKToCustomerStatus?ExternalReferenceId=${encodeURIComponent(externalReferenceId)}`,
      { method: "POST", headers: { "X-API-Key": EKWANZA_API_KEY } },
    );
    if (!res.ok) return "unknown";
    const raw = (await res.json().catch(() => ({}))) as { OperationStatus?: string };
    const s = (raw.OperationStatus ?? "").toLowerCase();
    if (s === "processed" || s === "processing" || s === "cancelled" || s === "voided") return s;
    return "unknown";
  } catch (err) {
    // An unavailable status endpoint is not an authoritative rejection.
    // Keep the payout pending and let a later retry reconcile it.
    logger.warn({ err, externalReferenceId }, "e-kwanza KWiK status check unavailable");
    return "unknown";
  }
}
