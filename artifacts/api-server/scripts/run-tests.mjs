import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = await mkdtemp(path.join(os.tmpdir(), "linkealls-ekwanza-tests-"));
const modulePath = path.join(tempDir, "ekwanza.mjs");
const httpSecurityModulePath = path.join(tempDir, "http-security.mjs");
const pinSecurityModulePath = path.join(tempDir, "pin-security.mjs");
const scheduledRuntimeModulePath = path.join(tempDir, "scheduled-job-runtime.mjs");
const callFunnelProtocolModulePath = path.join(tempDir, "call-funnel-protocol.mjs");
const loggerStubPath = path.join(tempDir, "logger-stub.mjs");
const dbStubPath = path.join(tempDir, "db-stub.mjs");

await writeFile(
  loggerStubPath,
  "export const logger = { info() {}, warn() {}, error() {} };\n",
  "utf8",
);
await writeFile(
  dbStubPath,
  "export const db = { insert() { throw new Error('database should not be used in runtime helper tests'); } }; export const scheduledJobRunsTable = { jobName: 'job_name' };\n",
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
  await build({
    entryPoints: [path.join(artifactDir, "src/lib/httpSecurity.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: httpSecurityModulePath,
    logLevel: "silent",
  });
  await build({
    entryPoints: [path.join(artifactDir, "src/lib/pinSecurity.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: pinSecurityModulePath,
    logLevel: "silent",
  });
  await build({
    entryPoints: [path.join(artifactDir, "src/lib/scheduledJobLock.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: scheduledRuntimeModulePath,
    logLevel: "silent",
    plugins: [{
      name: "stub-scheduled-runtime-db",
      setup(buildApi) {
        buildApi.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: dbStubPath }));
      },
    }],
  });
  await build({
    entryPoints: [path.join(artifactDir, "src/lib/callFunnelProtocol.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: callFunnelProtocolModulePath,
    logLevel: "silent",
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
    HTTP_SECURITY_TEST_MODULE: httpSecurityModulePath,
    PIN_SECURITY_TEST_MODULE: pinSecurityModulePath,
    SCHEDULED_RUNTIME_TEST_MODULE: scheduledRuntimeModulePath,
    CALL_FUNNEL_PROTOCOL_TEST_MODULE: callFunnelProtocolModulePath,
  };

  const child = spawn(
    process.execPath,
    [
      "--test",
      path.join(artifactDir, "tests/ekwanza-contract.test.mjs"),
      path.join(artifactDir, "tests/orders-chat-contract.test.mjs"),
      path.join(artifactDir, "tests/catalog-checkout-contract.test.mjs"),
      path.join(artifactDir, "tests/auth-ownership-contract.test.mjs"),
      path.join(artifactDir, "tests/session-security.test.mjs"),
      path.join(artifactDir, "tests/scheduled-runtime.test.mjs"),
      path.join(artifactDir, "tests/visitor-capabilities.test.mjs"),
      path.join(artifactDir, "tests/health-readiness.test.mjs"),
      path.join(artifactDir, "tests/visitor-voice.test.mjs"),
      path.join(artifactDir, "tests/launch-scope.test.mjs"),
      path.join(artifactDir, "tests/launch-notifications.test.mjs"),
      path.join(artifactDir, "tests/onboarding-business-analysis.test.mjs"),
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