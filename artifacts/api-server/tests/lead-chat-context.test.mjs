import assert from "node:assert/strict";
import test, { after } from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = await mkdtemp(path.join(os.tmpdir(), "linkealls-chat-context-"));
const modulePath = path.join(tempDir, "lead-chat-context.mjs");
await build({
  entryPoints: [path.join(artifactDir, "src/lib/leadChatContext.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: modulePath,
  logLevel: "silent",
});
const { buildLeadChatContext, selectLeadChatProducts } = await import(pathToFileURL(modulePath).href);
after(async () => rm(tempDir, { recursive: true, force: true }));

test("trusted traffic description and real catalog reach the production chat prompt", () => {
  const offerings = [
    { name: "Gerador Solar", description: "Energia para casa", price: "150 000 Kz", imageUrl: "/solar.webp" },
    { name: "Bateria", description: "Reserva de energia", price: "80 000 Kz" },
  ];
  const { systemInstruction, prompt } = buildLeadChatContext(
    {
      origin: {
        trafficCreative: {
          slug: "solar-image-a",
          description: "Promoção do gerador solar para residências",
          mediaType: "image",
        },
      },
      chatMessages: [{ role: "user", text: "Vi o anúncio" }],
      callTranscript: null,
    },
    {
      name: "Energia Angola",
      toneOfVoice: "directo",
      sector: "Energia",
      description: "Soluções solares",
      targetAudience: "Famílias",
      differentials: ["Instalação"],
      offerings,
      faq: [],
    },
    [{
      offeringName: "Gerador Solar",
      amount: 150000,
      buyerPhone: "923000000",
      status: "paga",
      fulfillmentStatus: "em_preparacao",
      paidAt: new Date("2026-09-19T10:00:00Z"),
    }],
    "Quero comprar o gerador",
  );

  assert.match(systemInstruction, /CONTEXTO DE AQUISIÇÃO \(validado pela Linkealls\)/);
  assert.match(systemInstruction, /Promoção do gerador solar para residências/);
  assert.match(systemInstruction, /Gerador Solar: Energia para casa \(150 000 Kz\)/);
  assert.match(systemInstruction, /pagamento: paga, estado operacional: em preparação/);
  assert.match(prompt, /Cliente: Vi o anúncio/);
  assert.match(prompt, /Cliente: Quero comprar o gerador/);

  assert.deepEqual(selectLeadChatProducts(offerings, "Quero comprar o gerador"), [offerings[0]]);
});