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
export { visitorApi, loadCurrentVisitorAccess } from ${JSON.stringify(path.join(artifactDir, "src/lib/visitorAccess.ts"))};
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
}

test("public traffic CTA restores the same lead for chat, catalog order and tracking", async () => {
  installSessionStorage();
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
    assert.equal(request.headers.Authorization, "Visitor signed-visitor-token");
    if (request.url.endsWith("/leads/lead-contextual-1/session")) {
      return json(200, {
        leadId: "lead-contextual-1",
        chatMessages: [],
        createdAt: "2026-09-19T10:00:00.000Z",
        updatedAt: "2026-09-19T10:00:00.000Z",
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
  assert.equal(target, "/ai-call-funnel/e/owner?message=Quero%20saber%20mais%20sobre%20isto");
  assert.equal(createdLeads, 1);

  const restored = await restoreTrafficConversation("owner");
  assert.equal(restored.access.leadId, "lead-contextual-1");
  assert.equal(restored.session.leadId, "lead-contextual-1");

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
});

test("the rendered CTA and Chat restoration use the executable browser transition", async () => {
  const [publicTraffic, chat] = await Promise.all([
    readFile(path.join(artifactDir, "src/pages/PublicTraffic.tsx"), "utf8"),
    readFile(path.join(artifactDir, "src/pages/Chat.tsx"), "utf8"),
  ]);
  assert.match(publicTraffic, /onClick=\{startConversation\}/);
  assert.match(publicTraffic, /await startTrafficConversation\(businessSlug, creative, window\.location\)/);
  assert.match(publicTraffic, /window\.location\.assign\(target\)/);
  assert.match(chat, /restoreTrafficConversation\(businessSlug\)/);
  assert.match(chat, /setLeadId\(restoredAccess\.leadId\)/);
});