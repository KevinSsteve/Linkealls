import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * Runs a scheduled job in at most one autoscale replica at a time.
 * The transaction-scoped advisory lock is released automatically on completion.
 */
export async function withScheduledJobLock(
  jobName: string,
  job: () => Promise<void>,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      SELECT pg_try_advisory_xact_lock(hashtext(${jobName})::bigint) AS acquired
    `);
    const acquired = Boolean((result.rows[0] as { acquired?: boolean } | undefined)?.acquired);
    if (!acquired) return false;
    await job();
    return true;
  });
}