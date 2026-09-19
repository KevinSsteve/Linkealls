import { and, asc, eq, inArray, lt, lte, notExists, or, sql } from "drizzle-orm";
import {
  db,
  trafficCreativesTable,
  trafficCreativeUploadsTable,
  type TrafficCreativeUpload,
} from "@workspace/db";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage.js";
import { logger } from "../lib/logger.js";

export { ObjectNotFoundError };

const CLEANUP_INTERVAL_MS = 15 * 60_000;
const STALE_CLAIM_MS = 30 * 60_000;
const RETRY_DELAY_MS = 15 * 60_000;
const BATCH_SIZE = 50;

type CleanupCandidate = Pick<TrafficCreativeUpload, "id" | "businessSlug" | "objectPath">;

export interface TrafficUploadCleanupDependencies {
  listCandidates(now: Date, staleClaimBefore: Date, limit: number): Promise<CleanupCandidate[]>;
  claim(candidate: CleanupCandidate, now: Date, staleClaimBefore: Date): Promise<boolean>;
  findCreativeId(objectPath: string): Promise<string | null>;
  markConfirmed(candidate: CleanupCandidate, creativeId: string, now: Date): Promise<void>;
  deleteObject(objectPath: string): Promise<void>;
  markDeleted(candidate: CleanupCandidate, now: Date): Promise<void>;
  markFailed(candidate: CleanupCandidate, now: Date, retryAt: Date, error: string): Promise<void>;
}

const storage = new ObjectStorageService();

const productionDependencies: TrafficUploadCleanupDependencies = {
  async listCandidates(now, staleClaimBefore, limit) {
    return db.select({
      id: trafficCreativeUploadsTable.id,
      businessSlug: trafficCreativeUploadsTable.businessSlug,
      objectPath: trafficCreativeUploadsTable.objectPath,
    }).from(trafficCreativeUploadsTable)
      .where(and(
        lte(trafficCreativeUploadsTable.expiresAt, now),
        or(
          inArray(trafficCreativeUploadsTable.status, ["pending", "cleanup_failed"]),
          and(
            eq(trafficCreativeUploadsTable.status, "deleting"),
            lt(trafficCreativeUploadsTable.cleanupClaimedAt, staleClaimBefore),
          ),
        ),
        notExists(
          db.select({ id: trafficCreativesTable.id })
            .from(trafficCreativesTable)
            .where(eq(trafficCreativesTable.objectPath, trafficCreativeUploadsTable.objectPath)),
        ),
      ))
      .orderBy(asc(trafficCreativeUploadsTable.expiresAt))
      .limit(limit);
  },
  async claim(candidate, now, staleClaimBefore) {
    const claimed = await db.update(trafficCreativeUploadsTable)
      .set({
        status: "deleting",
        cleanupClaimedAt: now,
        cleanupAttempts: sql`${trafficCreativeUploadsTable.cleanupAttempts} + 1`,
        lastCleanupError: null,
        updatedAt: now,
      })
      .where(and(
        eq(trafficCreativeUploadsTable.id, candidate.id),
        or(
          inArray(trafficCreativeUploadsTable.status, ["pending", "cleanup_failed"]),
          and(
            eq(trafficCreativeUploadsTable.status, "deleting"),
            lt(trafficCreativeUploadsTable.cleanupClaimedAt, staleClaimBefore),
          ),
        ),
      ))
      .returning({ id: trafficCreativeUploadsTable.id });
    if (!claimed[0]) return false;
    return true;
  },
  async findCreativeId(objectPath) {
    const rows = await db.select({ id: trafficCreativesTable.id })
      .from(trafficCreativesTable)
      .where(eq(trafficCreativesTable.objectPath, objectPath))
      .limit(1);
    return rows[0]?.id ?? null;
  },
  async markConfirmed(candidate, creativeId, now) {
    await db.update(trafficCreativeUploadsTable).set({
      status: "confirmed",
      creativeId,
      confirmedAt: now,
      cleanupClaimedAt: null,
      lastCleanupError: null,
      updatedAt: now,
    }).where(eq(trafficCreativeUploadsTable.id, candidate.id));
  },
  async deleteObject(objectPath) {
    await storage.deleteObjectEntity(objectPath);
  },
  async markDeleted(candidate, now) {
    await db.update(trafficCreativeUploadsTable).set({
      status: "deleted",
      cleanupClaimedAt: null,
      lastCleanupError: null,
      updatedAt: now,
    }).where(eq(trafficCreativeUploadsTable.id, candidate.id));
  },
  async markFailed(candidate, now, retryAt, error) {
    await db.update(trafficCreativeUploadsTable).set({
      status: "cleanup_failed",
      expiresAt: retryAt,
      cleanupClaimedAt: null,
      lastCleanupError: error.slice(0, 1000),
      updatedAt: now,
    }).where(eq(trafficCreativeUploadsTable.id, candidate.id));
  },
};

export async function cleanupExpiredTrafficCreativeUploads(
  now = new Date(),
  dependencies: TrafficUploadCleanupDependencies = productionDependencies,
): Promise<{ checked: number; deleted: number; protected: number; failed: number }> {
  const result = { checked: 0, deleted: 0, protected: 0, failed: 0 };
  const staleClaimBefore = new Date(now.getTime() - STALE_CLAIM_MS);
  const candidates = await dependencies.listCandidates(now, staleClaimBefore, BATCH_SIZE);

  for (const candidate of candidates) {
    if (!(await dependencies.claim(candidate, now, staleClaimBefore))) continue;
    result.checked += 1;
    try {
      const expectedPrefix = `/objects/traffic-creatives/${candidate.businessSlug}/`;
      if (!candidate.objectPath.startsWith(expectedPrefix) ||
          candidate.objectPath.slice(expectedPrefix.length).includes("/")) {
        throw new Error("Caminho de upload de Tráfego Pago inválido");
      }
      const creativeId = await dependencies.findCreativeId(candidate.objectPath);
      if (creativeId) {
        await dependencies.markConfirmed(candidate, creativeId, now);
        result.protected += 1;
        continue;
      }
      try {
        await dependencies.deleteObject(candidate.objectPath);
      } catch (error) {
        if (!(error instanceof ObjectNotFoundError)) throw error;
      }
      await dependencies.markDeleted(candidate, now);
      result.deleted += 1;
    } catch (error) {
      result.failed += 1;
      const message = error instanceof Error ? error.message : "Falha desconhecida no armazenamento";
      await dependencies.markFailed(
        candidate,
        now,
        new Date(now.getTime() + RETRY_DELAY_MS),
        message,
      );
      logger.error(
        { err: error, uploadId: candidate.id, objectPath: candidate.objectPath },
        "Traffic creative orphan cleanup failed; will retry",
      );
    }
  }

  if (result.checked > 0) logger.info(result, "Traffic creative orphan cleanup completed");
  return result;
}

export function startTrafficCreativeUploadCleanupCron(): void {
  const tick = () => {
    void cleanupExpiredTrafficCreativeUploads().catch((error) => {
      logger.error({ err: error }, "Traffic creative orphan cleanup tick failed");
    });
  };
  setTimeout(tick, 60_000).unref();
  setInterval(tick, CLEANUP_INTERVAL_MS).unref();
  logger.info("Traffic creative orphan cleanup started");
}