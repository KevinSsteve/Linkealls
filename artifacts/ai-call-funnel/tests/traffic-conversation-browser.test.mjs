import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { build } = createRequire(new URL("../../api-server/package.json", import.meta.url))("esbuild");
const tempDir = await mkdtemp(path.join(os.tmpdir(), "linkealls-browser-traffic-"));
const entryPath = path.join(tempDir, "entry.ts");
const modulePath = path.join(tempDir, "browser-flow.mjs");

await writeFile(entryPath, `
export * from ${JSON.stringify(path.join(artifactDir, "src/lib/trafficConversation.ts"))};
export { visitorApi, loadCurrentVisitorAccess, clearVisitorAccess } from ${JSON.stringify(path.join(artifactDir, "src/lib/visitorAccess.ts"))};
`, "utf8");
await build({
  entryPoints: [entryPath],
  bundle: true,
  format: "esm",
  platform: "browser",
  outfile: modulePath,
  logLevel: "silent",
  define: {
    "import.meta.env.DEV": "true",
    "import.meta.env.BASE_URL": '"/ai-call-funnel/"',
  },
});
const {
  startTrafficConversation,
  restoreTrafficConversation,
  visitorApi,
  loadCurrentVisitorAccess,
  clearVisitorAccess,
} = await import(pathToFileURL(modulePath).href);
after(async () => rm(tempDir, { recursive: true, force: true }));

function installSessionStorage() {
  const values = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
  return values;
}

function installLocalStorage() {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
  return values;
}

test("public traffic CTA restores the same lead for chat, catalog order and tracking", async () => {
  const sessionValues = installSessionStorage();
  const localValues = installLocalStorage();
  const requests = [];
  let createdLeads = 0;
  globalThis.fetch = async (url, init = {}) => {
    const request = { url: String(url), method: init.method ?? "GET", headers: init.headers ?? {}, body: init.body };
    requests.push(request);
    const json = (status, body) => new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
    if (request.url.endsWith("/leads/session") && request.method === "POST") {
      createdLeads += 1;
      const body = JSON.parse(request.body);
      assert.match(body.trafficClickKey, /^[0-9a-f-]{36}$/i);
      assert.deepEqual(body.origin, {
        source: "meta",
        medium: "paid-social",
        campaign: "september",
        content: "image-a",
        term: "catalog",
        url: "https://linkealls.test/t/owner/image-link?utm_source=meta&utm_medium=paid-social&utm_campaign=september&utm_content=image-a&utm_term=catalog",
        trafficCreativeSlug: "image-link",
      });
      return json(201, { leadId: "lead-contextual-1", visitorToken: "signed-visitor-token" });
    }
    if (request.url.endsWith("/leads/recovery") && request.method === "POST") {
      return createdLeads > 0
        ? json(200, { leadId: "lead-contextual-1", visitorToken: "rotated-visitor-token" })
        : json(404, { error: "not found" });
    }
    assert.match(request.headers.Authorization, /^Visitor (signed|rotated)-visitor-token$/);
    if (request.url.endsWith("/leads/lead-contextual-1/session")) {
      return json(200, {
        leadId: "lead-contextual-1",
        chatMessages: [],
        trafficCreative: {
          id: "creative-1",
          slug: "image-link",
          description: "Anúncio real",
          mediaType: "image",
          mediaMimeType: "image/webp",
          mediaUrl: "/api/storage/public/creative.webp",
        },
        trafficWelcomeStatus: "pending",
        createdAt: "2026-09-19T10:00:00.000Z",
        updatedAt: "2026-09-19T10:00:00.000Z",
      });
    }
    if (request.url.endsWith("/leads/lead-contextual-1/traffic-welcome")) {
      return json(200, {
        started: true,
        status: "complete",
        reply: "Olá, como posso ajudar?",
      });
    }
    if (request.url.endsWith("/leads/lead-contextual-1/chat")) {
      return json(200, {
        reply: "Temos este produto.",
        products: [{ name: "Produto real", price: "1000 Kz", description: "Do catálogo" }],
      });
    }
    if (request.url.endsWith("/orders")) {
      const body = JSON.parse(request.body);
      assert.equal(body.leadId, "lead-contextual-1");
      return json(201, {
        orderId: "order-1",
        leadId: "lead-contextual-1",
        visitorToken: "signed-visitor-token",
        merchantTransactionId: "merchant-1",
        amount: 1000,
        status: "pendente",
        simulated: true,
      });
    }
    if (request.url.endsWith("/orders/order-1/tracking")) {
      return json(200, { tracking: { orderId: "order-1", status: "pendente" } });
    }
    return json(404, { error: "unexpected request" });
  };

  const location = {
    search: "?utm_source=meta&utm_medium=paid-social&utm_campaign=september&utm_content=image-a&utm_term=catalog",
    href: "https://linkealls.test/t/owner/image-link?utm_source=meta&utm_medium=paid-social&utm_campaign=september&utm_content=image-a&utm_term=catalog",
  };
  const target = await startTrafficConversation("owner", { slug: "image-link" }, location);
  assert.equal(target, "/ai-call-funnel/e/owner");
  assert.equal(createdLeads, 1);
  const pendingClickRecord = [...localValues.entries()]
    .find(([key]) => key.startsWith("linkealls:traffic-click:"));
  assert.ok(pendingClickRecord, "the cross-tab coordination record should settle briefly");
  assert.ok(
    JSON.parse(pendingClickRecord[1]).expiresAt <= Date.now() + 2_500,
    "the coordination record must expire within seconds",
  );
  assert.equal(
    requests.filter((request) => request.url.endsWith("/leads/lead-contextual-1/chat")).length,
    0,
    "opening the chat must not wait for the AI endpoint",
  );

  const restored = await restoreTrafficConversation("owner");
  assert.equal(restored.access.leadId, "lead-contextual-1");
  assert.equal(restored.session.leadId, "lead-contextual-1");

  const welcome = await visitorApi("owner").startTrafficWelcome("lead-contextual-1");
  assert.equal(welcome.status, "complete");
  const chat = await visitorApi("owner").sendLeadChat("lead-contextual-1", "Quero ver produtos");
  assert.equal(chat.products[0].name, "Produto real");
  const order = await visitorApi("owner").createOrder({
    offeringName: "Produto real",
    quantity: 1,
    phone: "923000000",
    leadId: "lead-contextual-1",
  });
  await visitorApi("owner").getOrderTracking(order.orderId, order.leadId);

  assert.equal(createdLeads, 1, "browser handoff, chat and checkout must preserve one lead");
  assert.equal(loadCurrentVisitorAccess("owner").leadId, "lead-contextual-1");
  assert.equal(requests.filter((request) => request.url.endsWith("/leads/session")).length, 1);

  clearVisitorAccess("owner");
  assert.equal(loadCurrentVisitorAccess("owner"), null);
  const reopened = await restoreTrafficConversation("owner");
  assert.equal(reopened.access.visitorToken, "rotated-visitor-token");
  assert.equal(reopened.session.trafficCreative.slug, "image-link");
  assert.equal(createdLeads, 1, "browser recovery must not create another lead");
});

test("concurrent tabs share a short-lived click key when Web Locks are unavailable", async () => {
  installSessionStorage();
  const localValues = installLocalStorage();
  const createdByKey = new Map();
  const submittedKeys = [];
  globalThis.fetch = async (url, init = {}) => {
    const requestUrl = String(url);
    const method = init.method ?? "GET";
    const json = (status, body) => new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
    if (requestUrl.endsWith("/leads/recovery") && method === "POST") {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return json(404, { error: "not found" });
    }
    if (requestUrl.endsWith("/leads/session") && method === "POST") {
      const body = JSON.parse(init.body);
      submittedKeys.push(body.trafficClickKey);
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (!createdByKey.has(body.trafficClickKey)) {
        createdByKey.set(body.trafficClickKey, `lead-${createdByKey.size + 1}`);
      }
      return json(201, {
        leadId: createdByKey.get(body.trafficClickKey),
        visitorToken: `token-${body.trafficClickKey}`,
      });
    }
    return json(404, { error: "unexpected request" });
  };

  const location = {
    search: "?utm_source=meta",
    href: "https://linkealls.test/e/fallback/t/shared-link?utm_source=meta",
  };
  const [first, second] = await Promise.all([
    startTrafficConversation("fallback", { slug: "shared-link" }, location),
    startTrafficConversation("fallback", { slug: "shared-link" }, location),
  ]);

  assert.equal(first, "/ai-call-funnel/e/fallback");
  assert.equal(second, first);
  assert.equal(new Set(submittedKeys).size, 1);
  assert.equal(createdByKey.size, 1);
  const pendingClickRecord = [...localValues.entries()]
    .find(([key]) => key.startsWith("linkealls:traffic-click:"));
  assert.ok(pendingClickRecord);
  assert.ok(JSON.parse(pendingClickRecord[1]).expiresAt <= Date.now() + 2_500);
});

test("the public traffic route starts automatically and Chat restores the contextual conversation", async () => {
  const [publicTraffic, chat] = await Promise.all([
    readFile(path.join(artifactDir, "src/pages/PublicTraffic.tsx"), "utf8"),
    readFile(path.join(artifactDir, "src/pages/Chat.tsx"), "utf8"),
  ]);
  assert.doesNotMatch(publicTraffic, /Falar com o assistente/);
  assert.match(publicTraffic, /startTrafficConversation\(businessSlug, creative, window\.location\)/);
  assert.match(publicTraffic, /\.then\(\(target\) => window\.location\.assign\(target\)\)/);
  assert.match(chat, /restoreTrafficConversation\(businessSlug\)/);
  assert.match(chat, /setLeadId\(access\.leadId\)/);
  assert.match(chat, /TrafficCreativeCard/);
  assert.match(chat, /startTrafficWelcome/);
  assert.match(chat, /endLeadSession/);
});