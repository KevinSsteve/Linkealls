import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = await mkdtemp(path.join(os.tmpdir(), "linkealls-ekwanza-tests-"));
const modulePath = path.join(tempDir, "ekwanza.mjs");
const loggerStubPath = path.join(tempDir, "logger-stub.mjs");

await writeFile(
  loggerStubPath,
  "export const logger = { info() {}, warn() {}, error() {} };\n",
  "utf8",
);

try {
  await build({
    entryPoints: [path.join(artifactDir, "src/services/ekwanza.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: modulePath,
    logLevel: "silent",
    plugins: [{
      name: "stub-logger",
      setup(buildApi) {
        buildApi.onResolve({ filter: /(^|\/)lib\/logger\.js$/ }, () => ({
          path: loggerStubPath,
        }));
      },
    }],
  });

  const testEnv = {
    ...process.env,
    NODE_ENV: "test",
    APPYPAY_CLIENT_ID: "test-client",
    APPYPAY_CLIENT_SECRET: "test-secret",
    APPYPAY_RESOURCE: "test-resource",
    EKWANZA_GPO_PAYMENT_METHOD: "GPO_test-method",
    EKWANZA_OPERATIONS_BASE_URL: "https://gateway.test",
    EKWANZA_API_KEY: "test-api-key",
    EKWANZA_NOTIFICATION_TOKEN: "test-notification-token",
    EKWANZA_TEST_MODULE: modulePath,
  };

  const child = spawn(
    process.execPath,
    [
      "--test",
      path.join(artifactDir, "tests/ekwanza-contract.test.mjs"),
      path.join(artifactDir, "tests/orders-chat-contract.test.mjs"),
      path.join(artifactDir, "tests/catalog-checkout-contract.test.mjs"),
    ],
    { env: testEnv, stdio: "inherit" },
  );

  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });

  process.exitCode = exitCode;
} finally {
  await rm(tempDir, { recursive: true, force: true });
}