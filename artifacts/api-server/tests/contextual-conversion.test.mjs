import assert from "node:assert/strict";
import test, { after } from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = await mkdtemp(path.join(os.tmpdir(), "contextual-conversion-"));
after(() => rm(dir, { recursive: true, force: true }));
async function load(name) {
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(root, `src/lib/${name}.ts`)], bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent" });
  return import(pathToFileURL(outfile).href);
}
const sales = await load("commercialSales");
const chat = await load("leadChatContext");
const empty = () => ({ revision: 0, interests: [], criteria: [], constraints: [], answeredQuestions: [], objections: [], stage: "welcome", missingData: [], humanControl: "ai" });
const offerings = [{ name: "Produto A", description: "Modelo básico", price: "15000 Kz" }, { name: "Produto B", description: "Modelo premium", price: "17000 Kz" }];
function turn(message, previous = empty(), contactStatus = "pending") {
  const memory = sales.updateCommercialMemory(previous, message, offerings.map((o) => o.name));
  const action = sales.chooseNextAction({ memory, currentMessage: message, strategy: { objective: "purchase", availableActions: ["catalog", "checkout", "contact", "owner_handoff", "quote_request", "visit_request"] }, contactStatus, hasCatalog: true, hasWhatsApp: true, hasPaidOrder: false, hasPendingOrder: false });
  return { memory, action };
}
test("1 curious visitor gets no forced conversion", () => assert.equal(turn("Quero saber mais").action.type, "none"));
test("2 ready buyer proceeds directly", () => assert.equal(turn("Quero comprar Produto A").action.type, "checkout"));
test("3 insufficient budget filters expensive offers", () => assert.deepEqual(chat.selectLeadChatProducts(offerings, "Só tenho 15 mil").map((o) => o.name), ["Produto A"]));
test("4 alternatives respect remembered budget", () => assert.deepEqual(chat.selectLeadChatProducts(offerings, "Tem uma alternativa?", 15000).map((o) => o.name), ["Produto A"]));
test("5 researching does not restart sales", () => assert.equal(turn("Estou apenas a pesquisar").action.type, "none"));
test("6 refusal does not block a later checkout", () => assert.equal(turn("Quero comprar Produto A", empty(), "declined").action.type, "checkout"));
test("7 human request routes to owner", () => assert.equal(turn("Quero falar com o dono").action.type, "owner_handoff"));
test("8 preference change replaces previous interest", () => {
  const first = turn("Quero comprar Produto A").memory;
  assert.deepEqual(turn("Agora quero Produto B", first).memory.interests.map((i) => i.value), ["Produto B"]);
});
test("9 multiple declared criteria are retained", () => {
  const memory = turn("Procuro Produto A no Zango até 15 milhões esta semana").memory;
  assert.ok(memory.criteria.some((i) => i.value === "Orçamento: 15000000 Kz"));
  assert.ok(memory.criteria.some((i) => i.value === "Local: Zango"));
  assert.ok(memory.constraints.some((i) => i.value.includes("esta semana")));
});
test("10 thanks clears stale checkout", () => assert.equal(turn("Obrigado", turn("Quero comprar Produto A").memory).action.type, "none"));
test("11 traffic welcome no longer forces consent", async () => {
  const source = await readFile(path.join(root, "src/routes/businessScoped.ts"), "utf8");
  assert.doesNotMatch(source, /requestContactConsent: true/);
});
test("12 unrelated question clears prior sales action", () => assert.equal(turn("Qual é o horário?", turn("Quero comprar Produto A").memory).action.type, "none"));
test("13 qualification uses only one unanswered question", () => {
  assert.equal(chat.compactCommercialReply("Qual o orçamento? Em que zona? Que prazo?", "Procuro opções", ["orçamento"]), "Em que zona?");
});
test("14 comparison returns catalog action and real offers", () => {
  assert.equal(turn("Quero comparar Produto A e Produto B").action.type, "catalog");
  assert.equal(chat.selectLeadChatProducts(offerings, "Quero comparar").length, 2);
});
test("15 checkout never bypasses capabilities", () => {
  const memory = turn("Quero comprar Produto A").memory;
  assert.equal(sales.chooseNextAction({ memory, currentMessage: "Quero comprar Produto A", strategy: { availableActions: [] }, contactStatus: "pending", hasCatalog: true, hasWhatsApp: true, hasPaidOrder: false, hasPendingOrder: false }).type, "none");
});
test("owner control wins even when browsing", () => assert.equal(turn("Mostra opções", { ...empty(), humanControl: "owner" }).action.type, "none"));
test("budget is not a request for quote", () => assert.equal(turn("O meu orçamento é 15000 Kz").memory.pendingAction, undefined));
test("runtime removes generated contact instructions", () => assert.equal(chat.compactCommercialReply("Envia o teu WhatsApp. O preço é 15000 Kz.", "Quanto custa?"), "O preço é 15000 Kz."));
test("qualification recognises equivalent concepts rather than repeating them", () => {
  assert.equal(sales.commercialQuestionAnswered("Qual faixa de investimento?", ["orçamento"]), true);
  assert.equal(sales.commercialQuestionAnswered("Em que bairro?", ["localização"]), true);
  assert.equal(chat.compactCommercialReply("Quanto podes gastar? Que cor preferes?", "Procuro opções", ["orçamento"]), "Que cor preferes?");
});
test("final handoff uses final missing data and action, preserving owner summary", () => {
  const memory = turn("Quero comprar Produto A").memory;
  memory.missingData = ["Quantidade"];
  memory.objections = [{ text: "Preço alto", status: "pending", provenance: "declared" }];
  sales.finalizeCommercialSummary(memory, { type: "none", reason: "Sem capacidade" });
  assert.match(memory.factualSummary, /Quantidade/);
  assert.match(memory.factualSummary, /Preço alto/);
  assert.match(memory.factualSummary, /continuar por texto/);
  assert.doesNotMatch(memory.factualSummary, /checkout/);
  memory.ownerCorrectedFields = ["factualSummary"];
  memory.factualSummary = "Resumo verificado";
  sales.finalizeCommercialSummary(memory, { type: "checkout", label: "Comprar", reason: "Pedido" });
  assert.equal(memory.factualSummary, "Resumo verificado");
});
test("WhatsApp surface is turn-scoped and does not duplicate the action button", async () => {
  const source = await readFile(path.join(root, "../ai-call-funnel/src/pages/Chat.tsx"), "utf8");
  assert.match(source, /contactCapturedThisTurn && \(!nextAction \|\| nextAction.type === "none"\)/);
  assert.match(source, /nextAction.type !== "none" && nextAction.type !== "whatsapp"/);
});
test("content-free request events are emitted from both successful persistence branches", async () => {
  const source = await readFile(path.join(root, "src/services/leads.ts"), "utf8");
  assert.match(source, /recordTurnOutcome\(fallbackProducts\)/);
  assert.match(source, /recordTurnOutcome\(products\)/);
  assert.match(source, /"quote_requested"/);
  assert.match(source, /"visit_requested"/);
  assert.match(source, /"appointment_requested"/);
});

for (const [message, expected] of [
  ["Quero o Produto A", "purchase"],
  ["Fico com o Produto A", "purchase"],
  ["Pode ser o Produto A", "purchase"],
  ["Quero saber mais sobre Produto A", "information"],
  ["Quero saber como comprar Produto A", "information"],
  ["Quero o Produto Inventado", "information"],
  ["Quero o Produto A ou Produto B", "information"],
  ["Não quero comprar, só comparar Produto A e Produto B", "compare"],
  ["Só comparar Produto A e Produto B, não quero comprar", "compare"],
  ["Não quero comprar e quero comparar Produto A e Produto B", "compare"],
  ["Não quero comparar, mas quero comprar Produto A", "purchase"],
  ["Quero comprar Produto A, mas só vou pesquisar", "research"],
  ["Não quero comprar", "disinterested"],
  ["Não quero o Produto A, quero o Produto B", "purchase"],
  ["Não quero continuar no WhatsApp", "disinterested"],
  ["Quero continuar no WhatsApp", "human"],
]) {
  test(`overlapping intent: ${message}`, () => {
    assert.equal(sales.commercialIntent(message, offerings.map((item) => item.name)), expected);
  });
}
for (const message of ["Quero o Produto A", "Fico com o Produto A", "Pode ser o Produto A"]) {
  test(`grounded commitment reaches checkout without requalification: ${message}`, () => {
    assert.equal(turn(message).action.type, "checkout");
    assert.deepEqual(chat.selectLeadChatProducts(offerings, message).map((item) => item.name), ["Produto A"]);
    assert.equal(chat.compactCommercialReply("Boa escolha. Qual o orçamento?", message, [], offerings.map((item) => item.name)), "Boa escolha.");
    assert.equal(sales.commercialIntent(message), "information");
  });
}
test("contrast selects the affirmative product and comparison remains actionable", () => {
  assert.deepEqual(chat.selectLeadChatProducts(offerings, "Não quero o Produto A, quero o Produto B").map((item) => item.name), ["Produto B"]);
  assert.deepEqual(turn("Não quero o Produto A, quero o Produto B").memory.interests.map((item) => item.value), ["Produto B"]);
  assert.equal(turn("Não quero comprar, só comparar Produto A e Produto B").action.type, "catalog");
});
test("explicit consented WhatsApp beats generic human handoff with capability gates", () => {
  const message = "Quero continuar no WhatsApp";
  const input = {
    memory: turn(message).memory, currentMessage: message,
    strategy: { availableActions: ["whatsapp", "owner_handoff"] },
    contactStatus: "consented", hasWhatsApp: true, hasCatalog: true,
    hasPaidOrder: false, hasPendingOrder: false,
  };
  assert.equal(sales.chooseNextAction(input).type, "whatsapp");
  assert.notEqual(sales.chooseNextAction({ ...input, contactStatus: "pending" }).type, "whatsapp");
  assert.notEqual(sales.chooseNextAction({ ...input, contactStatus: "declined" }).type, "whatsapp");
  assert.notEqual(sales.chooseNextAction({ ...input, hasWhatsApp: false }).type, "whatsapp");
  assert.notEqual(sales.chooseNextAction({ ...input, strategy: { availableActions: ["owner_handoff"] } }).type, "whatsapp");
  assert.equal(sales.chooseNextAction({ ...input, memory: { ...input.memory, humanControl: "owner" } }).type, "none");
});
test("the explicit WhatsApp action exposes the handoff card", async () => {
  const source = await readFile(path.join(root, "../ai-call-funnel/src/pages/Chat.tsx"), "utf8");
  assert.match(source, /nextAction\?\.type === "whatsapp" \|\|/);
  assert.match(source, /handoff=\{whatsappHandoff\}/);
});