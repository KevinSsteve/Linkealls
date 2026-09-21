import assert from "node:assert/strict";
import test, { after } from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = await mkdtemp(path.join(os.tmpdir(), "linkealls-sales-grounding-"));
const outfile = path.join(dir, "sales-grounding.mjs");
await build({
  entryPoints: [path.join(root, "src/lib/salesGrounding.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile,
  logLevel: "silent",
});
const { sanitizeGroundedText } = await import(pathToFileURL(outfile).href);
after(() => rm(dir, { recursive: true, force: true }));

test("unsupported handoff claims are not repeated as completed actions", () => {
  const result = sanitizeGroundedText("Já pedi à equipa para enviar o vídeo. A equipa vai enviar amanhã.");
  assert.doesNotMatch(result, /já pedi|vai enviar|encaminhar/i);
  assert.match(result, /Não tenho essa confirmação no contexto/);
});