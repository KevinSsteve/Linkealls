import assert from "node:assert/strict";
import test, { after } from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = await mkdtemp(path.join(os.tmpdir(), "linkealls-commercial-sales-"));
const modulePath = path.join(tempDir, "commercial-sales.mjs");
const runtimeModulePath = path.join(tempDir, "sales-strategy-runtime.mjs");
await build({
  entryPoints: [path.join(artifactDir, "src/lib/commercialSales.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: modulePath,
  logLevel: "silent",
});
await build({
  entryPoints: [path.join(artifactDir, "src/lib/salesStrategyRuntime.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: runtimeModulePath,
  logLevel: "silent",
});
const {
  updateCommercialMemory,
  chooseNextAction,
  commercialMemoryPrompt,
  retryCommercialMemoryCas,
  commercialIntent,
  detectResourceRequest,
  isAffirmativeConfirmation,
} = await import(pathToFileURL(modulePath).href);
const { applySalesStrategyOverride, orderOfferingsForStrategy, isRuntimeSourceEligible } = await import(pathToFileURL(runtimeModulePath).href);
after(async () => rm(tempDir, { recursive: true, force: true }));

const empty = () => ({
  revision: 0, interests: [], criteria: [], constraints: [], answeredQuestions: [],
  objections: [], stage: "welcome", missingData: [], humanControl: "ai",
});
const strategy = (...availableActions) => ({ availableActions });

test("immediate purchase skips interrogation and requires a confirmed offering", () => {
  const memory = updateCommercialMemory(empty(), "Quero comprar o Gerador Solar", ["Gerador Solar"]);
  assert.equal(memory.goal.value, "comprar");
  assert.equal(memory.stage, "next_step");
  assert.equal(memory.interests[0].value, "Gerador Solar");
  assert.equal(chooseNextAction({
    memory, contactStatus: "pending", hasPaidOrder: false, hasPendingOrder: false,
    hasCatalog: true, hasWhatsApp: false, strategy: strategy("checkout", "catalog"),
  }).type, "checkout");
});

test("contact refusal is respected without losing the commercial journey", () => {
  const action = chooseNextAction({
    memory: empty(), contactStatus: "declined", hasPaidOrder: false, hasPendingOrder: false,
    hasCatalog: true, hasWhatsApp: true, strategy: strategy("catalog"),
  });
  assert.equal(action.type, "none");
  assert.match(action.reason, /pergunta livre/i);
});

test("channel refusal keeps an affirmative purchase intent", () => {
  assert.equal(commercialIntent("Agora não, quero comprar o Gerador Solar", ["Gerador Solar"]), "purchase");
  assert.equal(commercialIntent("Não quero WhatsApp, quero avançar com o Gerador Solar", ["Gerador Solar"]), "purchase");
});

test("resource proposals are explicit and confirmations are narrow", () => {
  const proposal = detectResourceRequest("Quero ver as fotos do Gerador Solar", ["Gerador Solar"]);
  assert.deepEqual(proposal, {
    type: "resource_request",
    kind: "image",
    subject: "Gerador Solar",
    request: "Quero ver as fotos do Gerador Solar",
    purpose: "visitor_chat:image:Gerador Solar",
  });
  assert.equal(isAffirmativeConfirmation("Sim"), true);
  assert.equal(isAffirmativeConfirmation("Sim, quero comprar"), false);
  assert.equal(isAffirmativeConfirmation("Sim"), true);
});

test("automatic CTAs are gated by the approved strategy and runtime capabilities", () => {
  const memory = updateCommercialMemory(empty(), "Quero comprar o Gerador Solar", ["Gerador Solar"]);
  assert.equal(chooseNextAction({
    memory, contactStatus: "pending", hasPaidOrder: false, hasPendingOrder: false,
    hasCatalog: true, hasWhatsApp: false,
  }).type, "none");
  assert.equal(chooseNextAction({
    memory, contactStatus: "pending", hasPaidOrder: false, hasPendingOrder: false,
    hasCatalog: false, hasWhatsApp: false, strategy: strategy("checkout"),
  }).type, "none");
});

test("approved source override changes effective CTA, questions, objective and valid catalog focus", () => {
  const base = {
    template: "consultative", objective: "contact", audience: "", priorityOffers: [],
    essentialQuestions: ["Pergunta base?"], verifiedDifferentials: [], objectionResponses: [],
    negotiationLimits: [], escalationRules: [], stageConditions: [],
    availableActions: ["contact", "owner_handoff"],
  };
  const effective = applySalesStrategyOverride(base, {
    objective: "quote",
    focusedOffer: "Bolo UX",
    minimumQuestions: ["Para quantas pessoas?"],
    cta: "Pedir proposta do anúncio",
  }, ["Bolo UX", "Consultoria"]);
  assert.equal(effective.objective, "quote");
  assert.equal(effective.focusedOffer, "Bolo UX");
  assert.equal(effective.essentialQuestions[0], "Para quantas pessoas?");
  assert.ok(effective.availableActions.includes("quote_request"));
  const action = chooseNextAction({
    memory: empty(), strategy: effective, contactStatus: "pending",
    hasPaidOrder: false, hasPendingOrder: false, hasCatalog: true, hasWhatsApp: false,
  });
  assert.equal(action.type, "quote_request");
  assert.equal(action.label, "Pedir proposta do anúncio");
  assert.equal(orderOfferingsForStrategy([{ name: "Consultoria" }, { name: "Bolo UX" }], effective.focusedOffer)[0].name, "Bolo UX");

  const invalidFocus = applySalesStrategyOverride(base, { focusedOffer: "Oferta inventada" }, ["Bolo UX"]);
  assert.equal(invalidFocus.focusedOffer, undefined);
  assert.deepEqual(invalidFocus.priorityOffers, []);
  assert.equal(isRuntimeSourceEligible("traffic_creative", { active: 1 }), true);
  assert.equal(isRuntimeSourceEligible("traffic_creative", { active: 0 }), false);
  assert.equal(isRuntimeSourceEligible("campaign", { status: "ativa", publishStatus: "ativa" }), true);
  assert.equal(isRuntimeSourceEligible("campaign", { status: "pausada", publishStatus: "ativa" }), false);
  assert.equal(isRuntimeSourceEligible("campaign", { status: "ativa", publishStatus: "pausada" }), false);

  const explicitQuote = updateCommercialMemory(empty(), "Quero pedir orçamento", []);
  const explicitAction = chooseNextAction({
    memory: explicitQuote,
    strategy: { ...effective, objective: "appointment_request", availableActions: ["appointment_request", "quote_request"] },
    contactStatus: "pending", hasPaidOrder: false, hasPendingOrder: false, hasCatalog: true, hasWhatsApp: false,
  });
  assert.equal(explicitAction.type, "quote_request");
});

test("paid orders always switch to follow-up instead of reselling", () => {
  const action = chooseNextAction({
    memory: updateCommercialMemory(empty(), "Quero comprar", []),
    contactStatus: "consented", hasPaidOrder: true, hasPendingOrder: false,
    hasCatalog: true, hasWhatsApp: true,
  });
  assert.equal(action.type, "order_tracking");
});

test("human request and owner control suppress incompatible AI actions", () => {
  const handoff = updateCommercialMemory(empty(), "Quero falar com uma pessoa responsável", []);
  assert.equal(handoff.stage, "handoff");
  assert.equal(chooseNextAction({
    memory: handoff, contactStatus: "pending", hasPaidOrder: false, hasPendingOrder: false,
    hasCatalog: true, hasWhatsApp: false, strategy: strategy("owner_handoff"),
  }).type, "owner_handoff");
  handoff.humanControl = "owner";
  assert.equal(chooseNextAction({
    memory: handoff, contactStatus: "pending", hasPaidOrder: false, hasPendingOrder: false,
    hasCatalog: true, hasWhatsApp: false,
  }).type, "none");
});

test("owner corrections survive inference and visitor changes remain reviewable", () => {
  const corrected = {
    ...empty(),
    goal: { value: "pedir orçamento", provenance: "owner", updatedAt: "2026-01-01T00:00:00.000Z" },
    stage: "clarify",
    pendingAction: "quote_request",
    ownerCorrectedFields: ["goal", "stage", "pendingAction"],
  };
  const memory = updateCommercialMemory(corrected, "Quero comprar a Bateria", ["Bateria"], "2026-01-02T00:00:00.000Z");
  assert.equal(memory.goal.value, "pedir orçamento");
  assert.equal(memory.stage, "clarify");
  assert.equal(memory.pendingAction, "quote_request");
  assert.match(memory.factualSummary, /Objectivo: pedir orçamento/);
  assert.doesNotMatch(memory.factualSummary, /Objectivo: comprar/);
  assert.ok(memory.visitorChangeRequests.some((item) => item.field === "goal" && item.value.includes("comprar")));
});

test("owner takeover retries a stale snapshot and preserves the corrected revision", async () => {
  const snapshots = [
    { revision: 4, goal: "antigo" },
    { revision: 5, goal: "corrigido pelo dono" },
  ];
  const writes = [];
  const result = await retryCommercialMemoryCas(
    async () => snapshots.shift() ?? null,
    async (snapshot) => {
      writes.push(snapshot.revision);
      return snapshot.revision === 5 ? { ...snapshot, revision: 6, humanControl: "owner" } : null;
    },
  );
  assert.deepEqual(writes, [4, 5]);
  assert.equal(result.goal, "corrigido pelo dono");
  assert.equal(result.revision, 6);
});

test("first visitor text uses contextual chat and is not replaced by forced calling", async () => {
  const chat = await readFile(path.join(artifactDir, "../ai-call-funnel/src/pages/Chat.tsx"), "utf8");
  const firstTurn = chat.slice(chat.indexOf("const handleFirstSend"), chat.indexOf("// ── Subsequent chat messages"));
  assert.match(firstTurn, /sendLeadChat/);
  assert.doesNotMatch(firstTurn, /Olá! Diz-me o que procuras/);
  assert.doesNotMatch(firstTurn, /setStage\\(\"call_incoming\"\\)/);
  assert.match(firstTurn, /chatMsgsRef\.current\.slice\(0, -1\)/);
  assert.doesNotMatch(chat, /Partilhei o meu WhatsApp/);
});

test("normal chat claims one revision before model effects and retention is bounded", async () => {
  const leads = await readFile(path.join(artifactDir, "src/services/leads.ts"), "utf8");
  const schema = await readFile(path.join(artifactDir, "../../lib/db/src/schema/salesStrategy.ts"), "utf8");
  const retention = await readFile(path.join(artifactDir, "src/services/salesRetention.ts"), "utf8");
  const chatRuntime = leads.slice(leads.indexOf("export async function chatWithLead"), leads.indexOf("export async function correctCommercialMemory"));
  assert.match(schema, /lead_chat_request_revision_unique/);
  assert.ok(chatRuntime.indexOf("onConflictDoNothing") < chatRuntime.indexOf("generateSalesDecision"));
  assert.ok(chatRuntime.indexOf("if (!rows[0])") < chatRuntime.indexOf("recordTurnOutcome(products)"));
  assert.ok(chatRuntime.indexOf("if (!fallbackRows[0])") < chatRuntime.indexOf("recordTurnOutcome(fallbackProducts)"));
  assert.match(chatRuntime, /trafficWelcomeClaimToken[\s\S]*commercialMemory}->>'revision'/);
  assert.match(retention, /COMMERCIAL_DATA_RETENTION_DAYS = 90/);
  assert.match(retention, /delete\(salesOutcomeEventsTable\)/);
  assert.match(retention, /JSON\.stringify\(emptyCommercialMemory\)/);
  assert.match(retention, /commercialMemory}->>'revision'[\s\S]*\+ 1/);
});

test("memory survives the short model window as bounded factual data", () => {
  const memory = updateCommercialMemory(empty(), "Quero orçamento para Bateria", ["Bateria"]);
  const prompt = commercialMemoryPrompt(memory);
  assert.match(prompt, /pedir orçamento/);
  assert.match(prompt, /Bateria/);
  assert.ok(prompt.length < 3000);
});

test("pending resource context remains bounded and visible to the model", () => {
  const memory = {
    ...empty(),
    pendingProposal: {
      type: "resource_request",
      kind: "image",
      subject: "Gerador Solar",
      request: "Quero ver fotos",
      purpose: "visitor_chat:image:Gerador Solar",
      createdAt: "2026-09-21T00:00:00.000Z",
    },
  };
  assert.match(commercialMemoryPrompt(memory), /Proposta pendente de confirmação: image sobre Gerador Solar/);
});