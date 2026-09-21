import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspace = path.resolve(root, "../..");
const tempDir = await mkdtemp(path.join(os.tmpdir(), "contact-ad-preparation-"));

async function loadModule(source, name) {
  const outfile = path.join(tempDir, `${name}.mjs`);
  await build({ entryPoints: [path.join(root, source)], bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent" });
  return import(pathToFileURL(outfile).href);
}

const contact = await loadModule("src/lib/visitorContact.ts", "contact");
const preparation = await loadModule("src/lib/trafficCreativePreparation.ts", "preparation");
const canonical = await loadModule("src/lib/canonicalJson.ts", "canonical");
const grounding = await loadModule("src/lib/salesGrounding.ts", "grounding");
const chatSource = await readFile(path.join(workspace, "artifacts/ai-call-funnel/src/pages/Chat.tsx"), "utf8");
const leadSource = await readFile(path.join(root, "src/services/leads.ts"), "utf8");
const routeSource = await readFile(path.join(root, "src/routes/businessScoped.ts"), "utf8");
const visitorAccessSource = await readFile(path.join(workspace, "artifacts/ai-call-funnel/src/lib/visitorAccess.ts"), "utf8");
process.on("exit", () => void rm(tempDir, { recursive: true, force: true }));

test("normal chat recognises an Angolan WhatsApp response and refusal", () => {
  assert.equal(contact.extractAngolanMobilePhone("O meu WhatsApp é 924 000 171"), "+244924000171");
  assert.equal(contact.extractAngolanMobilePhone("Pode usar +244 923-456-789"), "+244923456789");
  assert.equal(contact.extractAngolanMobilePhone("não tenho"), null);
  assert.equal(contact.isContactRefusal("Agora não, prefiro continuar por aqui"), true);
  assert.equal(contact.isContactRefusal("Não quero partilhar o 923 456 789"), true);
  assert.equal(contact.isContactRefusal("Quero continuar a conversa"), false);
  assert.doesNotMatch(contact.redactAngolanPhoneCandidates("924000171"), /924000171/);
});

test("creative preparation approves ad facts and requests promised media without exposing phones", () => {
  const description = [
    "T3 no Zango 3, Luanda",
    "Preço: 17.000.000 Kz – Negociável",
    "Liga agora: 924000171",
    "Interessado chama no WhatsApp, mando fotos e vídeo da casa.",
  ].join("\n");
  const prepared = preparation.prepareTrafficCreativeDescription(description, "image", 1);
  assert.equal(prepared.objective, "visit_request");
  assert.deepEqual(prepared.approvedPrices, ["17.000.000 Kz"]);
  assert.match(prepared.approvedFacts.join(" "), /Zango 3/);
  assert.doesNotMatch(prepared.approvedFacts.join(" "), /924000171/);
  assert.deepEqual(new Set(prepared.missingResources.map((item) => item.kind)), new Set(["image", "video"]));
  assert.equal(prepared.sourceHash, preparation.trafficCreativeSourceHash(description, "image"));
});

test("grounding accepts only the price prepared for this ad", () => {
  const result = grounding.sanitizeGroundedText(
    "O preço é 17.000.000 Kz, não 99.000.000 Kz.",
    { approvedPrices: ["17.000.000 Kz"] },
  );
  assert.match(result, /17\.000\.000 Kz/);
  assert.doesNotMatch(result, /99\.000\.000 Kz/);
});

test("strategy and preparation comparisons are stable across jsonb key order", () => {
  assert.equal(canonical.structurallyEqualJson(
    { objective: "visit", facts: { price: 17, place: "Zango" } },
    { facts: { place: "Zango", price: 17 }, objective: "visit" },
  ), true);
});

test("public UI has no phone form and chat response refreshes contact state", () => {
  assert.doesNotMatch(chatSource, /function ContactCaptureCard/);
  assert.doesNotMatch(chatSource, /Compartilha o seu número comigo/);
  assert.match(chatSource, /applyContactResult/);
  assert.match(routeSource, /whatsappHandoff: current \? visitorWhatsAppHandoff/);
  assert.match(leadSource, /contactWasRequested\(lead\)/);
  assert.match(leadSource, /const refusedContact = requestedContact && isContactRefusal\(userMessage\)/);
  assert.match(leadSource, /requestedContact && !refusedContact \? extractAngolanMobilePhone/);
  assert.match(leadSource, /contactRequested: shouldRequestContact/);
  assert.doesNotMatch(leadSource, /function botRequestsWhatsApp/);
  assert.match(leadSource, /explicitlyRequestedProducts\.length > 0/);
  assert.match(leadSource, /eq\(leadsTable\.contactConsentStatus, "pending"\)/);
  assert.doesNotMatch(leadSource.match(/function contactWasRequested[\\s\\S]*?\\n\\}/)?.[0] ?? "", /pendingAction|escalationReason/);
  assert.match(routeSource, /safeChatMessages[\s\S]*redactAngolanPhoneCandidates/);
  assert.match(routeSource, /chatMessages: lead\.chatMessages\.map/);
  assert.match(leadSource, /O número foi guardado pela aplicação e não é enviado ao modelo/);
  assert.match(visitorAccessSource, /const access = requireAccess[\s\S]*for \(let attempt = 0;/);
  assert.match(visitorAccessSource, /body: JSON\.stringify\(\{ message, requestId \}\)/);
});