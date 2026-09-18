import assert from "node:assert/strict";
import test from "node:test";

const security = await import(process.env.HTTP_SECURITY_TEST_MODULE);
const pinSecurity = await import(process.env.PIN_SECURITY_TEST_MODULE);

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; },
  };
}

test("cookie CSRF guard rejects a cross-origin state-changing request", () => {
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const req = {
    method: "POST",
    cookies: { linkealls_session: "opaque-session" },
    headers: { origin: "https://attacker.invalid" },
  };
  const res = responseRecorder();
  let continued = false;
  security.enforceCookieCsrf(req, res, () => { continued = true; });
  process.env.NODE_ENV = previousEnv;
  assert.equal(continued, false);
  assert.equal(res.statusCode, 403);
});

test("cookie CSRF guard preserves same-origin writes, public callbacks, and SSE reads", () => {
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    for (const req of [
      {
        method: "POST",
        cookies: { linkealls_session: "opaque-session" },
        headers: { origin: "https://app.linkealls.com" },
      },
      {
        method: "POST",
        cookies: {},
        headers: {},
      },
      {
        method: "GET",
        cookies: { linkealls_session: "opaque-session" },
        headers: {},
      },
    ]) {
      const res = responseRecorder();
      let continued = false;
      security.enforceCookieCsrf(req, res, () => { continued = true; });
      assert.equal(continued, true);
      assert.equal(res.statusCode, 200);
    }
  } finally {
    process.env.NODE_ENV = previousEnv;
  }
});

test("local session extraction cannot use browser bearer or URL values", () => {
  assert.equal(security.getLocalSessionToken({ cookies: { linkealls_session: "cookie-token" } }), "cookie-token");
  assert.equal(
    security.getLocalSessionToken({
      cookies: {},
      headers: { authorization: "Bearer legacy-token" },
      query: { token: "url-token" },
    }),
    null,
  );
});

test("redirect return paths cannot escape the application origin", () => {
  assert.equal(security.isSafeInternalPath("/e/store/dono"), true);
  assert.equal(security.isSafeInternalPath("//attacker.invalid"), false);
  assert.equal(security.isSafeInternalPath("/\\attacker.invalid"), false);
  assert.equal(security.isSafeInternalPath("https://attacker.invalid"), false);
});

test("PIN verification rejects malformed or attacker-controlled scrypt parameters", async () => {
  const malformed = [
    "scrypt$16384$8$1$not-hex$also-not-hex",
    `scrypt$32768$8$1$${"00".repeat(16)}$${"00".repeat(32)}`,
    `scrypt$16384$8$1$${"00".repeat(16)}$${"00".repeat(32)}$extra`,
    `scrypt$16384$8$1$${"00".repeat(15)}$${"00".repeat(32)}`,
    `scrypt$16384$8$1$${"00".repeat(16)}$${"00".repeat(31)}zz`,
  ];
  for (const storedHash of malformed) {
    assert.deepEqual(
      await pinSecurity.verifyPin("1234", storedHash),
      { valid: false, needsUpgrade: false },
    );
  }
});

test("new scrypt PIN hashes still verify without requiring an upgrade", async () => {
  const storedHash = await pinSecurity.hashPin("1234");
  assert.deepEqual(
    await pinSecurity.verifyPin("1234", storedHash),
    { valid: true, needsUpgrade: false },
  );
});