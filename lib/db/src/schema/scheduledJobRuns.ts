import { pgTable, text, timestamp, primaryKey } from "drizzle-orm/pg-core";

/**
 * A durable, idempotency ledger for process-local scheduled work.
 *
 * `runKey` is a deterministic logical period (for example `2026-08-11` or a
 * fifteen-minute UTC bucket), rather than a process-specific timestamp.
 */
export const scheduledJobRunsTable = pgTable(
  "scheduled_job_runs",
  {
    jobName: text("job_name").notNull(),
    runKey: text("run_key").notNull(),
    claimedAt: timestamp("claimed_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.jobName, table.runKey] }),
  ],
);