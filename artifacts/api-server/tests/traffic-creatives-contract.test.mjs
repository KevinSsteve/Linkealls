import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiServerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbDir = path.resolve(apiServerDir, "../..", "lib/db");
const webDir = path.resolve(apiServerDir, "../ai-call-funnel");

test("traffic creative storage and schema are isolated from legacy paid campaigns", async () => {
  const storage = await readFile(path.join(apiServerDir, "src/routes/storage.ts"), "utf8");
  const schema = await readFile(path.join(dbDir, "src/schema/trafficCreatives.ts"), "utf8");
  const migration = await readFile(path.join(dbDir, "migrations/0014_add_traffic_creatives.sql"), "utf8");

  assert.match(storage, /traffic_creative/);
  assert.match(storage, /traffic-creatives\/\$\{parsed\.data\.businessSlug\}/);
  assert.match(storage, /video\/mp4/);
  assert.match(schema, /trafficCreativesTable/);
  assert.match(schema, /publicSlug: text\("public_slug"\)\.notNull\(\)\.unique\(\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "traffic_creatives"/);
  assert.doesNotMatch(migration, /campaigns/);
});

test("public traffic creative routes resolve server-owned context and visitor sessions validate the slug", async () => {
  const routes = await readFile(path.join(apiServerDir, "src/routes/businessScoped.ts"), "utf8");
  const leads = await readFile(path.join(dbDir, "src/schema/leads.ts"), "utf8");
  const entry = await readFile(path.join(webDir, "src/pages/PublicTraffic.tsx"), "utf8");
  const transition = await readFile(path.join(webDir, "src/lib/trafficConversation.ts"), "utf8");
  const chat = await readFile(path.join(webDir, "src/pages/Chat.tsx"), "utf8");

  assert.match(routes, /router\.get\("\/traffic-creatives\/:creativeSlug\/public"/);
  assert.match(routes, /resolvePublicTrafficCreative\(bid\(res\), String\(req\.params\.creativeSlug\)\)/);
  assert.match(routes, /getTrafficCreativeBySlug\(bid\(res\), trafficCreativeSlug\)/);
  assert.match(routes, /publicTrafficCreativeContext\(creative\)/);
  assert.match(leads, /trafficCreativeSlug/);
  assert.match(leads, /trafficCreative\?:/);
  assert.match(entry, /startTrafficConversation\(businessSlug, creative, window\.location\)/);
  assert.match(transition, /trafficCreativeSlug: creative\.slug/);
  assert.match(chat, /isRestoringSession/);
  assert.match(chat, /disabled=\{isBusy \|\| isRestoringSession\}/);
});
