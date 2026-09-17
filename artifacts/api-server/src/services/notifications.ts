/**
 * Web Push notification service.
 * Handles storing subscriptions and sending push messages to the owner.
 */
import webPush from "web-push";
import { db, businessProfilesTable, type PushSubscriptionJSON } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { withScheduledJobLock } from "../lib/scheduledJobLock.js";

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

/** Store or update a push subscription for a business owner. */
export async function saveSubscription(sub: PushSubscriptionJSON, businessId: number): Promise<void> {
  // Load current subscriptions
  const rows = await db
    .select({ pushSubscriptions: businessProfilesTable.pushSubscriptions })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.id, businessId))
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
    .where(eq(businessProfilesTable.id, businessId));
}

/** Remove a push subscription by endpoint (called on unsubscribe). */
export async function removeSubscription(endpoint: string, businessId: number): Promise<void> {
  const rows = await db
    .select({ pushSubscriptions: businessProfilesTable.pushSubscriptions })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.id, businessId))
    .limit(1);

  const existing: PushSubscriptionJSON[] = (rows[0]?.pushSubscriptions as PushSubscriptionJSON[]) ?? [];
  const updated = existing.filter((s) => s.endpoint !== endpoint);

  await db
    .update(businessProfilesTable)
    .set({
      pushSubscriptions: updated as unknown as PushSubscriptionJSON[],
      updatedAt: new Date(),
    })
    .where(eq(businessProfilesTable.id, businessId));
}

// ─── Send push ────────────────────────────────────────────────────────────────

async function loadSubscriptions(businessId: number): Promise<PushSubscriptionJSON[]> {
  const rows = await db
    .select({ pushSubscriptions: businessProfilesTable.pushSubscriptions })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.id, businessId))
    .limit(1);
  return (rows[0]?.pushSubscriptions as PushSubscriptionJSON[]) ?? [];
}

interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

export async function sendPushToOwner(payload: PushPayload, businessId: number): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    logger.warn("VAPID keys not configured — skipping push notification");
    return;
  }

  const subscriptions = await loadSubscriptions(businessId);
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
    await removeSubscription(endpoint, businessId);
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
      const ran = await withScheduledJobLock(`daily-summary:${dateStr}`, () => sendDailySummary(dateStr));
      if (ran) lastSummaryDate = dateStr;
    }
  };

  // Run once a minute
  setInterval(() => {
    void tick().catch((err) => logger.error({ err }, "Daily summary cron tick failed"));
  }, 60_000).unref();
  logger.info("Daily summary cron started (Africa/Luanda WAT 08:00)");
}

async function sendDailySummary(dateStr: string): Promise<void> {
  try {
    // Per-business counts of leads created in the last 24 hours.
    // Only businesses with push subscriptions receive a summary.
    const rows = await db.execute(sql`
      SELECT
        bp.id AS business_id,
        bp.slug AS slug,
        COUNT(l.id)::int AS total,
        COUNT(l.id) FILTER (WHERE l.state IN ('qualificado','entregue'))::int AS qualified
      FROM business_profiles bp
      LEFT JOIN leads l
        ON l.business_id = bp.id AND l.created_at >= NOW() - INTERVAL '24 hours'
      WHERE jsonb_array_length(COALESCE(bp.push_subscriptions, '[]'::jsonb)) > 0
      GROUP BY bp.id, bp.slug
    `);

    for (const r of rows.rows as Array<{ business_id: number; slug: string | null; total: string; qualified: string }>) {
      const total     = Number(r.total ?? 0);
      const qualified = Number(r.qualified ?? 0);

      const body =
        total === 0
          ? "Nenhum lead ontem. Promove as tuas campanhas!"
          : `${total} lead${total !== 1 ? "s" : ""} recebido${total !== 1 ? "s" : ""}, ${qualified} qualificado${qualified !== 1 ? "s" : ""}.`;

      await sendPushToOwner({
        title: "☀️ Resumo diário — Linkealls",
        body,
        tag: `daily-${dateStr}`,
        url: r.slug ? `/e/${r.slug}/dono/conversas` : "/",
      }, Number(r.business_id));
    }

    logger.info({ dateStr, businesses: rows.rows.length }, "Daily summary pushes sent")
  } catch (err) {
    logger.error({ err }, "Daily summary cron failed");
  }
}

