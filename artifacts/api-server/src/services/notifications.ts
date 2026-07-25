/**
 * Web Push notification service.
 * Handles storing subscriptions and sending push messages to the owner.
 */
import webPush from "web-push";
import { db, businessProfilesTable, type PushSubscriptionJSON } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";

// ─── VAPID setup ──────────────────────────────────────────────────────────────

const VAPID_PUBLIC_KEY  = process.env["VAPID_PUBLIC_KEY"]  ?? "";
const VAPID_PRIVATE_KEY = process.env["VAPID_PRIVATE_KEY"] ?? "";
const VAPID_SUBJECT     = process.env["VAPID_SUBJECT"]     ?? "mailto:admin@aifunnel.ao";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

// ─── Subscription storage ─────────────────────────────────────────────────────

/** Store or update a push subscription for the owner (profile id=1). */
export async function saveSubscription(sub: PushSubscriptionJSON): Promise<void> {
  // Load current subscriptions
  const rows = await db
    .select({ pushSubscriptions: businessProfilesTable.pushSubscriptions })
    .from(businessProfilesTable)
    .limit(1);

  const existing: PushSubscriptionJSON[] = (rows[0]?.pushSubscriptions as PushSubscriptionJSON[]) ?? [];

  // Deduplicate by endpoint
  const filtered = existing.filter((s) => s.endpoint !== sub.endpoint);
  const updated = [...filtered, sub].slice(-10); // keep at most 10

  await db
    .update(businessProfilesTable)
    .set({
      pushSubscriptions: updated as unknown as PushSubscriptionJSON[],
      updatedAt: new Date(),
    })
    .where(eq(businessProfilesTable.id, 1));
}

/** Remove a push subscription by endpoint (called on unsubscribe). */
export async function removeSubscription(endpoint: string): Promise<void> {
  const rows = await db
    .select({ pushSubscriptions: businessProfilesTable.pushSubscriptions })
    .from(businessProfilesTable)
    .limit(1);

  const existing: PushSubscriptionJSON[] = (rows[0]?.pushSubscriptions as PushSubscriptionJSON[]) ?? [];
  const updated = existing.filter((s) => s.endpoint !== endpoint);

  await db
    .update(businessProfilesTable)
    .set({
      pushSubscriptions: updated as unknown as PushSubscriptionJSON[],
      updatedAt: new Date(),
    })
    .where(eq(businessProfilesTable.id, 1));
}

// ─── Send push ────────────────────────────────────────────────────────────────

async function loadSubscriptions(): Promise<PushSubscriptionJSON[]> {
  const rows = await db
    .select({ pushSubscriptions: businessProfilesTable.pushSubscriptions })
    .from(businessProfilesTable)
    .limit(1);
  return (rows[0]?.pushSubscriptions as PushSubscriptionJSON[]) ?? [];
}

interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

export async function sendPushToOwner(payload: PushPayload): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    logger.warn("VAPID keys not configured — skipping push notification");
    return;
  }

  const subscriptions = await loadSubscriptions();
  if (subscriptions.length === 0) {
    logger.debug("No push subscriptions — skipping notification");
    return;
  }

  const body = JSON.stringify(payload);
  const stale: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webPush.sendNotification(sub as webPush.PushSubscription, body);
        logger.info({ endpoint: sub.endpoint }, "Push sent");
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          // Subscription expired — mark for removal
          stale.push(sub.endpoint!);
          logger.info({ endpoint: sub.endpoint }, "Push subscription expired — removing");
        } else {
          logger.error({ err, endpoint: sub.endpoint }, "Push send failed");
        }
      }
    }),
  );

  // Clean up expired subscriptions
  for (const endpoint of stale) {
    await removeSubscription(endpoint);
  }
}

// ─── Daily summary cron ───────────────────────────────────────────────────────
// Fires every minute; when Angola time (WAT = UTC+1) is 08:00 sends summary.

let lastSummaryDate = ""; // "YYYY-MM-DD" in Angola time — prevents double-send

export function startDailySummaryCron(): void {
  const tick = async () => {
    const now = new Date();
    // Angola is WAT = UTC+1
    const angola = new Date(now.getTime() + 60 * 60 * 1000);
    const hh = angola.getUTCHours();
    const mm = angola.getUTCMinutes();
    const dateStr = angola.toISOString().slice(0, 10); // "YYYY-MM-DD"

    if (hh === 8 && mm === 0 && dateStr !== lastSummaryDate) {
      lastSummaryDate = dateStr;
      await sendDailySummary(dateStr);
    }
  };

  // Run once a minute
  setInterval(() => { void tick(); }, 60_000);
  logger.info("Daily summary cron started (Africa/Luanda WAT 08:00)");
}

async function sendDailySummary(dateStr: string): Promise<void> {
  try {
    // Count leads created today (Angola time ≈ UTC+1 → compare >= midnight UTC-1 to cover full day)
    const rows = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE state IN ('qualificado','entregue'))::int AS qualified
      FROM leads
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    `);
    const row = (rows.rows as Array<{ total: string; qualified: string }>)[0];
    const total     = Number(row?.total     ?? 0);
    const qualified = Number(row?.qualified ?? 0);

    const body =
      total === 0
        ? "Nenhum lead ontem. Promove as tuas campanhas!"
        : `${total} lead${total !== 1 ? "s" : ""} recebido${total !== 1 ? "s" : ""}, ${qualified} qualificado${qualified !== 1 ? "s" : ""}.`;

    await sendPushToOwner({
      title: "☀️ Resumo diário — AI Funnel",
      body,
      tag: `daily-${dateStr}`,
      url: "/dono/conversas",
    });

    logger.info({ dateStr, total, qualified }, "Daily summary push sent");
  } catch (err) {
    logger.error({ err }, "Daily summary cron failed");
  }
}

