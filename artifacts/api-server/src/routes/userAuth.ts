/**
 * User authentication routes — phone + PIN, no SMS verification.
 *
 * POST /user-auth/register          { phone, name, pin }  → { user }
 * POST /user-auth/login             { phone, pin }         → { user }
 * GET  /user-auth/me                                       → { user }   (HttpOnly cookie)
 * POST /user-auth/logout                                   → 200        (HttpOnly cookie)
 * GET  /user-auth/handle/check?handle=                    → { available }
 * PUT  /user-auth/handle            { handle }             → { user }   (bearer)
 *
 * Model: every user IS a business. When a handle is set, a business_profiles row
 * with slug = handle is created atomically in the same DB transaction.
 * The DB unique constraints are the canonical authority — pre-flight checks are
 * only UX optimisations. Concurrent races are caught by the transaction.
 */
import { Router, type Request, type Response } from "express";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { and, eq, gt, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  usersTable,
  businessProfilesTable,
  leadsTable,
  assistantMessagesTable,
  campaignsTable,
  campaignPaymentAttemptsTable,
  ordersTable,
  orderEventsTable,
  subscriptionsTable,
  walletLedgerTable,
  payoutsTable,
} from "@workspace/db";
import { logger } from "../lib/logger.js";
import {
  clearLocalSessionCookie,
  clientIp,
  getLocalSessionToken,
  setLocalSessionCookie,
} from "../lib/httpSecurity.js";
import { hashPin, verifyPin } from "../lib/pinSecurity.js";
import { consumeSharedRateLimit } from "../lib/rateLimit.js";

const router = Router();

// ─── helpers ────────────────────────────────────────────────────────────────

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SENSITIVE_AUTH_TTL_MS = 10 * 60 * 1000;

function createSession() {
  return {
    token: randomBytes(32).toString("base64url"),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  };
}

function normaliseRecoveryCode(raw: string): string {
  return raw.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normaliseRecoveryCode(code)).digest("hex");
}

function recoveryCodeMatches(storedHash: string | null, candidateHash: string): boolean {
  if (!storedHash || !/^[a-f0-9]{64}$/i.test(storedHash)) return false;
  return timingSafeEqual(Buffer.from(storedHash, "hex"), Buffer.from(candidateHash, "hex"));
}

function generateRecoveryCode(): string {
  const raw = randomBytes(9).toString("hex").toUpperCase();
  return raw.match(/.{1,4}/g)!.join("-");
}

async function consumeAuthLimits(
  req: Request,
  res: Response,
  limits: Array<{ scope: string; subject: string; max: number; windowMs: number }>,
  message: string,
): Promise<boolean> {
  try {
    for (const limit of limits) {
      if (!(await consumeSharedRateLimit(limit.scope, limit.subject, limit.max, limit.windowMs))) {
        res.status(429).json({ error: message });
        return false;
      }
    }
    return true;
  } catch (err) {
    // PIN guesses must not become unlimited when the shared limiter is down.
    logger.error({ err }, "shared authentication rate limiter failed");
    res.status(503).json({ error: "Não foi possível validar esta tentativa. Tenta novamente." });
    return false;
  }
}

async function recoveryRateLimit(req: Request, res: Response, next: () => void): Promise<void> {
  const rawPhone = typeof req.body?.phone === "string" ? req.body.phone : "";
  const phone = normalisePhone(rawPhone);
  if (await consumeAuthLimits(req, res, [
    { scope: "recovery-ip", subject: clientIp(req), max: 8, windowMs: 60_000 },
    { scope: "recovery-account", subject: phone, max: 10, windowMs: 60 * 60_000 },
  ], "Demasiadas tentativas — tenta daqui a pouco")) next();
}

function normalisePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("244")) return `+${digits}`;
  if (digits.startsWith("9") && digits.length === 9) return `+244${digits}`;
  return `+${digits}`;
}

function legacyBearerToken(req: { headers: { authorization?: string } }) {
  const h = req.headers.authorization ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  // Historical browser sessions were UUIDs. The bounded base64url form also
  // permits sessions created shortly before the cookie migration shipped.
  return /^(?:[a-f0-9-]{36}|[A-Za-z0-9_-]{43})$/.test(token) ? token : null;
}

const HANDLE_RE = /^[a-z0-9-]{3,30}$/;
const RESERVED_HANDLES = new Set([
  "login",
  "registar",
  "escolher-handle",
  "conversas",
  "captacao",
  "dono",
  "catalogo",
  "api",
  "u",
  "e",
  "c",
]);

function normaliseHandle(raw: string) {
  return raw.trim().toLowerCase();
}

/** Columns returned in every user response (no sensitive fields). */
const USER_COLS = {
  id:     usersTable.id,
  phone:  usersTable.phone,
  name:   usersTable.name,
  handle: usersTable.handle,
} as const;

function toUserDTO(row: { id: string; phone: string; name: string; handle: string | null }) {
  return {
    id:     row.id,
    // Replit-provisioned accounts do not have a local phone login.
    phone:  row.phone.startsWith("replit:") ? "" : row.phone,
    name:   row.name,
    handle: row.handle ?? null,
  };
}

function replitName(user: Request["replitUser"]): string {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  return name || user?.email?.split("@")[0] || "Utilizador Linkealls";
}

function requireReplitUser(req: Request, res: Response) {
  if (!req.isReplitAuthenticated()) {
    res.status(401).json({ error: "Inicia sessão com o Replit para continuar." });
    return null;
  }
  return req.replitUser;
}

/** Resolves the authenticated user from an opaque session token (or null). */
export async function getUserByToken(token: string | null) {
  if (!token) return null;
  const rows = await db
    .select(USER_COLS)
    .from(usersTable)
    .where(and(
      eq(usersTable.sessionToken, token),
      gt(usersTable.sessionExpiresAt, new Date()),
    ))
    .limit(1);
  return rows[0] ?? null;
}

/** Whether this session recently passed the account PIN confirmation. */
export async function hasRecentSensitiveAuth(token: string | null): Promise<boolean> {
  if (!token) return false;
  const rows = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(
      eq(usersTable.sessionToken, token),
      gt(usersTable.sessionExpiresAt, new Date()),
      gt(usersTable.sensitiveAuthExpiresAt, new Date()),
    ))
    .limit(1);
  return rows.length > 0;
}

/** Extracts the HttpOnly local session. URLs and browser bearer tokens are never accepted. */
export function requestToken(req: { cookies?: Record<string, unknown> }): string | null {
  return getLocalSessionToken(req);
}

/** True when the error is a PostgreSQL unique-constraint violation (code 23505). */
function isPgUniqueViolation(err: unknown): boolean {
  let current = err;
  const seen = new Set<unknown>();
  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);
    const candidate = current as { code?: unknown; cause?: unknown };
    if (candidate.code === "23505") return true;
    current = candidate.cause;
  }
  return false;
}

// ─── register ───────────────────────────────────────────────────────────────

const registerSchema = z.object({
  phone: z.string().min(7),
  name:  z.string().min(1).max(60),
  pin:   z.string().length(4).regex(/^\d{4}$/),
});

async function registerRateLimit(req: Request, res: Response, next: () => void): Promise<void> {
  const rawPhone = typeof req.body?.phone === "string" ? req.body.phone : "";
  if (await consumeAuthLimits(req, res, [
    { scope: "register-ip", subject: clientIp(req), max: 5, windowMs: 60 * 60_000 },
    { scope: "register-account", subject: normalisePhone(rawPhone), max: 5, windowMs: 60 * 60_000 },
  ], "Demasiadas tentativas de registo — tenta daqui a pouco")) next();
}

router.post("/user-auth/register", registerRateLimit, async (req, res) => {
  const parse = registerSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Dados inválidos", details: parse.error.flatten() });
    return;
  }
  const { name, pin } = parse.data;
  const phone = normalisePhone(parse.data.phone);
  const recoveryCode = generateRecoveryCode();

  try {
    const existing = await db.select({ id: usersTable.id })
      .from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "Este número já tem conta. Faz login." });
      return;
    }

    const session = createSession();
    const [row] = await db.insert(usersTable).values({
      phone,
      name,
      pinHash:      await hashPin(pin),
      recoveryCodeHash: hashRecoveryCode(recoveryCode),
      recoveryCodeIssuedAt: new Date(),
      sessionToken: session.token,
      sessionExpiresAt: session.expiresAt,
    }).returning(USER_COLS);

    setLocalSessionCookie(req, res, session.token, session.expiresAt);
    res.status(201).json({ user: toUserDTO(row!), recoveryCode });
  } catch (err) {
    logger.error({ err }, "register failed");
    res.status(500).json({ error: "Erro ao criar conta" });
  }
});

// ─── login ──────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  phone: z.string().min(7),
  pin:   z.string().length(4).regex(/^\d{4}$/),
});

async function loginRateLimit(req: Request, res: Response, next: () => void): Promise<void> {
  const rawPhone = typeof req.body?.phone === "string" ? req.body.phone : "";
  const phone = normalisePhone(rawPhone);
  if (await consumeAuthLimits(req, res, [
    { scope: "login-ip-account", subject: `${clientIp(req)}:${phone}`, max: 8, windowMs: 10 * 60_000 },
    { scope: "login-account", subject: phone, max: 20, windowMs: 60 * 60_000 },
  ], "Demasiadas tentativas de login — tenta daqui a pouco")) next();
}

router.post("/user-auth/login", loginRateLimit, async (req, res) => {
  const parse = loginSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Dados inválidos" });
    return;
  }
  const phone = normalisePhone(parse.data.phone);
  try {
    const rows = await db.select().from(usersTable)
      .where(eq(usersTable.phone, phone)).limit(1);

    const pinResult = await verifyPin(parse.data.pin, rows[0]?.pinHash);
    if (rows.length === 0 || !pinResult.valid) {
      res.status(401).json({ error: "Número ou PIN incorretos" });
      return;
    }

    const session = createSession();
    await db.update(usersTable)
      .set({
        ...(pinResult.needsUpgrade ? { pinHash: await hashPin(parse.data.pin) } : {}),
        sessionToken: session.token,
        sessionExpiresAt: session.expiresAt,
        sensitiveAuthExpiresAt: null,
      })
      .where(eq(usersTable.id, rows[0]!.id));

    setLocalSessionCookie(req, res, session.token, session.expiresAt);
    res.json({ user: toUserDTO(rows[0]!) });
  } catch (err) {
    logger.error({ err }, "login failed");
    res.status(500).json({ error: "Erro ao fazer login" });
  }
});

// ─── account recovery ────────────────────────────────────────────────────────

const recoverySchema = z.object({
  phone: z.string().min(7),
  recoveryCode: z.string().min(8).max(32),
  pin: z.string().length(4).regex(/^\d{4}$/),
});

/**
 * Generate or rotate the one-time recovery secret while the owner is signed in.
 * The plaintext is returned only in this response so it can be saved offline.
 */
router.post("/user-auth/recovery-code", async (req, res) => {
  const user = await getUserByToken(requestToken(req));
  if (!user) {
    res.status(401).json({ error: "Sessão inválida — inicia sessão novamente" });
    return;
  }
  if (!(await hasRecentSensitiveAuth(requestToken(req)))) {
    res.status(403).json({
      error: "Confirma o PIN do teu negócio antes de gerar um código de recuperação",
      code: "SENSITIVE_AUTH_REQUIRED",
    });
    return;
  }

  const recoveryCode = generateRecoveryCode();
  try {
    await db.update(usersTable)
      .set({
        recoveryCodeHash: hashRecoveryCode(recoveryCode),
        recoveryCodeIssuedAt: new Date(),
      })
      .where(eq(usersTable.id, user.id));
    res.json({ recoveryCode });
  } catch (err) {
    logger.error({ err, userId: user.id }, "recovery code generation failed");
    res.status(500).json({ error: "Não foi possível gerar o código de recuperação" });
  }
});

router.post("/user-auth/recover", recoveryRateLimit, async (req, res) => {
  const parse = recoverySchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Indica telefone, código de recuperação e um PIN de 4 dígitos." });
    return;
  }

  const phone = normalisePhone(parse.data.phone);
  const recoveryHash = hashRecoveryCode(parse.data.recoveryCode);
  try {
    const [row] = await db.select()
      .from(usersTable)
      .where(eq(usersTable.phone, phone))
      .limit(1);
    if (!row || !recoveryCodeMatches(row.recoveryCodeHash, recoveryHash)) {
      res.status(401).json({ error: "Telefone ou código de recuperação inválidos." });
      return;
    }

    const session = createSession();
    const [updated] = await db.update(usersTable)
      .set({
        pinHash: await hashPin(parse.data.pin),
        recoveryCodeHash: null,
        recoveryCodeIssuedAt: null,
        sessionToken: session.token,
        sessionExpiresAt: session.expiresAt,
        sensitiveAuthExpiresAt: null,
      })
      .where(and(
        eq(usersTable.id, row.id),
        eq(usersTable.recoveryCodeHash, recoveryHash),
      ))
      .returning(USER_COLS);
    if (!updated) {
      res.status(401).json({ error: "Código de recuperação inválido ou já utilizado." });
      return;
    }
    setLocalSessionCookie(req, res, session.token, session.expiresAt);
    res.json({ user: toUserDTO(updated) });
  } catch (err) {
    logger.error({ err }, "account recovery failed");
    res.status(500).json({ error: "Não foi possível recuperar a conta" });
  }
});

// ─── Replit identity bridge ──────────────────────────────────────────────────
//
// Replit owns the browser identity. Linkealls keeps the local business row and
// its HttpOnly local session so commerce routes retain business ownership checks.
router.post("/user-auth/session", async (req, res): Promise<void> => {
  const replitUser = requireReplitUser(req, res);
  if (!replitUser) return;

  const [row] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.replitId, replitUser.id))
    .limit(1);
  if (!row) {
    res.status(409).json({
      error: "Esta identidade Replit ainda não está ligada a uma conta Linkealls.",
      needsLink: true,
    });
    return;
  }

  const session = createSession();
  const [updated] = await db.update(usersTable)
    .set({
      sessionToken: session.token,
      sessionExpiresAt: session.expiresAt,
      sensitiveAuthExpiresAt: null,
      email: replitUser.email,
      firstName: replitUser.firstName,
      lastName: replitUser.lastName,
      profileImageUrl: replitUser.profileImageUrl,
    })
    .where(eq(usersTable.id, row.id))
    .returning(USER_COLS);
  setLocalSessionCookie(req, res, session.token, session.expiresAt);
  res.json({ user: toUserDTO(updated!) });
});

router.post("/user-auth/link-replit", loginRateLimit, async (req, res): Promise<void> => {
  const replitUser = requireReplitUser(req, res);
  if (!replitUser) return;

  const parse = loginSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Indica o telefone e o PIN actuais." });
    return;
  }
  const phone = normalisePhone(parse.data.phone);

  const [existingReplitLink] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.replitId, replitUser.id))
    .limit(1);
  if (existingReplitLink) {
    res.status(409).json({ error: "Esta identidade Replit já está ligada a uma conta." });
    return;
  }

  const [row] = await db.select().from(usersTable)
    .where(eq(usersTable.phone, phone)).limit(1);
  const pinResult = await verifyPin(parse.data.pin, row?.pinHash);
  if (!row || !pinResult.valid) {
    res.status(401).json({ error: "Telefone ou PIN incorrectos." });
    return;
  }
  if (row.replitId && row.replitId !== replitUser.id) {
    res.status(409).json({ error: "Esta conta Linkealls já está ligada a outra identidade." });
    return;
  }

  const session = createSession();
  const [updated] = await db.update(usersTable)
    .set({
      replitId: replitUser.id,
      ...(pinResult.needsUpgrade ? { pinHash: await hashPin(parse.data.pin) } : {}),
      sessionToken: session.token,
      sessionExpiresAt: session.expiresAt,
      sensitiveAuthExpiresAt: null,
      email: replitUser.email,
      firstName: replitUser.firstName,
      lastName: replitUser.lastName,
      profileImageUrl: replitUser.profileImageUrl,
    })
    .where(eq(usersTable.id, row.id))
    .returning(USER_COLS);
  setLocalSessionCookie(req, res, session.token, session.expiresAt);
  res.json({ user: toUserDTO(updated!) });
});

router.post("/user-auth/provision", async (req, res): Promise<void> => {
  const replitUser = requireReplitUser(req, res);
  if (!replitUser) return;

  const [alreadyLinked] = await db.select({ id: usersTable.id })
    .from(usersTable).where(eq(usersTable.replitId, replitUser.id)).limit(1);
  if (alreadyLinked) {
    res.status(409).json({ error: "Esta identidade Replit já tem uma conta Linkealls." });
    return;
  }

  const session = createSession();
  const [row] = await db.insert(usersTable).values({
    phone: `replit:${replitUser.id}`,
    name: replitName(replitUser).slice(0, 60),
    pinHash: await hashPin(randomUUID()),
    sessionToken: session.token,
    sessionExpiresAt: session.expiresAt,
    replitId: replitUser.id,
    email: replitUser.email,
    firstName: replitUser.firstName,
    lastName: replitUser.lastName,
    profileImageUrl: replitUser.profileImageUrl,
  }).returning(USER_COLS);
  setLocalSessionCookie(req, res, session.token, session.expiresAt);
  res.status(201).json({ user: toUserDTO(row!) });
});

// ─── legacy browser-session migration ───────────────────────────────────────

router.post("/user-auth/migrate-session", async (req, res) => {
  try {
    const cookieToken = requestToken(req);
    const cookieUser = await getUserByToken(cookieToken);
    if (cookieUser) {
      res.json({ user: toUserDTO(cookieUser) });
      return;
    }
    if (cookieToken) clearLocalSessionCookie(req, res);

    const token = legacyBearerToken(req);
    if (!token) {
      res.status(401).json({ error: "Sessão antiga inválida" });
      return;
    }
    const user = await getUserByToken(token);
    if (!user) {
      res.status(401).json({ error: "Sessão antiga inválida ou expirada" });
      return;
    }
    const rows = await db.select({ sessionExpiresAt: usersTable.sessionExpiresAt })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);
    const expiresAt = rows[0]?.sessionExpiresAt;
    if (!expiresAt) {
      res.status(401).json({ error: "Sessão antiga inválida ou expirada" });
      return;
    }
    setLocalSessionCookie(req, res, token, expiresAt);
    res.json({ user: toUserDTO(user) });
  } catch (err) {
    logger.error({ err }, "legacy session migration failed");
    res.status(500).json({ error: "Não foi possível migrar a sessão" });
  }
});

// ─── me ─────────────────────────────────────────────────────────────────────

router.get("/user-auth/me", async (req, res) => {
  const token = requestToken(req);
  if (!token) { res.status(401).json({ error: "Sem autorização" }); return; }

  try {
    const user = await getUserByToken(token);
    if (!user) {
      clearLocalSessionCookie(req, res);
      res.status(401).json({ error: "Sessão inválida" });
      return;
    }
    res.json({ user: toUserDTO(user) });
  } catch (err) {
    logger.error({ err }, "me failed");
    res.status(500).json({ error: "Erro interno" });
  }
});

// ─── recent identity confirmation ────────────────────────────────────────────
//
// The normal session proves who is signed in. This short-lived confirmation
// proves that the person at the keyboard also knows the account PIN. Replit
// identities may use the already-authenticated Replit identity instead.
router.post("/user-auth/reauthenticate", async (req, res) => {
  const token = requestToken(req);
  const user = await getUserByToken(token);
  if (!user || !token) {
    res.status(401).json({ error: "Sessão inválida — inicia sessão novamente" });
    return;
  }

  try {
    if (await hasRecentSensitiveAuth(token)) {
      res.json({ ok: true, expiresAt: new Date(Date.now() + SENSITIVE_AUTH_TTL_MS).toISOString() });
      return;
    }
    const [[account], [profile]] = await Promise.all([
      db
        .select({ phone: usersTable.phone, pinHash: usersTable.pinHash, replitId: usersTable.replitId })
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .limit(1),
      user.handle
        ? db
            .select({ ownerPin: businessProfilesTable.ownerPin })
            .from(businessProfilesTable)
            .where(eq(businessProfilesTable.slug, user.handle))
            .limit(1)
        : Promise.resolve([] as Array<{ ownerPin: string | null }>),
    ]);
    const replitConfirmed = Boolean(
      account?.replitId &&
      req.isReplitAuthenticated() &&
      req.replitUser?.id === account.replitId,
    );
    const suppliedPin = typeof req.body?.pin === "string" ? req.body.pin.trim() : "";
    if (!replitConfirmed && suppliedPin && !(await consumeAuthLimits(req, res, [
      { scope: "reauth-user-ip", subject: `${user.id}:${clientIp(req)}`, max: 8, windowMs: 10 * 60_000 },
      { scope: "reauth-user", subject: user.id, max: 20, windowMs: 60 * 60_000 },
    ], "Demasiadas tentativas — tenta daqui a pouco"))) return;
    // Prefer the business PIN already used by the owner area. Older profiles
    // may not have one yet, so their account PIN remains the bootstrap fallback.
    const storedPinHash = profile?.ownerPin ?? account?.pinHash;
    const pinResult = !replitConfirmed && suppliedPin.length > 0
      ? await verifyPin(suppliedPin, storedPinHash)
      : { valid: false, needsUpgrade: false };
    const pinConfirmed = pinResult.valid;

    if (!replitConfirmed && !pinConfirmed) {
      if (!profile?.ownerPin && account?.phone.startsWith("replit:")) {
        res.status(403).json({
          error: "Confirma novamente a tua identidade Replit para continuar",
          code: "REPLIT_REAUTH_REQUIRED",
        });
        return;
      }
      res.status(403).json({
        error: "Confirma o PIN do teu negócio para continuar",
        code: "SENSITIVE_AUTH_REQUIRED",
      });
      return;
    }

    const expiresAt = new Date(Date.now() + SENSITIVE_AUTH_TTL_MS);
    if (pinResult.needsUpgrade) {
      const upgradedHash = await hashPin(suppliedPin);
      if (profile?.ownerPin) {
        await db.update(businessProfilesTable)
          .set({ ownerPin: upgradedHash, updatedAt: new Date() })
          .where(eq(businessProfilesTable.slug, user.handle!));
      } else {
        await db.update(usersTable)
          .set({ pinHash: upgradedHash })
          .where(eq(usersTable.id, user.id));
      }
    }
    await db.update(usersTable)
      .set({ sensitiveAuthExpiresAt: expiresAt })
      .where(and(
        eq(usersTable.id, user.id),
        eq(usersTable.sessionToken, token),
        gt(usersTable.sessionExpiresAt, new Date()),
      ));
    res.json({ ok: true, expiresAt: expiresAt.toISOString() });
  } catch (err) {
    logger.error({ err, userId: user.id }, "reauthentication failed");
    res.status(500).json({ error: "Não foi possível confirmar a identidade" });
  }
});

// ─── logout ─────────────────────────────────────────────────────────────────

router.post("/user-auth/logout", async (req, res) => {
  const token = requestToken(req);
  if (token) {
    try {
      await db.update(usersTable)
        .set({
          sessionToken: null,
          sessionExpiresAt: new Date(),
          sensitiveAuthExpiresAt: null,
        })
        .where(eq(usersTable.sessionToken, token));
    } catch { /* ignore */ }
  }
  clearLocalSessionCookie(req, res);
  res.json({ ok: true });
});

// ─── account deletion ────────────────────────────────────────────────────────
//
// The account is also the owner of a business profile. Deletion is deliberately
// authenticated by the current opaque session and performed in one transaction.
// Pending gateway operations are refused so a late callback cannot settle into
// a half-deleted business.
router.delete("/user-auth/account", async (req, res) => {
  const token = requestToken(req);
  const user = await getUserByToken(token);
  if (!user) {
    res.status(401).json({ error: "Sessão inválida — inicia sessão novamente" });
    return;
  }
  if (!(await hasRecentSensitiveAuth(token))) {
    res.status(403).json({
      error: "Confirma o PIN do teu negócio antes de eliminar a conta",
      code: "SENSITIVE_AUTH_REQUIRED",
    });
    return;
  }

  try {
    const profileRows = user.handle
      ? await db
          .select({ id: businessProfilesTable.id })
          .from(businessProfilesTable)
          .where(eq(businessProfilesTable.slug, user.handle))
          .limit(1)
      : [];
    const businessId = profileRows[0]?.id;

    if (businessId !== undefined) {
      const [pendingOrders, pendingSubscriptions, pendingPayouts, pendingCampaignAttempts] =
        await Promise.all([
          db.select({ id: ordersTable.id }).from(ordersTable)
            .where(and(eq(ordersTable.status, "pendente"), eq(ordersTable.businessId, businessId))).limit(1),
          db.select({ id: subscriptionsTable.id }).from(subscriptionsTable)
            .where(and(eq(subscriptionsTable.status, "pendente"), eq(subscriptionsTable.businessId, businessId))).limit(1),
          db.select({ id: payoutsTable.id }).from(payoutsTable)
            .where(and(eq(payoutsTable.status, "pendente"), eq(payoutsTable.businessId, businessId))).limit(1),
          db.select({ id: campaignPaymentAttemptsTable.id })
            .from(campaignPaymentAttemptsTable)
            .innerJoin(campaignsTable, eq(campaignPaymentAttemptsTable.campaignId, campaignsTable.id))
            .where(and(
              eq(campaignPaymentAttemptsTable.status, "pendente"),
              eq(campaignsTable.businessId, businessId),
            )).limit(1),
        ]);
      // Any existing transaction may still be reconciled by a gateway callback.
      // Refuse deletion rather than silently orphaning a financial operation.
      if (pendingOrders.length || pendingSubscriptions.length || pendingPayouts.length || pendingCampaignAttempts.length) {
        res.status(409).json({
          error: "Não podes eliminar a conta enquanto existirem operações financeiras pendentes.",
        });
        return;
      }

      await db.transaction(async (tx) => {
        const campaignRows = await tx
          .select({ id: campaignsTable.id })
          .from(campaignsTable)
          .where(eq(campaignsTable.businessId, businessId));
        if (campaignRows.length > 0) {
          await tx.delete(campaignPaymentAttemptsTable)
            .where(inArray(campaignPaymentAttemptsTable.campaignId, campaignRows.map((row) => row.id)));
        }

        await tx.delete(orderEventsTable).where(eq(orderEventsTable.businessId, businessId));
        await tx.delete(ordersTable).where(eq(ordersTable.businessId, businessId));
        await tx.delete(subscriptionsTable).where(eq(subscriptionsTable.businessId, businessId));
        await tx.delete(walletLedgerTable).where(eq(walletLedgerTable.businessId, businessId));
        await tx.delete(payoutsTable).where(eq(payoutsTable.businessId, businessId));
        await tx.delete(leadsTable).where(eq(leadsTable.businessId, businessId));
        await tx.delete(assistantMessagesTable).where(eq(assistantMessagesTable.businessId, businessId));
        await tx.delete(campaignsTable).where(eq(campaignsTable.businessId, businessId));
        await tx.delete(businessProfilesTable).where(eq(businessProfilesTable.id, businessId));
        await tx.delete(usersTable).where(eq(usersTable.id, user.id));
      });
    } else {
      await db.delete(usersTable).where(eq(usersTable.id, user.id));
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, userId: user.id }, "account deletion failed");
    res.status(500).json({ error: "Não foi possível eliminar a conta" });
  }
});

// ─── handle check (public) ──────────────────────────────────────────────────
//
// A handle is considered available only when it is free in BOTH users.handle
// AND business_profiles.slug — claiming a slug that belongs to an existing
// business the caller doesn't own is a broken-access-control risk.
// (Pre-flight optimisation — the transaction is the canonical authority.)

router.get("/user-auth/handle/check", async (req, res) => {
  // Availability is race-prone by definition and must always be revalidated.
  // In particular, do not let browser/proxy caches turn an earlier 200 into a
  // stale answer after another account has claimed the handle.
  res.set("Cache-Control", "no-store");

  const raw = (req.query.handle as string | undefined) ?? "";
  const handle = normaliseHandle(raw);

  if (!HANDLE_RE.test(handle)) {
    res.json({ available: false, reason: "Formato inválido (3-30 letras, números ou hífens)" });
    return;
  }
  if (RESERVED_HANDLES.has(handle)) {
    res.json({ available: false, reason: "Este nome está reservado pelo Linkealls" });
    return;
  }

  try {
    const [userRows, bizRows] = await Promise.all([
      db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.handle, handle)).limit(1),
      db.select({ id: businessProfilesTable.id }).from(businessProfilesTable).where(eq(businessProfilesTable.slug, handle)).limit(1),
    ]);
    const available = userRows.length === 0 && bizRows.length === 0;
    res.json({ available });
  } catch (err) {
    logger.error({ err }, "handle check failed");
    res.status(500).json({ error: "Erro interno" });
  }
});

// ─── public profile by handle ───────────────────────────────────────────────
//
// Minimal public info for older clients that still request a profile by handle.
// No phone or other sensitive fields.

router.get("/user-auth/public/:handle", async (req, res) => {
  const handle = normaliseHandle(req.params.handle ?? "");
  if (!HANDLE_RE.test(handle)) {
    res.status(404).json({ error: "Utilizador não encontrado" });
    return;
  }
  try {
    const rows = await db
      .select({ name: usersTable.name, handle: usersTable.handle })
      .from(usersTable)
      .where(eq(usersTable.handle, handle))
      .limit(1);
    const user = rows[0];
    if (!user) {
      res.status(404).json({ error: "Utilizador não encontrado" });
      return;
    }
    res.json({ name: user.name, handle: user.handle });
  } catch (err) {
    logger.error({ err }, "public profile lookup failed");
    res.status(500).json({ error: "Erro interno" });
  }
});

// ─── set / update handle (authenticated) ────────────────────────────────────
//
// Security + atomicity contract (user = business model):
//
//   The DB unique constraints are the canonical authority. Pre-flight checks
//   are kept as UX optimisations (fast rejection before opening a tx) but
//   correctness must NOT depend on them.
//
//   Inside the transaction:
//     1. INSERT business_profiles (slug = handle) with a targeted conflict no-op.
//        RETURNING distinguishes a new profile from an existing slug without
//        issuing a statement that aborts PostgreSQL's transaction.
//     2. An existing slug is accepted only when the user's current handle inside
//        the transaction proves ownership. Otherwise the tx is rolled back.
//     3. UPDATE users.handle — its unique index remains the canonical authority
//        for concurrent user-handle races and rolls back the profile insert.

const handleSchema = z.object({
  handle: z.string().min(3).max(30).regex(/^[a-z0-9-]+$/, "Apenas letras minúsculas, números e hífens"),
});

// Tagged error used to surface slug conflicts from within the transaction.
class SlugConflictError extends Error {
  constructor() { super("slug_conflict"); this.name = "SlugConflictError"; }
}

router.put("/user-auth/handle", async (req, res) => {
  const token = requestToken(req);
  if (!token) { res.status(401).json({ error: "Sem autorização" }); return; }

  const parse = handleSchema.safeParse({
    handle: normaliseHandle((req.body as { handle?: string }).handle ?? ""),
  });
  if (!parse.success) {
    res.status(400).json({ error: parse.error.errors[0]?.message ?? "Handle inválido" });
    return;
  }
  const handle = parse.data.handle;
  if (RESERVED_HANDLES.has(handle)) {
    res.status(400).json({ error: "Este nome está reservado pelo Linkealls" });
    return;
  }

  try {
    // Load the authenticated account; slug ownership is rechecked in the tx.
    const rows = await db.select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(and(
        eq(usersTable.sessionToken, token),
        gt(usersTable.sessionExpiresAt, new Date()),
      ))
      .limit(1);
    if (rows.length === 0) { res.status(401).json({ error: "Sessão inválida" }); return; }

    const userId        = rows[0]!.id;
    const userName      = rows[0]!.name;
    // ── UX pre-flight (optimisation only — NOT relied on for correctness) ──
    const [takenByUser, takenByBiz] = await Promise.all([
      db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.handle, handle)).limit(1),
      db.select({ id: businessProfilesTable.id }).from(businessProfilesTable).where(eq(businessProfilesTable.slug, handle)).limit(1),
    ]);
    if (takenByUser.length > 0 && takenByUser[0]!.id !== userId) {
      res.status(409).json({ error: "Este handle já está a ser usado" });
      return;
    }
    if (takenByBiz.length > 0 && takenByUser[0]?.id !== userId) {
      res.status(409).json({ error: "Este handle já está em uso por um negócio existente" });
      return;
    }
    // ── end UX pre-flight ──

    // Atomic transaction: both succeed or neither does.
    const updated = await db.transaction(async (tx) => {
      // Step 1: provision the profile without aborting the PostgreSQL
      // transaction when this exact slug already exists.
      const insertedProfiles = await tx.insert(businessProfilesTable)
        .values({ slug: handle, name: userName })
        .onConflictDoNothing({ target: businessProfilesTable.slug })
        .returning({ id: businessProfilesTable.id });

      if (insertedProfiles.length === 0) {
        // business_profiles has no separate owner column: ownership is the
        // users.handle ↔ business_profiles.slug relationship. Require the
        // transactional current handle to prove that this user owns the slug
        // before treating the request as an idempotent resubmission.
        const [existingOwner] = await tx.select({ id: usersTable.id })
          .from(usersTable)
          .where(and(
            eq(usersTable.id, userId),
            eq(usersTable.handle, handle),
          ))
          .limit(1);
        if (!existingOwner) {
          throw new SlugConflictError();
        }
      }

      // Step 2: unique users.handle conflicts roll back a newly inserted
      // profile, preserving atomic user/profile provisioning.
      const [user] = await tx.update(usersTable)
        .set({ handle })
        .where(eq(usersTable.id, userId))
        .returning(USER_COLS);

      return user!;
    });

    logger.info({ handle, userId }, "handle saved — business profile provisioned");
    res.json({ user: toUserDTO(updated) });
  } catch (err: unknown) {
    if (err instanceof SlugConflictError || isPgUniqueViolation(err)) {
      res.status(409).json({ error: "Este handle já está em uso" });
      return;
    }
    logger.error({ err }, "set handle failed");
    res.status(500).json({ error: "Erro ao guardar handle" });
  }
});

export default router;
