import assert from "node:assert/strict";
import test, { after } from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const apiServerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = await mkdtemp(path.join(os.tmpdir(), "linkealls-health-tests-"));
const modulePath = path.join(tempDir, "health.mjs");
const dbStubPath = path.join(tempDir, "db-stub.mjs");

await writeFile(
  dbStubPath,
  "export const pool = { query() { throw new Error('live database must not be used'); } };\n",
  "utf8",
);
await build({
  entryPoints: [path.join(apiServerDir, "src/routes/health.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  outfile: modulePath,
  logLevel: "silent",
  plugins: [{
    name: "stub-health-database",
    setup(buildApi) {
      buildApi.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: dbStubPath }));
    },
  }],
});

const health = await import(pathToFileURL(modulePath).href);
after(() => rm(tempDir, { recursive: true, force: true }));

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("readiness reports ready only after the database probe succeeds", async () => {
  const res = responseRecorder();
  await health.createReadinessHandler(async () => ({ rows: [{ "?column?": 1 }] }), 50)(
    {},
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { status: "ready" });
});

test("readiness requires every additive migration table", () => {
  assert.equal(
    health.hasRequiredDatabaseState([{ db_ok: 1, required_tables_ok: true }]),
    true,
  );
  assert.equal(
    health.hasRequiredDatabaseState([{ db_ok: 1, required_tables_ok: false }]),
    false,
  );
  assert.equal(health.hasRequiredDatabaseState([{ db_ok: 1 }]), false);
  assert.equal(health.hasRequiredDatabaseState([]), false);
});

test("readiness hides database errors behind a generic 503", async () => {
  const res = responseRecorder();
  await health.createReadinessHandler(
    async () => {
      throw new Error("postgres://user:secret@private-host/database");
    },
    50,
  )({}, res);

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { status: "unavailable" });
  assert.doesNotMatch(JSON.stringify(res.body), /secret|private-host|postgres/i);
});

test("readiness returns a bounded generic 503 when the probe does not settle", async () => {
  const res = responseRecorder();
  const startedAt = Date.now();
  await health.createReadinessHandler(() => new Promise(() => {}), 20)({}, res);

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { status: "unavailable" });
  assert.ok(Date.now() - startedAt < 500, "readiness timeout was not bounded");
});

test("liveness route remains independent from the database probe", () => {
  const healthLayer = health.default.stack.find((layer) =>
    layer.route?.path === "/healthz"
  );
  assert.ok(healthLayer, "/healthz route must remain registered");

  const res = responseRecorder();
  healthLayer.route.stack[0].handle({}, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { status: "ok" });
});