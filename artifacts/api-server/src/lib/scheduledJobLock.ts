import { db, scheduledJobRunsTable } from "@workspace/db";

/**
 * Storage boundary kept separate so the once-only policy can be exercised
 * without a database in behavioural tests.
 */
export interface ScheduledRunClaimer {
  claim: (jobName: string, runKey: string) => Promise<boolean>;
}

/**
 * Runs work only when its durable period key was claimed.
 *
 * The claim deliberately commits before work starts. Database writes and
 * external side effects (Web Push / provider API calls) cannot share one
 * atomic transaction, so this chooses **at-most-once** delivery: a crash or
 * failure after the claim can leave that period incomplete, but a restart or
 * another autoscale replica cannot repeat it. Jobs that require retriable
 * delivery need an outbox/provider idempotency key rather than changing this
 * ledger to "complete after sending" (which would allow duplicate sends after
 * a crash).
 */
export async function runClaimedScheduledJob(
  claimer: ScheduledRunClaimer,
  jobName: string,
  runKey: string,
  job: () => Promise<void>,
): Promise<boolean> {
  if (!(await claimer.claim(jobName, runKey))) return false;
  await job();
  return true;
}

const databaseScheduledRunClaimer: ScheduledRunClaimer = {
  async claim(jobName, runKey) {
    const rows = await db
      .insert(scheduledJobRunsTable)
      .values({ jobName, runKey })
      .onConflictDoNothing()
      .returning({ jobName: scheduledJobRunsTable.jobName });
    return rows.length === 1;
  },
};

/**
 * Legacy name retained for callers. Unlike the former advisory-only lock,
 * this persists a unique `(jobName, runKey)` claim and therefore also blocks
 * sequential duplicate runs after the first replica has finished.
 */
export async function withScheduledJobLock(
  jobName: string,
  runKey: string,
  job: () => Promise<void>,
): Promise<boolean> {
  return runClaimedScheduledJob(databaseScheduledRunClaimer, jobName, runKey, job);
}

/** Stable UTC bucket key used by interval jobs across all replicas. */
export function utcIntervalRunKey(now: Date, intervalMs: number): string {
  if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) {
    throw new Error("intervalMs must be a positive safe integer");
  }
  return String(Math.floor(now.getTime() / intervalMs));
}