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

test("local sessions expire and login attempts are rate limited", async () => {
  const [auth, users] = await Promise.all([
    source("src/routes/userAuth.ts"),
    readFile(path.join(dbDir, "src/schema/users.ts"), "utf8"),
  ]);

  assert.match(users, /sessionExpiresAt: timestamp\("session_expires_at"\)/);
  assert.match(auth, /gt\(usersTable\.sessionExpiresAt, new Date\(\)\)/);
  assert.match(auth, /router\.post\("\/user-auth\/login", loginRateLimit/);
  assert.match(auth, /randomBytes\(32\)\.toString\("base64url"\)/);
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
  assert.match(context, /getCurrentUser\(token\)/);
  assert.match(context, /isLoggedIn: !state\.isLoading && !!state\.user/);
  assert.match(api, /if \(res\.status === 401\) notifyAuthExpired\(\)/);
});