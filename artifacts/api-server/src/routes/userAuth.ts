/**
 * User authentication routes — phone + PIN, no SMS verification.
 *
 * POST /user-auth/register          { phone, name, pin }  → { user, token }
 * POST /user-auth/login             { phone, pin }         → { user, token }
 * GET  /user-auth/me                                       → { user }   (bearer)
 * POST /user-auth/logout                                   → 200        (bearer)
 * GET  /user-auth/handle/check?handle=                    → { available }
 * PUT  /user-auth/handle            { handle }             → { user }   (bearer)
 *
 * Model: every user IS a business. When a handle is set, a business_profiles row
 * with slug = handle is created atomically in the same DB transaction.
 * The DB unique constraints are the canonical authority — pre-flight checks are
 * only UX optimisations. Concurrent races are caught by the transaction.
 */
import { Router } from "express";
import { createHash, randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, usersTable, businessProfilesTable } from "@workspace/db";
import { logger } from "../lib/logger.js";

const router = Router();

// ─── helpers ────────────────────────────────────────────────────────────────

function hashPin(pin: string) {
  return createHash("sha256").update(pin).digest("hex");
}

function normalisePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("244")) return `+${digits}`;
  if (digits.startsWith("9") && digits.length === 9) return `+244${digits}`;
  return `+${digits}`;
}

function bearerToken(req: { headers: { authorization?: string } }) {
  const h = req.headers.authorization ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
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
    phone:  row.phone,
    name:   row.name,
    handle: row.handle ?? null,
  };
}

/** Resolves the authenticated user from an opaque session token (or null). */
export async function getUserByToken(token: string | null) {
  if (!token) return null;
  const rows = await db
    .select(USER_COLS)
    .from(usersTable)
    .where(eq(usersTable.sessionToken, token))
    .limit(1);
  return rows[0] ?? null;
}

/** Extracts the bearer token from a request (exported for route middleware). */
export function requestToken(req: { headers: { authorization?: string }; query?: Record<string, unknown> }): string | null {
  const bearer = bearerToken(req);
  if (bearer) return bearer;
  // EventSource cannot set headers — allow ?token= for SSE endpoints.
  const q = req.query?.["token"];
  return typeof q === "string" && q.length > 0 ? q : null;
}

/** True when the error is a PostgreSQL unique-constraint violation (code 23505). */
function isPgUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === "23505";
}

// ─── register ───────────────────────────────────────────────────────────────

const registerSchema = z.object({
  phone: z.string().min(7),
  name:  z.string().min(1).max(60),
  pin:   z.string().length(4).regex(/^\d{4}$/),
});

router.post("/user-auth/register", async (req, res) => {
  const parse = registerSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Dados inválidos", details: parse.error.flatten() });
    return;
  }
  const { name, pin } = parse.data;
  const phone = normalisePhone(parse.data.phone);

  try {
    const existing = await db.select({ id: usersTable.id })
      .from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "Este número já tem conta. Faz login." });
      return;
    }

    const token = randomUUID();
    const [row] = await db.insert(usersTable).values({
      phone,
      name,
      pinHash:      hashPin(pin),
      sessionToken: token,
    }).returning(USER_COLS);

    res.status(201).json({ user: toUserDTO(row!), token });
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

router.post("/user-auth/login", async (req, res) => {
  const parse = loginSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Dados inválidos" });
    return;
  }
  const phone = normalisePhone(parse.data.phone);
  const pinH  = hashPin(parse.data.pin);

  try {
    const rows = await db.select().from(usersTable)
      .where(eq(usersTable.phone, phone)).limit(1);

    if (rows.length === 0 || rows[0]!.pinHash !== pinH) {
      res.status(401).json({ error: "Número ou PIN incorretos" });
      return;
    }

    const token = randomUUID();
    await db.update(usersTable)
      .set({ sessionToken: token })
      .where(eq(usersTable.id, rows[0]!.id));

    res.json({ user: toUserDTO(rows[0]!), token });
  } catch (err) {
    logger.error({ err }, "login failed");
    res.status(500).json({ error: "Erro ao fazer login" });
  }
});

// ─── me ─────────────────────────────────────────────────────────────────────

router.get("/user-auth/me", async (req, res) => {
  const token = bearerToken(req);
  if (!token) { res.status(401).json({ error: "Sem autorização" }); return; }

  try {
    const rows = await db.select(USER_COLS)
      .from(usersTable).where(eq(usersTable.sessionToken, token)).limit(1);

    if (rows.length === 0) { res.status(401).json({ error: "Sessão inválida" }); return; }
    res.json({ user: toUserDTO(rows[0]!) });
  } catch (err) {
    logger.error({ err }, "me failed");
    res.status(500).json({ error: "Erro interno" });
  }
});

// ─── logout ─────────────────────────────────────────────────────────────────

router.post("/user-auth/logout", async (req, res) => {
  const token = bearerToken(req);
  if (token) {
    try {
      await db.update(usersTable).set({ sessionToken: null })
        .where(eq(usersTable.sessionToken, token));
    } catch { /* ignore */ }
  }
  res.json({ ok: true });
});

// ─── handle check (public) ──────────────────────────────────────────────────
//
// A handle is considered available only when it is free in BOTH users.handle
// AND business_profiles.slug — claiming a slug that belongs to an existing
// business the caller doesn't own is a broken-access-control risk.
// (Pre-flight optimisation — the transaction is the canonical authority.)

router.get("/user-auth/handle/check", async (req, res) => {
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
// Minimal public info for the /u/:handle page: real display name + handle.
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
//     1. UPDATE users.handle — unique index rolls back the tx on conflict
//        (another user claimed this handle in a concurrent race → 409).
//     2. INSERT business_profiles (slug = handle) WITHOUT conflict suppression.
//        If the insert fails with 23505, it means the slug already exists.
//        Two sub-cases:
//          a. User is re-submitting their current handle (page refresh, etc.)
//             → the profile was already provisioned; safe to allow.
//          b. Another entity owns the slug (concurrent race or pre-existing biz)
//             → we throw a tagged error that rolls back the tx → 409.
//        Both cases are detected transactionally — no TOCTOU gap.

const handleSchema = z.object({
  handle: z.string().min(3).max(30).regex(/^[a-z0-9-]+$/, "Apenas letras minúsculas, números e hífens"),
});

// Tagged error used to surface slug conflicts from within the transaction.
class SlugConflictError extends Error {
  constructor() { super("slug_conflict"); this.name = "SlugConflictError"; }
}

router.put("/user-auth/handle", async (req, res) => {
  const token = bearerToken(req);
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
    // Load session + current handle (outside tx — needed to distinguish re-submission)
    const rows = await db.select({ id: usersTable.id, name: usersTable.name, handle: usersTable.handle })
      .from(usersTable).where(eq(usersTable.sessionToken, token)).limit(1);
    if (rows.length === 0) { res.status(401).json({ error: "Sessão inválida" }); return; }

    const userId        = rows[0]!.id;
    const userName      = rows[0]!.name;
    const currentHandle = rows[0]!.handle ?? null;

    // ── UX pre-flight (optimisation only — NOT relied on for correctness) ──
    const [takenByUser, takenByBiz] = await Promise.all([
      db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.handle, handle)).limit(1),
      db.select({ id: businessProfilesTable.id }).from(businessProfilesTable).where(eq(businessProfilesTable.slug, handle)).limit(1),
    ]);
    if (takenByUser.length > 0 && takenByUser[0]!.id !== userId) {
      res.status(409).json({ error: "Este handle já está a ser usado" });
      return;
    }
    if (takenByBiz.length > 0 && currentHandle !== handle) {
      res.status(409).json({ error: "Este handle já está em uso por um negócio existente" });
      return;
    }
    // ── end UX pre-flight ──

    // Atomic transaction: both succeed or neither does.
    const updated = await db.transaction(async (tx) => {
      // Step 1: update user handle.
      // Unique index on users.handle → rolls back & throws 23505 on race.
      const [user] = await tx.update(usersTable)
        .set({ handle })
        .where(eq(usersTable.id, userId))
        .returning(USER_COLS);

      // Step 2: provision business profile.
      // INSERT without conflict suppression so the constraint is enforced.
      try {
        await tx.insert(businessProfilesTable)
          .values({ slug: handle, name: userName });
      } catch (insertErr: unknown) {
        if (isPgUniqueViolation(insertErr)) {
          // Slug already exists. Only acceptable if the user is re-confirming
          // their current handle (profile already provisioned for them).
          if (currentHandle !== handle) {
            // A different entity owns this slug — conflict. Roll back the tx.
            throw new SlugConflictError();
          }
          // else: re-submission of same handle — profile already provisioned, OK.
        } else {
          throw insertErr; // unexpected DB error — bubble up
        }
      }

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
