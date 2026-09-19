import { and, asc, eq, lt } from "drizzle-orm";
import { db, payoutsTable } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { IS_SIMULATION, reconcilePayout } from "./payments.js";

const RECONCILIATION_INTERVAL_MS = 5 * 60_000;
const MIN_PENDING_AGE_MS = 2 * 60_000;
const BATCH_SIZE = 50;

export async function reconcilePendingPayouts(now = new Date()): Promise<{
  checked: number;
  processed: number;
  reverted: number;
  pending: number;
  errors: number;
}> {
  const result = { checked: 0, processed: 0, reverted: 0, pending: 0, errors: 0 };
  if (IS_SIMULATION) return result;

  const staleBefore = new Date(now.getTime() - MIN_PENDING_AGE_MS);
  const payouts = await db
    .select({
      id: payoutsTable.id,
      businessId: payoutsTable.businessId,
    })
    .from(payoutsTable)
    .where(and(
      eq(payoutsTable.status, "pendente"),
      lt(payoutsTable.updatedAt, staleBefore),
    ))
    .orderBy(asc(payoutsTable.updatedAt))
    .limit(BATCH_SIZE);

  for (const payout of payouts) {
    result.checked += 1;
    try {
      const reconciled = await reconcilePayout(payout.id, payout.businessId);
      if (!reconciled) {
        result.errors += 1;
        continue;
      }
      result[reconciled.reconciliation] += 1;
      if (reconciled.reconciliation === "pending") {
        await db
          .update(payoutsTable)
          .set({ updatedAt: now })
          .where(and(
            eq(payoutsTable.id, payout.id),
            eq(payoutsTable.status, "pendente"),
          ));
      }
    } catch (err) {
      result.errors += 1;
      await db
        .update(payoutsTable)
        .set({ updatedAt: now })
        .where(and(
          eq(payoutsTable.id, payout.id),
          eq(payoutsTable.status, "pendente"),
        ))
        .catch((touchErr) => {
          logger.error(
            { err: touchErr, payoutId: payout.id },
            "Could not advance failed payout reconciliation retry",
          );
        });
      logger.error(
        { err, payoutId: payout.id, businessId: payout.businessId },
        "Automatic payout reconciliation failed; will retry",
      );
    }
  }

  if (result.checked > 0) {
    logger.info(result, "Automatic payout reconciliation completed");
  }
  return result;
}

export function startPaymentReconciliationCron(): void {
  if (IS_SIMULATION) {
    logger.info("Automatic payout reconciliation disabled in simulation mode");
    return;
  }

  const tick = () => {
    void reconcilePendingPayouts().catch((err) => {
      logger.error({ err }, "Automatic payout reconciliation tick failed");
    });
  };

  setTimeout(tick, 30_000).unref();
  setInterval(tick, RECONCILIATION_INTERVAL_MS).unref();
  logger.info("Automatic payout reconciliation started");
}