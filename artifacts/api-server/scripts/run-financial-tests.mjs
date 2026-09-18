import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = await mkdtemp(path.join(os.tmpdir(), "linkealls-financial-tests-"));
const modulePath = path.join(tempDir, "financial.mjs");
const fixturePath = path.join(artifactDir, "tests/financial-memory-fixture.mjs");

try {
  const entryPath = path.join(tempDir, "entry.mjs");
  await writeFile(entryPath, [
    `export * from ${JSON.stringify(path.join(artifactDir, "src/services/payments.ts"))};`,
    `export * from ${JSON.stringify(path.join(artifactDir, "src/services/campaignAds.ts"))};`,
    `export * from ${JSON.stringify(path.join(artifactDir, "src/services/ekwanza.ts"))};`,
    `export { default as paymentRouter } from ${JSON.stringify(path.join(artifactDir, "src/routes/payments.ts"))};`,
    `export { reset, state } from ${JSON.stringify(fixturePath)};`,
  ].join("\n"));
  const built = await build({
    entryPoints: [entryPath],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: modulePath,
    metafile: true,
    logLevel: "silent",
    plugins: [{
      name: "financial-test-boundaries",
      setup(api) {
        api.onResolve({
          filter: /^(?:@workspace\/db(?:\/.*)?|drizzle-orm|express)$|(?:^|\/)(?:logger|notifications|zernio|scheduledJobLock)\.js$/,
        }, () => ({ path: fixturePath }));
      },
    }],
  });
  // Prevent an accidentally added dependency from bundling the real database.
  if (Object.keys(built.metafile.inputs).some((input) => /(?:^|\/)lib\/db\/|node_modules\/(?:pg|postgres)\//.test(input))) {
    throw new Error("Financial tests must not import a real database implementation");
  }
  const child = spawn(process.execPath, [
    "--test",
    path.join(artifactDir, "tests/ekwanza-contract.test.mjs"),
    path.join(artifactDir, "tests/financial-regression.test.mjs"),
  ], {
    stdio: "inherit",
    // Deliberately do not inherit credentials, DATABASE_URL, or provider URLs.
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "test",
      APPYPAY_CLIENT_ID: "test-client",
      APPYPAY_CLIENT_SECRET: "test-secret",
      APPYPAY_RESOURCE: "test-resource",
      APPYPAY_AUTH_URL: "https://auth.test/token",
      APPYPAY_BASE_URL: "https://gateway.test",
      EKWANZA_GPO_PAYMENT_METHOD: "GPO_test-method",
      EKWANZA_OPERATIONS_BASE_URL: "https://gateway.test",
      EKWANZA_API_KEY: "test-api-key",
      EKWANZA_NOTIFICATION_TOKEN: "test-notification-token",
      EKWANZA_PARTNER_REGISTRATION: "test-partner",
      EKWANZA_MERCHANT_IDENTIFIER: "test-merchant",
      PUBLIC_BASE_URL: "https://app.test",
      GEMINI_API_KEY: "test-unused",
      FINANCIAL_TEST_MODULE: modulePath,
      EKWANZA_TEST_MODULE: modulePath,
    },
  });
  process.exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
} finally {
  await rm(tempDir, { recursive: true, force: true });
}