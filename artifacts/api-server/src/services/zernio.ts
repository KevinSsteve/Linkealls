/**
 * Zernio ads gateway client — publishes real ads on TikTok and Meta
 * (Facebook/Instagram) through Linkealls' own "house" ad accounts.
 *
 * API: https://docs.zernio.com — Bearer API key, base https://zernio.com/api.
 *  - POST   /v1/ads/create        create standalone ad (campaign+ad set+ad)
 *  - GET    /v1/ads/{adId}        ad with status/reviewStatus/metrics
 *  - PUT    /v1/ads/{adId}/status pause/resume a single ad
 *  - DELETE /v1/ads/{adId}        cancel (end) the ad
 *
 * Simulation mode: when ZERNIO_API_KEY or the house-account env vars are
 * missing, all calls are simulated locally (same pattern as ekwanza.ts) so the
 * whole flow can be exercised end-to-end without spending money.
 *
 * House account config (env):
 *  - ZERNIO_API_KEY
 *  - ZERNIO_TIKTOK_ACCOUNT_ID / ZERNIO_TIKTOK_AD_ACCOUNT_ID
 *  - ZERNIO_META_ACCOUNT_ID   / ZERNIO_META_AD_ACCOUNT_ID
 */
import { randomUUID } from "crypto";
import { logger } from "../lib/logger.js";

const BASE_URL = process.env["ZERNIO_BASE_URL"] ?? "https://zernio.com/api";
const API_KEY = process.env["ZERNIO_API_KEY"] ?? "";

export type ZernioChannel = "tiktok" | "meta";

interface HouseAccount {
  accountId: string;
  adAccountId: string;
}

function houseAccount(channel: ZernioChannel): HouseAccount | null {
  const prefix = channel === "tiktok" ? "ZERNIO_TIKTOK" : "ZERNIO_META";
  const accountId = process.env[`${prefix}_ACCOUNT_ID`];
  const adAccountId = process.env[`${prefix}_AD_ACCOUNT_ID`];
  if (!accountId || !adAccountId) return null;
  return { accountId, adAccountId };
}

export const IS_ZERNIO_SIMULATION = !API_KEY;

if (IS_ZERNIO_SIMULATION) {
  logger.warn(
    "ZERNIO_API_KEY not set — Zernio ads gateway running in SIMULATION mode (no real ads are published)",
  );
}

export class ZernioError extends Error {
  constructor(message: string, public statusCode = 502) {
    super(message);
  }
}

async function zernioFetch<T>(
  method: string,
  path: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const apiError =
      json && typeof json === "object" && "error" in json
        ? String((json as { error: unknown }).error)
        : null;
    const msg = apiError ?? `Zernio ${method} ${path} → ${res.status}`;
    logger.error({ status: res.status, path, body: text.slice(0, 500) }, "Zernio API error");
    throw new ZernioError(msg);
  }
  return json as T;
}

// ─── Create ad ────────────────────────────────────────────────────────────────

export interface CreateAdParams {
  channel: ZernioChannel;
  name: string;
  /** Lifetime budget in WHOLE USD units (Zernio takes whole units, not cents). */
  budgetUsd: number;
  durationDays: number;
  headline: string;
  body: string;
  callToAction: string;
  /** Public URL of the media. For TikTok this must be a video URL. */
  mediaUrl: string;
  mediaType: "image" | "video";
  /** Destination — the business' public catalog URL with UTM params. */
  linkUrl: string;
  /** Idempotency key so a retried publish never creates a duplicate ad. */
  idempotencyKey: string;
}

export interface CreateAdResult {
  adId: string;
  campaignId: string | null;
  adSetId: string | null;
  status: string;
  reviewStatus: string | null;
  simulated: boolean;
}

export async function createAd(params: CreateAdParams): Promise<CreateAdResult> {
  if (IS_ZERNIO_SIMULATION) {
    logger.info({ name: params.name, channel: params.channel }, "[SIMULAÇÃO] Zernio createAd");
    return {
      adId: `sim_ad_${randomUUID().slice(0, 12)}`,
      campaignId: `sim_camp_${randomUUID().slice(0, 8)}`,
      adSetId: `sim_set_${randomUUID().slice(0, 8)}`,
      status: "ACTIVE",
      reviewStatus: "APPROVED",
      simulated: true,
    };
  }

  const account = houseAccount(params.channel);
  if (!account) {
    throw new ZernioError(
      `Conta de anúncios ${params.channel} não configurada (env ZERNIO_${params.channel.toUpperCase()}_ACCOUNT_ID)`,
      500,
    );
  }

  const start = new Date();
  const end = new Date(start.getTime() + params.durationDays * 24 * 3600_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const body: Record<string, unknown> = {
    accountId: account.accountId,
    adAccountId: account.adAccountId,
    name: params.name,
    goal: "traffic",
    budgetAmount: params.budgetUsd,
    budgetType: "lifetime",
    status: "ACTIVE",
    startDate: fmt(start),
    endDate: fmt(end),
    linkUrl: params.linkUrl,
    callToAction: params.callToAction,
    targeting: { countries: ["AO"] },
  };

  if (params.channel === "meta") {
    body["headline"] = params.headline;
    body["body"] = params.body;
    if (params.mediaType === "video") body["video"] = params.mediaUrl;
    else body["imageUrl"] = params.mediaUrl;
    body["advantageAudience"] = true;
  } else {
    // TikTok: video URL travels in imageUrl; headline/body are ignored by the platform.
    body["imageUrl"] = params.mediaUrl;
    body["identityType"] = "CUSTOMIZED_USER";
  }

  const res = await zernioFetch<{
    _id?: string;
    id?: string;
    status?: string;
    reviewStatus?: string;
    platformCampaignId?: string;
    platformAdSetId?: string;
  }>("POST", "/v1/ads/create", body, params.idempotencyKey);

  const adId = res._id ?? res.id;
  if (!adId) throw new ZernioError("Zernio não devolveu o id do anúncio");
  return {
    adId,
    campaignId: res.platformCampaignId ?? null,
    adSetId: res.platformAdSetId ?? null,
    status: res.status ?? "ACTIVE",
    reviewStatus: res.reviewStatus ?? null,
    simulated: false,
  };
}

// ─── Read metrics / status ────────────────────────────────────────────────────

export interface AdSnapshot {
  status: string;
  reviewStatus: string | null;
  spendUsd: number;
  impressions: number;
  clicks: number;
  simulated: boolean;
}

export async function getAd(adId: string, simulatedAd: boolean): Promise<AdSnapshot> {
  if (IS_ZERNIO_SIMULATION || simulatedAd) {
    return { status: "ACTIVE", reviewStatus: "APPROVED", spendUsd: 0, impressions: 0, clicks: 0, simulated: true };
  }
  const res = await zernioFetch<{
    status?: string;
    reviewStatus?: string;
    metrics?: { spend?: number; impressions?: number; clicks?: number };
  }>("GET", `/v1/ads/${encodeURIComponent(adId)}`);
  return {
    status: res.status ?? "UNKNOWN",
    reviewStatus: res.reviewStatus ?? null,
    spendUsd: Number(res.metrics?.spend ?? 0),
    impressions: Number(res.metrics?.impressions ?? 0),
    clicks: Number(res.metrics?.clicks ?? 0),
    simulated: false,
  };
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export async function setAdStatus(
  adId: string,
  action: "pause" | "resume",
  simulatedAd: boolean,
): Promise<void> {
  if (IS_ZERNIO_SIMULATION || simulatedAd) {
    logger.info({ adId, action }, "[SIMULAÇÃO] Zernio setAdStatus");
    return;
  }
  await zernioFetch("PUT", `/v1/ads/${encodeURIComponent(adId)}/status`, {
    status: action === "pause" ? "PAUSED" : "ACTIVE",
  });
}

export async function cancelAd(adId: string, simulatedAd: boolean): Promise<void> {
  if (IS_ZERNIO_SIMULATION || simulatedAd) {
    logger.info({ adId }, "[SIMULAÇÃO] Zernio cancelAd");
    return;
  }
  await zernioFetch("DELETE", `/v1/ads/${encodeURIComponent(adId)}`);
}
