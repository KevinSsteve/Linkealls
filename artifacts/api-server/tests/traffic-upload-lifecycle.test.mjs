import assert from "node:assert/strict";
import test, { after } from "node:test";
import { build } from "esbuild";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceDir = path.resolve(apiDir, "../..");
const tempDir = await mkdtemp(path.join(os.tmpdir(), "linkealls-traffic-upload-cleanup-"));
const dbStub = path.join(tempDir, "db.mjs");
const storageStub = path.join(tempDir, "storage.mjs");
const loggerStub = path.join(tempDir, "logger.mjs");
const modulePath = path.join(tempDir, "cleanup.mjs");

await Promise.all([
  writeFile(dbStub, `
export const db = new Proxy({}, { get() { return () => { throw new Error("database must be injected in cleanup tests"); }; } });
export const trafficCreativesTable = new Proxy({}, { get(_target, key) { return String(key); } });
export const trafficCreativeUploadsTable = new Proxy({}, { get(_target, key) { return String(key); } });
`, "utf8"),
  writeFile(storageStub, `
export class ObjectNotFoundError extends Error {}
export class ObjectStorageService {
  async deleteObjectEntity() { throw new Error("storage must be injected in cleanup tests"); }
}
`, "utf8"),
  writeFile(loggerStub, "export const logger = { info() {}, warn() {}, error() {} };\n", "utf8"),
]);

await build({
  entryPoints: [path.join(apiDir, "src/services/trafficCreativeUploadCleanup.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: modulePath,
  logLevel: "silent",
  plugins: [{
    name: "cleanup-boundaries",
    setup(api) {
      api.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: dbStub }));
      api.onResolve({ filter: /lib\/objectStorage\.js$/ }, () => ({ path: storageStub }));
      api.onResolve({ filter: /lib\/logger\.js$/ }, () => ({ path: loggerStub }));
    },
  }],
});

const { cleanupExpiredTrafficCreativeUploads, ObjectNotFoundError } =
  await import(pathToFileURL(modulePath).href);
after(async () => rm(tempDir, { recursive: true, force: true }));

function statefulDependencies(records, creativeReferences, provider) {
  return {
    async listCandidates(now, staleClaimBefore, limit) {
      return records
        .filter((record) =>
          record.expiresAt <= now &&
          (
            record.status === "pending" ||
            record.status === "cleanup_failed" ||
            (record.status === "deleting" && record.cleanupClaimedAt < staleClaimBefore)
          ) &&
          !creativeReferences.has(record.objectPath)
        )
        .slice(0, limit);
    },
    async claim(candidate, now, staleClaimBefore) {
      const record = records.find((item) => item.id === candidate.id);
      const claimable = record &&
        (
          record.status === "pending" ||
          record.status === "cleanup_failed" ||
          (record.status === "deleting" && record.cleanupClaimedAt < staleClaimBefore)
        );
      if (!claimable) return false;
      record.status = "deleting";
      record.cleanupClaimedAt = now;
      record.cleanupAttempts += 1;
      record.lastCleanupError = null;
      return true;
    },
    async findCreativeId(objectPath) {
      return creativeReferences.get(objectPath) ?? null;
    },
    async markConfirmed(candidate, creativeId, now) {
      const record = records.find((item) => item.id === candidate.id);
      Object.assign(record, {
        status: "confirmed", creativeId, confirmedAt: now,
        cleanupClaimedAt: null, lastCleanupError: null,
      });
    },
    async deleteObject(objectPath) {
      await provider.delete(objectPath);
    },
    async markDeleted(candidate) {
      const record = records.find((item) => item.id === candidate.id);
      Object.assign(record, { status: "deleted", cleanupClaimedAt: null, lastCleanupError: null });
    },
    async markFailed(candidate, _now, retryAt, error) {
      const record = records.find((item) => item.id === candidate.id);
      Object.assign(record, {
        status: "cleanup_failed", expiresAt: retryAt,
        cleanupClaimedAt: null, lastCleanupError: error,
      });
    },
  };
}

function upload(id, status, expiresAt, suffix = id) {
  return {
    id,
    businessSlug: "owner",
    objectPath: `/objects/traffic-creatives/owner/${suffix}`,
    status,
    expiresAt,
    cleanupClaimedAt: null,
    cleanupAttempts: 0,
    lastCleanupError: null,
  };
}

test("cleanup removes only expired orphans and retries provider failures idempotently", async () => {
  const now = new Date("2026-09-19T12:00:00.000Z");
  const expired = new Date(now.getTime() - 1);
  const future = new Date(now.getTime() + 2 * 60 * 60_000);
  const records = [
    upload("orphan", "pending", expired),
    upload("already-missing", "pending", expired),
    upload("provider-failure", "pending", expired),
    upload("fresh", "pending", future),
    upload("active", "pending", expired),
    upload("paused", "pending", expired),
    upload("historical", "pending", expired),
  ];
  const references = new Map([
    [records[4].objectPath, "creative-active"],
    [records[5].objectPath, "creative-paused"],
    [records[6].objectPath, "creative-historical"],
  ]);
  const deletedPaths = [];
  let providerRecovered = false;
  const provider = {
    async delete(objectPath) {
      if (objectPath.endsWith("/already-missing")) throw new ObjectNotFoundError();
      if (objectPath.endsWith("/provider-failure") && !providerRecovered) {
        throw new Error("provider unavailable");
      }
      deletedPaths.push(objectPath);
    },
  };
  const dependencies = statefulDependencies(records, references, provider);

  const first = await cleanupExpiredTrafficCreativeUploads(now, dependencies);
  assert.deepEqual(first, { checked: 3, deleted: 2, protected: 0, failed: 1 });
  assert.equal(records.find((item) => item.id === "orphan").status, "deleted");
  assert.equal(records.find((item) => item.id === "already-missing").status, "deleted");
  assert.equal(records.find((item) => item.id === "provider-failure").status, "cleanup_failed");
  assert.match(records.find((item) => item.id === "provider-failure").lastCleanupError, /provider unavailable/);
  assert.equal(records.find((item) => item.id === "fresh").status, "pending");
  for (const id of ["active", "paused", "historical"]) {
    assert.equal(records.find((item) => item.id === id).status, "pending");
  }
  assert.deepEqual(deletedPaths, ["/objects/traffic-creatives/owner/orphan"]);

  const repeated = await cleanupExpiredTrafficCreativeUploads(now, dependencies);
  assert.deepEqual(repeated, { checked: 0, deleted: 0, protected: 0, failed: 0 });
  assert.equal(deletedPaths.length, 1);

  providerRecovered = true;
  const retryAt = new Date(now.getTime() + 15 * 60_000);
  const retried = await cleanupExpiredTrafficCreativeUploads(retryAt, dependencies);
  assert.deepEqual(retried, { checked: 1, deleted: 1, protected: 0, failed: 0 });
  assert.equal(records.find((item) => item.id === "provider-failure").status, "deleted");
  assert.equal(records.find((item) => item.id === "provider-failure").cleanupAttempts, 2);
});

test("a creative created after candidate selection is rechecked and protected", async () => {
  const now = new Date("2026-09-19T12:00:00.000Z");
  const record = upload("race", "pending", new Date(now.getTime() - 1));
  const references = new Map();
  const provider = { async delete() { throw new Error("referenced object must not be deleted"); } };
  const dependencies = statefulDependencies([record], references, provider);
  const originalClaim = dependencies.claim;
  dependencies.claim = async (...args) => {
    const claimed = await originalClaim(...args);
    references.set(record.objectPath, "creative-created-during-cleanup");
    return claimed;
  };

  const result = await cleanupExpiredTrafficCreativeUploads(now, dependencies);
  assert.deepEqual(result, { checked: 1, deleted: 0, protected: 1, failed: 0 });
  assert.equal(record.status, "confirmed");
  assert.equal(record.creativeId, "creative-created-during-cleanup");
});

test("schema, upload route and creative creation preserve the lifecycle contract", async () => {
  const [schema, migration, storageRoute, creativeService, cleanupService, server] = await Promise.all([
    readFile(path.join(workspaceDir, "lib/db/src/schema/trafficCreatives.ts"), "utf8"),
    readFile(path.join(workspaceDir, "lib/db/migrations/0015_add_traffic_creative_upload_lifecycle.sql"), "utf8"),
    readFile(path.join(apiDir, "src/routes/storage.ts"), "utf8"),
    readFile(path.join(apiDir, "src/services/trafficCreatives.ts"), "utf8"),
    readFile(path.join(apiDir, "src/services/trafficCreativeUploadCleanup.ts"), "utf8"),
    readFile(path.join(apiDir, "src/index.ts"), "utf8"),
  ]);

  assert.match(schema, /trafficCreativeUploadsTable/);
  assert.match(schema, /expiresAt: timestamp\("expires_at"\)\.notNull\(\)/);
  assert.match(schema, /creativeId: uuid\("creative_id"\)\.references/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "traffic_creative_uploads"/);
  assert.match(storageRoute, /TRAFFIC_UPLOAD_PENDING_MS = 60 \* 60_000/);
  assert.match(storageRoute, /db\.insert\(trafficCreativeUploadsTable\)/);
  assert.match(storageRoute, /businessId: business\.id/);
  assert.match(creativeService, /db\.transaction\(async \(tx\)/);
  assert.match(creativeService, /eq\(trafficCreativeUploadsTable\.status, "pending"\)/);
  assert.match(creativeService, /gt\(trafficCreativeUploadsTable\.expiresAt, new Date\(\)\)/);
  assert.match(creativeService, /status: "confirmed"/);
  assert.match(cleanupService, /notExists\(/);
  assert.match(cleanupService, /findCreativeId\(candidate\.objectPath\)/);
  assert.ok(cleanupService.includes('`/objects/traffic-creatives/${candidate.businessSlug}/`'));
  assert.match(server, /startTrafficCreativeUploadCleanupCron\(\)/);
});