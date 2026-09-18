import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiServerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (relativePath) => readFile(path.join(apiServerDir, relativePath), "utf8");

test("onboarding business analysis requires the local cookie session without handle or PIN", async () => {
  const route = await source("src/routes/businessAnalysis.ts");
  assert.match(route, /getUserByToken\(requestToken\(req\)\)/);
  assert.match(route, /AUTH_REQUIRED/);
  assert.doesNotMatch(route, /isReplitAuthenticated|hasRecentSensitiveAuth|user\.handle/);
});

test("onboarding analysis validates its discriminated inputs and image bytes", async () => {
  const route = await source("src/routes/businessAnalysis.ts");
  assert.match(route, /z\.discriminatedUnion\("mode"/);
  assert.match(route, /3 \* 1024 \* 1024/);
  assert.match(route, /89504e470d0a1a0a/);
  assert.match(route, /image\/jpeg.*image\/png.*image\/webp/s);
  assert.match(route, /description = z\.string\(\)\.trim\(\)\.min\(20\)\.max\(6000\)/);
});

test("draft analysis is bounded, concurrent-safe, and never writes a profile", async () => {
  const [route, analysis] = await Promise.all([
    source("src/routes/businessAnalysis.ts"),
    source("src/services/siteAnalysis.ts"),
  ]);
  const draftFunction = analysis.slice(
    analysis.indexOf("export async function analyzeSiteDraft"),
    analysis.indexOf("/** Extracts a draft from an in-memory image"),
  );
  assert.match(route, /REQUEST_TIMEOUT_MS = 82_000/);
  assert.match(route, /inFlightUsers\.add\(user\.id\)/);
  assert.match(route, /finally\s*\{\s*inFlightUsers\.delete\(user\.id\)/);
  assert.match(route, /consumeSharedRateLimit/);
  assert.doesNotMatch(draftFunction, /updateProfile|setAnalysisStatus|tryAcquireAnalysis|db\./);
});

test("image extraction is transient and uses structured multimodal output", async () => {
  const analysis = await source("src/services/siteAnalysis.ts");
  const imageFunction = analysis.slice(
    analysis.indexOf("export async function assistFromImage"),
    analysis.indexOf("// ─── Public API"),
  );
  assert.match(imageFunction, /inlineData/);
  assert.match(imageFunction, /PROFILE_RESPONSE_SCHEMA/);
  assert.match(imageFunction, /Não inventes factos, preços, contactos/);
  assert.doesNotMatch(imageFunction, /db\.|object|storage|writeFile/);
});

test("site crawl deadline covers DNS, redirects, headers, and response bodies", async () => {
  const analysis = await source("src/services/siteAnalysis.ts");
  assert.match(analysis, /CRAWL_TIMEOUT_MS = 30_000/);
  assert.match(analysis, /Promise\.race\(\[\s*lookup\(/);
  assert.match(analysis, /return \{ response: res, release \}/);
  assert.match(analysis, /return await readBodyCapped\(fetched\.response\)/);
  assert.match(analysis, /finally \{\s*await fetched\?\.response\.body\?\.cancel/);
  assert.match(analysis, /collectSiteContent\(url, crawlDeadline\)/);
});