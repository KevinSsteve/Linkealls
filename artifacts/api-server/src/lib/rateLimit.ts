import { createHash } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

let lastCleanupAt = 0;
let cleanupInFlight = false;

function bucketKey(scope: string, subject: string): string {
  // Do not retain phone numbers or IP addresses in the shared limiter table.
  return createHash("sha256").update(`${scope}\u0000${subject}`).digest("hex");
}

function cleanupExpiredBuckets(now: Date): void {
  if (cleanupInFlight || now.getTime() - lastCleanupAt < 5 * 60_000) return;
  lastCleanupAt = now.getTime();
  cleanupInFlight = true;
  // Bounded, best-effort cleanup. Every replica may attempt it, but each run
  // removes only a small batch and the limiter never depends on its outcome.
  void db.execute(sql`
    DELETE FROM auth_rate_limits
    WHERE ctid IN (
      SELECT ctid FROM auth_rate_limits
      WHERE reset_at < ${now}
      ORDER BY reset_at
      LIMIT 500
    )
  `).catch(() => undefined).finally(() => {
    cleanupInFlight = false;
  });
}

/**
 * A database-backed fixed-window limiter. The UPSERT makes increments atomic
 * across API replicas; callers must fail closed if this throws.
 */
export async function consumeSharedRateLimit(
  scope: string,
  subject: string,
  max: number,
  windowMs: number,
): Promise<boolean> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  cleanupExpiredBuckets(now);

  const result = await db.execute<{ count: number }>(sql`
    INSERT INTO auth_rate_limits (bucket_key, reset_at, count)
    VALUES (${bucketKey(scope, subject)}, ${resetAt}, 1)
    ON CONFLICT (bucket_key) DO UPDATE SET
      count = CASE
        WHEN auth_rate_limits.reset_at < ${now} THEN 1
        ELSE auth_rate_limits.count + 1
      END,
      reset_at = CASE
        WHEN auth_rate_limits.reset_at < ${now} THEN ${resetAt}
        ELSE auth_rate_limits.reset_at
      END
    RETURNING count
  `);
  return Number(result.rows[0]?.count ?? max + 1) <= max;
}