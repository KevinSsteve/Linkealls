import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const leadId = "11111111-1111-4111-8111-111111111111";
const otherLeadId = "33333333-3333-4333-8333-333333333333";
const orderId = "22222222-2222-4222-8222-222222222222";
const otherOrderId = "44444444-4444-4444-8444-444444444444";

async function bundle(entryPoint, options = {}) {
  const result = await build({
    entryPoints: [path.join(root, entryPoint)],
    bundle: true, platform: "node", format: "esm", write: false,
    ...options,
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

const caps = await bundle("artifacts/api-server/src/lib/visitorCapabilities.ts");
const protocol = await bundle("artifacts/api-server/src/lib/callFunnelProtocol.ts");
const mocks = `
import { EventEmitter } from "node:events";
export class WebSocket { static OPEN = 1; }
export class WebSocketServer extends EventEmitter {
  constructor() { super(); globalThis.__visitorVoiceTest.wss = this; }
  handleUpgrade(req, socket, head, cb) { cb(socket.ws); }
}
export const logger = { info() {}, error() {} };
export const clientIp = () => "test-ip";
export const isAllowedBrowserOrigin = () => true;
export const getProfileBySlug = async () => {
  const s = globalThis.__visitorVoiceTest;
  if (s.configGate) await s.configGate;
  return { id: 7, name: "Test tenant", offerings: [] };
};
export const buildCallAgentPrompt = () => ({ systemPrompt: "test", greetingText: "test" });
export const getLead = async (id, businessId) => {
  const s = globalThis.__visitorVoiceTest;
  s.leadReads++;
  return !s.deleted && id === "${leadId}" && businessId === 7 ? { id } : null;
};
export const updateLeadOnCallStart = async () => { globalThis.__visitorVoiceTest.leadStarts++; };
export const processCallCompletion = async () => { globalThis.__visitorVoiceTest.completions++; };
export const createGeminiLiveSession = async (config, callbacks) => {
  const s = globalThis.__visitorVoiceTest;
  s.providerStarts++;
  s.callbacks = callbacks;
  return { close() {}, sendGreeting() {}, sendAudio() {}, sendText(text) { s.texts.push(text); } };
};
export const createProductOrder = async (businessId, input) => {
  const s = globalThis.__visitorVoiceTest;
  s.orderCreates.push({ businessId, input });
  return { order: s.order, simulated: false };
};
export const getOrderPublicStatus = async (id) => {
  const s = globalThis.__visitorVoiceTest;
  s.orderReads.push(id);
  return s.order;
};
`;
const relay = await bundle("artifacts/api-server/src/routes/callFunnelWs.ts", {
  plugins: [{
    name: "offline-voice-dependencies",
    setup(b) {
      b.onResolve({ filter: /^(ws)$|\/(geminiLive|businessProfile|leads|payments|logger|httpSecurity)\.js$/ },
        () => ({ path: "voice-test-dependencies", namespace: "fixture" }));
      b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: mocks, loader: "js" }));
    },
  }],
});

class Socket extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  messages = [];
  send(raw) { this.messages.push(JSON.parse(raw)); }
  close(code, reason) {
    this.closeCode = code;
    this.closeReason = reason;
    this.readyState = 3;
    this.emit("close");
  }
  receive(message) { this.emit("message", Buffer.from(JSON.stringify(message)), false); }
}

const settle = async () => {
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve));
};

function fixture(t) {
  const previousSecret = process.env.VISITOR_CAPABILITY_SECRET;
  process.env.VISITOR_CAPABILITY_SECRET = "offline-visitor-voice-secret-at-least-32-bytes";
  const state = {
    leadReads: 0, leadStarts: 0, providerStarts: 0, completions: 0,
    orderCreates: [], orderReads: [], texts: [],
    order: { id: orderId, businessId: 7, leadId, offeringName: "Product", amount: "1200", merchantTransactionId: "test-order", status: "pendente" },
  };
  globalThis.__visitorVoiceTest = state;
  const server = new EventEmitter();
  relay.setupCallFunnelWebSocket(server);
  const socket = new Socket();
  state.wss.emit("connection", socket, { url: "/api/call-funnel-ws?businessSlug=test-business", headers: {} });
  t.after(() => {
    socket.close();
    if (previousSecret === undefined) delete process.env.VISITOR_CAPABILITY_SECRET;
    else process.env.VISITOR_CAPABILITY_SECRET = previousSecret;
  });
  const authenticate = (token = caps.issueConversationCapability(7, leadId), id = leadId) =>
    socket.receive({ type: "authenticate", leadId: id, visitorToken: token });
  return { state, server, socket, authenticate };
}

test("voice protocol bounds and validates the first authentication frame", () => {
  const frame = { type: "authenticate", leadId, visitorToken: "v1.payload.signature" };
  assert.equal(protocol.parseCallClientMessage(JSON.stringify(frame)).ok, true);
  for (const invalid of [
    { ...frame, leadId: "not-a-uuid" }, { ...frame, visitorToken: "" },
    { ...frame, visitorToken: `v1.${"a".repeat(2048)}.sig` },
    { ...frame, visitorToken: 123 },
  ]) assert.equal(protocol.parseCallClientMessage(JSON.stringify(invalid)).ok, false);
});

test("connecting without a capability causes no provider or lead side effects", async (t) => {
  const { state, socket } = fixture(t);
  await settle();
  assert.equal(state.providerStarts, 0);
  assert.equal(state.leadReads, 0);
  socket.receive({ type: "user_text", text: "hello" });
  assert.equal(socket.closeCode, 1008);
  assert.equal(state.leadStarts, 0);
});

test("forged, expired, wrong-tenant and wrong-lead tokens never start a call", async (t) => {
  for (const kind of ["forged", "expired", "tenant", "lead", "deleted"]) {
    await t.test(kind, async (t) => {
      const { state, socket, authenticate } = fixture(t);
      let token;
      if (kind === "expired") {
        const realNow = Date.now;
        try {
          Date.now = () => realNow() - 8 * 24 * 60 * 60 * 1000;
          token = caps.issueConversationCapability(7, leadId);
        } finally { Date.now = realNow; }
      } else {
        token = caps.issueConversationCapability(kind === "tenant" ? 8 : 7, kind === "lead" ? otherLeadId : leadId);
      }
      if (kind === "forged") token += "x";
      if (kind === "deleted") state.deleted = true;
      authenticate(token);
      await settle();
      assert.equal(socket.closeCode, 1008);
      assert.equal(state.providerStarts, 0);
      assert.equal(state.leadStarts, 0);
      assert.equal(state.completions, 0);
    });
  }
});

test("valid authentication starts exactly one scoped call; replay does not start another", async (t) => {
  const { state, socket, authenticate } = fixture(t);
  authenticate();
  await settle();
  assert.equal(state.leadStarts, 1);
  assert.equal(state.providerStarts, 1);
  assert.ok(socket.messages.some((message) => message.type === "ready"));
  authenticate();
  await settle();
  assert.equal(socket.closeCode, 1008);
  assert.equal(state.providerStarts, 1);
});

test("disconnect while tenant lookup is pending cannot start lead/provider work", async (t) => {
  const { state, socket, authenticate } = fixture(t);
  let release;
  state.configGate = new Promise((resolve) => { release = resolve; });
  authenticate();
  socket.close();
  release();
  await settle();
  assert.equal(state.leadStarts, 0);
  assert.equal(state.providerStarts, 0);
});

test("voice checkout emits a valid order capability; status hints use canonical scoped data", async (t) => {
  const { state, socket, authenticate } = fixture(t);
  authenticate();
  await settle();
  const responses = [];
  state.callbacks.onToolCall({
    name: "initiate_checkout",
    args: { product_name: "Product", phone: "923456789", quantity: 1 },
  }, (response) => responses.push(response));
  await settle();
  assert.equal(state.orderCreates[0].input.leadId, leadId);
  const checkout = socket.messages.find((message) => message.type === "checkout");
  assert.ok(checkout);
  caps.verifyVisitorCapability(checkout.visitorToken, { businessId: 7, leadId, orderId, scope: "order" });
  assert.equal(checkout.leadId, leadId);
  assert.equal(responses[0].status, "success");

  state.callbacks.onToolCall({ name: "check_order_status", args: { order_id: otherOrderId } }, (response) => responses.push(response));
  socket.receive({ type: "payment_result", orderId: otherOrderId, status: "paga" });
  await settle();
  assert.equal(state.orderReads.length, 0);
  assert.equal(responses.at(-1).status, "error");
  socket.receive({ type: "payment_result", orderId, status: "paga" });
  await settle();
  assert.equal(state.texts.length, 0, "pending order must not be described as paid");
  state.order.status = "falhada";
  socket.receive({ type: "payment_result", orderId, status: "paga", offeringName: "invented" });
  await settle();
  assert.match(state.texts[0], /Product.*falhado/);
  assert.doesNotMatch(state.texts[0], /invented|confirmado com sucesso/);
});

test("WS upgrade rejects all query credentials rather than accepting/logically using them", (t) => {
  const { server } = fixture(t);
  for (const key of ["visitorToken", "token", "leadId"]) {
    let response = "";
    const transport = { write(data) { response += data; }, destroy() {} };
    server.emit("upgrade", { url: `/api/call-funnel-ws?businessSlug=test-business&${key}=secret`, headers: {} }, transport, Buffer.alloc(0));
    assert.match(response, /400 Bad Request/);
  }
});

const browser = await bundle("artifacts/ai-call-funnel/src/services/callFunnelService.ts", {
  define: { "import.meta.env.DEV": "false", "import.meta.env.BASE_URL": '"/"' },
});
const storage = await bundle("artifacts/ai-call-funnel/src/lib/visitorAccess.ts", {
  define: { "import.meta.env.DEV": "false", "import.meta.env.BASE_URL": '"/"' },
});

test("browser authenticates in a frame and persists every voice order before invoking checkout", async (t) => {
  const originals = { window: globalThis.window, WebSocket: globalThis.WebSocket, sessionStorage: globalThis.sessionStorage, fetch: globalThis.fetch };
  t.after(() => Object.assign(globalThis, originals));
  const entries = new Map();
  globalThis.sessionStorage = { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
  globalThis.window = { location: { protocol: "https:", host: "test.invalid" } };
  let transport;
  globalThis.WebSocket = class {
    static OPEN = 1;
    readyState = 1;
    sent = [];
    constructor(url, protocols) { this.url = url; this.protocols = protocols; transport = this; }
    send(raw) { this.sent.push(JSON.parse(raw)); }
    close() {}
  };
  storage.saveVisitorAccess({ businessSlug: "test-business", leadId, visitorToken: "conversation-token" });
  const errors = [];
  const service = new browser.CallFunnelService({
    onError: (message) => errors.push(message), onClose() {}, onReady() {},
    onCheckout(info) {
      assert.equal(storage.loadVisitorAccess("test-business", leadId, info.orderId).visitorToken, info.visitorToken);
    },
  });
  service.connect(leadId, "test-business");
  assert.equal(transport.protocols, undefined);
  assert.equal(transport.url, "wss://test.invalid/api/call-funnel-ws?businessSlug=test-business");
  transport.onopen();
  assert.deepEqual(transport.sent[0], { type: "authenticate", leadId, visitorToken: "conversation-token" });
  for (const id of [orderId, otherOrderId]) {
    transport.onmessage({ data: JSON.stringify({ type: "checkout", orderId: id, leadId, visitorToken: `order-token-${id}` }) });
  }
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    return { ok: true, json: async () => ({ status: "pendente" }) };
  };
  for (const id of [orderId, otherOrderId]) {
    await storage.visitorApi("test-business").getOrderStatus(id, leadId);
    assert.equal(requests.at(-1).init.headers.Authorization, `Visitor order-token-${id}`);
    assert.equal(requests.at(-1).init.credentials, "omit");
    assert.doesNotMatch(requests.at(-1).url, /token|leadId=|\?/);
  }
  await storage.visitorApi("test-business").requestOrderProofUrl(orderId, leadId, {
    name: "proof.png", size: 100, type: "image/png",
  });
  assert.equal(requests.at(-1).init.headers.Authorization, `Visitor order-token-${orderId}`);
  await storage.visitorApi("test-business").submitOrderProof(orderId, leadId, "/objects/order-proofs/test");
  assert.equal(requests.at(-1).init.headers.Authorization, `Visitor order-token-${orderId}`);
  const requestCount = requests.length;
  await assert.rejects(
    storage.visitorApi("unknown-business").getOrderStatus(orderId, leadId),
    /sessão de visitante expirou/,
  );
  assert.equal(requests.length, requestCount, "missing capabilities must reject before HTTP");
  assert.deepEqual(errors, []);
});

test("visitor capability remains usable in-memory when browser storage is blocked", async (t) => {
  const previous = globalThis.sessionStorage;
  t.after(() => { globalThis.sessionStorage = previous; });
  globalThis.sessionStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  const access = { businessSlug: "private-mode", leadId, visitorToken: "in-memory-token" };
  storage.saveVisitorAccess(access);
  assert.deepEqual(storage.loadVisitorAccess("private-mode", leadId), access);
  assert.deepEqual(storage.loadCurrentVisitorAccess("private-mode"), access);
});

test("visitor pages cannot accidentally use cookie-only legacy API helpers or URL credentials", async () => {
  const api = await readFile(path.join(root, "artifacts/ai-call-funnel/src/lib/api.ts"), "utf8");
  assert.doesNotMatch(api, /createLeadSession:|getLeadSession:|sendLeadChat:|createOrder:|getOrderStatus:|getOrderTracking:|requestOrderProofUrl:|submitOrderProof:/);
  assert.doesNotMatch(api, /\?leadId=/);
  for (const file of ["pages/Chat.tsx", "pages/Captacao.tsx", "components/BuyModal.tsx", "components/InlineCheckout.tsx", "components/OrderProofUpload.tsx"]) {
    const source = await readFile(path.join(root, "artifacts/ai-call-funnel/src", file), "utf8");
    assert.match(source, /import.*visitorApi.*from.*visitorAccess/);
    assert.doesNotMatch(source, /\?leadId=|[?&]visitorToken=/);
  }
});