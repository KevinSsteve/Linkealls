import assert from "node:assert/strict";
import test from "node:test";

const security = await import(process.env.HTTP_SECURITY_TEST_MODULE);

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