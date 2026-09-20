import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import { pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leads = await readFile(path.join(root, "src/services/leads.ts"), "utf8");
const sales = await readFile(path.join(root, "src/lib/openaiSales.ts"), "utf8");
const context = await readFile(path.join(root, "src/lib/leadChatContext.ts"), "utf8");
const voice = await readFile(path.join(root, "src/services/businessProfile.ts"), "utf8");
const tempDir = await mkdtemp(path.join(os.tmpdir(), "sales-grounding-"));
const groundingModule = path.join(tempDir, "grounding.mjs");
await build({ entryPoints: [path.join(root, "src/lib/salesGrounding.ts")], bundle: true, format: "esm", platform: "node", outfile: groundingModule, logLevel: "silent" });
const { sanitizeGroundedText } = await import(pathToFileURL(groundingModule).href);
process.on("exit", () => void rm(tempDir, { recursive: true, force: true }));

test("text sales uses managed Astra and strict validated decisions", () => {
  assert.match(sales, /gpt-6-astra/);
  assert.match(sales, /json_schema/);
  assert.match(sales, /decisionSchema\.safeParse/);
  assert.match(sales, /proposedAction/);
  assert.match(sales, /recommendedOfferings/);
  assert.match(leads, /chooseNextAction/);
  assert.match(leads, /availableActions\.includes/);
});

test("model failure fallback persists the same idempotent turn", () => {
  assert.match(leads, /if \(!generation\)/);
  assert.match(leads, /fallbackAppended/);
  assert.match(leads, /commercialMemory.*updatedMemory/);
  assert.match(leads, /eq\(leadsTable\.businessId, businessId\)/);
  assert.match(leads, /requestId: options\?\.requestId/);
});

test("provider failure completes the claimed traffic welcome atomically", () => {
  const fallback = leads.slice(
    leads.indexOf("if (!generation)"),
    leads.indexOf("const decision = generation.decision"),
  );
  assert.match(fallback, /eq\(leadsTable\.trafficWelcomeStatus, "processing"\)/);
  assert.match(fallback, /eq\(leadsTable\.trafficWelcomeClaimToken, options\.trafficWelcomeClaimToken\)/);
  assert.match(fallback, /trafficWelcomeStatus: "complete"/);
  assert.match(fallback, /trafficWelcomeClaimedAt: null/);
  assert.match(fallback, /trafficWelcomeClaimToken: null/);
  assert.match(fallback, /\.where\(fallbackGuardedWhere\)/);
});

test("prompt and voice policy refuse unsupported promises and consent-less WhatsApp", () => {
  assert.match(context, /Não prometas que o proprietário vai enviar fotos/);
  assert.match(context, /números de telefone/);
  assert.match(voice, /Antes de encaminhar para WhatsApp ou guardar o contacto/);
  assert.match(voice, /Nunca partilhes o WhatsApp do negócio como texto solto/);
});

test("grounding sanitizer removes untrusted phone, money and operational promises", () => {
  const result = sanitizeGroundedText(
    "Custa 999 000 Kz. O proprietário vai enviar fotos amanhã, há disponibilidade e damos garantia. Liga 923 123 456.",
    { approvedPrices: ["150 000 Kz"], approvedAvailability: ["paga entregue"] },
  );
  assert.doesNotMatch(result, /923\s*123\s*456/);
  assert.doesNotMatch(result, /999\s*000\s*Kz/);
  assert.match(result, /Não tenho essa confirmação|informação precisa de confirmação/);
  assert.match(result, /contacto protegido/);
});