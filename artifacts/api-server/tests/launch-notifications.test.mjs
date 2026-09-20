import assert from "node:assert/strict";
import { test, after } from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = await mkdtemp(path.join(tmpdir(), "linkealls-launch-notifications-"));
after(() => rm(temp, { recursive: true, force: true }));

// All I/O dependencies are replaced, including the push transport. Never read
// live keys, connect to PostgreSQL or send a real push from these tests.
const fixture = `
export const effects = { selects: 0, inserts: [], pushes: [], subscriptions: [], claims: 0 };
export const db = {
  select() {
    effects.selects++;
    return { from() { return this; }, where() { return this; },
      limit() { return [{ pushSubscriptions: [{ endpoint: "https://push.test", keys: {} }] }]; } };
  },
  insert() { return { values(row) { effects.inserts.push(row); return {
    returning: async () => [{ id: "message-1", ...row }]
  }; } }; },
  execute() { throw new Error("Summary database query forbidden"); }
};
export const businessProfilesTable = { id: "id", pushSubscriptions: "pushSubscriptions" };
export const assistantMessagesTable = {};
export const logger = { info() {}, warn() {}, error() {}, debug() {} };
export async function withScheduledJobLock() { effects.claims++; throw new Error("Claim forbidden"); }
export async function listLeads() { throw new Error("Nonessential lead scan forbidden"); }
export async function getLead() {
  return {
    id: "lead-1", businessId: 7,
    qualificationData: { name: "Cliente", phone: "+244923999888", interest: "Produto" },
    contactConsentStatus: "declined", contactPhone: null, whatsappMessage: "Mensagem antiga",
    score: 80,
  };
}
export function ownerLeadView(lead) {
  const { phone, ...qualificationData } = lead.qualificationData;
  return { ...lead, qualificationData, contactPhone: null, whatsappMessage: null };
}
export async function updateLeadState() { throw new Error("Mutation forbidden"); }
export function subscribeToLeadQualified(fn) { effects.subscriptions.push(fn); }
export async function getOrCreateProfile() { throw new Error("Profile access forbidden"); }
export async function loadBusinessBrain() { throw new Error("Brain access forbidden"); }
export function estimateGemini3FlashCostMicros() { return 0; }
export async function proposeBusinessKnowledge() { throw new Error("Knowledge mutation forbidden"); }
export async function recordBusinessAiEvaluation() {}
export function renderBusinessBrain() { return "test brain"; }
export async function assessProfileGaps() { throw new Error("Profile analysis forbidden"); }
export async function createProfileChangeProposal() { throw new Error("Profile proposal forbidden"); }
export async function createResourceRequest() { throw new Error("Resource request forbidden"); }
export class GoogleGenAI { constructor() { throw new Error("AI provider forbidden"); } }
export const Type = { OBJECT: "OBJECT", STRING: "STRING" };
export default {
  setVapidDetails() {},
  async sendNotification(subscription, payload) { effects.pushes.push(JSON.parse(payload)); }
};
`;

const modulePath = path.join(temp, "notifications.mjs");
await build({
  stdin: {
    contents: `
      export * from "./src/services/notifications.ts";
      export * from "./src/services/assistant.ts";
      export { effects } from "launch-notification-fixture";
    `,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: modulePath,
  logLevel: "silent",
  define: {
    "process.env.VAPID_PUBLIC_KEY": '"test-public"',
    "process.env.VAPID_PRIVATE_KEY": '"test-private"',
    "process.env.VAPID_SUBJECT": '"mailto:test@example.invalid"',
  },
  plugins: [{
    name: "isolate-notifications",
    setup(b) {
      b.onResolve({
        filter: /^(launch-notification-fixture|@workspace\/db|@google\/genai|web-push)$|\/(logger|scheduledJobLock|leads|businessProfile|businessBrain|profileImprovements)\.js$/,
      }, () => ({ path: "fixture", namespace: "isolated" }));
      b.onLoad({ filter: /.*/, namespace: "isolated" }, () => ({ contents: fixture, loader: "js" }));
    },
  }],
});
const mod = await import(pathToFileURL(modulePath).href);

test("paused daily cron schedules nothing and does not claim a period or read data", async () => {
  const original = globalThis.setInterval;
  let intervals = 0;
  globalThis.setInterval = () => { intervals++; throw new Error("Unexpected scheduled summary"); };
  try {
    mod.startDailySummaryCron();
    assert.equal(await mod.runDailySummaryFor(new Date("2026-09-18T09:00:00Z")), false);
    assert.equal(await mod.runDailySummaryFor(new Date("2026-09-18T03:00:00Z")), false);
  } finally {
    globalThis.setInterval = original;
  }
  assert.equal(intervals, 0);
  assert.equal(mod.effects.claims, 0);
  assert.equal(mod.effects.selects, 0);
  assert.equal(mod.effects.pushes.length, 0);
});

test("direct summary and stale-lead calls fail before scans or message insertion", async () => {
  for (const operation of [mod.proactiveDailySummary, mod.proactiveStaleLeads]) {
    await assert.rejects(operation(7), (err) =>
      err.statusCode === 403 && err.code === "LAUNCH_FEATURE_PAUSED");
  }
  assert.equal(mod.effects.inserts.length, 0);
});

test("essential lead-qualified messages and event subscriptions are preserved", async () => {
  const message = await mod.proactiveLeadQualified("lead-1");
  assert.equal(message.businessId, 7);
  assert.equal(message.meta.proactiveType, "lead_qualified");
  assert.equal(message.meta.leadId, "lead-1");
  assert.doesNotMatch(message.content, /923999888|WhatsApp|mensagem de follow-up pronta/);
  assert.match(message.content, /não temos um contacto telefónico autorizado/i);
  mod.wireProactiveEvents();
  mod.wireProactiveEvents();
  assert.equal(mod.effects.subscriptions.length, 1);
});

test("essential qualified-lead, order and payment push delivery is not gated", async () => {
  for (const tag of ["lead-qualified-1", "order-1", "payment-1"]) {
    await mod.sendPushToOwner({ title: "Actualização", body: "Estado actualizado", tag }, 7);
  }
  assert.deepEqual(mod.effects.pushes.map((p) => p.tag), ["lead-qualified-1", "order-1", "payment-1"]);
});