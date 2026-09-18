import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiServerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendDir = path.resolve(apiServerDir, "../ai-call-funnel");
const dbDir = path.resolve(apiServerDir, "../../lib/db");

async function source(relativePath) {
  return readFile(path.join(apiServerDir, relativePath), "utf8");
}

test("local sessions expire, use HttpOnly cookies, and PIN attempts use the shared limiter", async () => {
  const [auth, users, security, limits] = await Promise.all([
    source("src/routes/userAuth.ts"),
    readFile(path.join(dbDir, "src/schema/users.ts"), "utf8"),
    source("src/lib/httpSecurity.ts"),
    source("src/lib/rateLimit.ts"),
  ]);

  assert.match(users, /sessionExpiresAt: timestamp\("session_expires_at"\)/);
  assert.match(auth, /gt\(usersTable\.sessionExpiresAt, new Date\(\)\)/);
  assert.match(auth, /router\.post\("\/user-auth\/login", loginRateLimit/);
  assert.match(auth, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(auth, /setLocalSessionCookie/);
  assert.match(auth, /consumeSharedRateLimit/);
  assert.match(security, /httpOnly: true/);
  assert.match(limits, /ON CONFLICT \(bucket_key\) DO UPDATE/);
});

test("high-impact operations require a recent confirmation of the existing business PIN", async () => {
  const [auth, scoped, payments, api] = await Promise.all([
    source("src/routes/userAuth.ts"),
    source("src/routes/businessScoped.ts"),
    source("src/routes/paymentsScoped.ts"),
    readFile(path.join(frontendDir, "src/lib/api.ts"), "utf8"),
  ]);

  assert.match(auth, /ownerPin: businessProfilesTable\.ownerPin/);
  assert.match(auth, /sensitiveAuthExpiresAt: timestamp|sensitiveAuthExpiresAt/);
  assert.match(auth, /router\.post\("\/user-auth\/reauthenticate"/);
  assert.match(auth, /SENSITIVE_AUTH_REQUIRED/);
  assert.match(scoped, /async function requireRecentReauth/);
  assert.match(scoped, /router\.put\("\/profile", requireOwner, requireRecentReauth/);
  assert.match(scoped, /router\.post\("\/campaigns\/:id\/publish", requireOwner, requireRecentReauth/);
  assert.match(payments, /router\.post\("\/wallet\/payouts", requireOwner, requireRecentReauth/);
  assert.match(auth, /router\.delete\("\/user-auth\/account"/);
  assert.match(api, /export async function confirmSensitiveAction/);
});

test("owner authorization is enforced server-side and stale browser sessions are revalidated", async () => {
  const [scoped, context, api] = await Promise.all([
    source("src/routes/businessScoped.ts"),
    readFile(path.join(frontendDir, "src/context/AuthContext.tsx"), "utf8"),
    readFile(path.join(frontendDir, "src/lib/api.ts"), "utf8"),
  ]);

  assert.match(scoped, /if \(!user\.handle \|\| user\.handle !== slug\)/);
  assert.match(context, /getCurrentUser\(\)/);
  assert.match(context, /isLoggedIn: !state\.isLoading && !!state\.user/);
  assert.match(api, /if \(res\.status === 401\) notifyAuthExpired\(\)/);
});

test("browser callers use cookies, erase legacy storage, and keep session values out of SSE URLs", async () => {
  const [context, api] = await Promise.all([
    readFile(path.join(frontendDir, "src/context/AuthContext.tsx"), "utf8"),
    readFile(path.join(frontendDir, "src/lib/api.ts"), "utf8"),
  ]);

  assert.match(context, /migrateLegacyBrowserSession/);
  assert.match(context, /localStorage\.removeItem\(LEGACY_TOKEN_KEY\)/);
  assert.match(api, /credentials: "include"/);
  assert.doesNotMatch(api, /events\$\{.*\?token=/);
});

test("production hardening protects PINs, browser origins, voice calls, and autoscale jobs", async () => {
  const [pinSecurity, app, websocket, notifications, campaignAds] = await Promise.all([
    source("src/lib/pinSecurity.ts"),
    source("src/app.ts"),
    source("src/routes/callFunnelWs.ts"),
    source("src/services/notifications.ts"),
    source("src/services/campaignAds.ts"),
  ]);

  assert.match(pinSecurity, /scrypt\(/);
  assert.match(pinSecurity, /needsUpgrade: valid/);
  assert.match(app, /isAllowedBrowserOrigin/);
  assert.match(app, /express\.json\(\{ limit: "256kb" \}\)/);
  assert.match(websocket, /maxPayload: 256 \* 1024/);
  assert.match(websocket, /MAX_CONNECTIONS_PER_IP/);
  assert.match(notifications, /withScheduledJobLock/);
  assert.match(campaignAds, /withScheduledJobLock/);
});