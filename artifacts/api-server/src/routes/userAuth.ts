/**
 * User authentication routes — phone + PIN, no SMS verification.
 *
 * POST /user-auth/register               { phone, name, pin }      → { user, token }
 * POST /user-auth/login                  { phone, pin }             → { user, token }
 * GET  /user-auth/me                                                 → { user }   (bearer)
 * POST /user-auth/logout                                             → 200        (bearer)
 * GET  /user-auth/handle/check?handle=                              → { available }
 * PUT  /user-auth/handle                 { handle }                 → { user }   (bearer)
 * PUT  /user-auth/owned-slug             { slug, pin }              → { user }   (bearer)
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

function normaliseHandle(raw: string) {
  return raw.trim().toLowerCase();
}

/** Columns returned in every user response (no sensitive fields). */
const USER_COLS = {
  id:        usersTable.id,
  phone:     usersTable.phone,
  name:      usersTable.name,
  handle:    usersTable.handle,
  ownedSlug: usersTable.ownedSlug,
} as const;

function toUserDTO(row: { id: string; phone: string; name: string; handle: string | null; ownedSlug: string | null }) {
  return {
    id:        row.id,
    phone:     row.phone,
    name:      row.name,
    handle:    row.handle   ?? null,
    ownedSlug: row.ownedSlug ?? null,
  };
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

router.get("/user-auth/handle/check", async (req, res) => {
  const raw = (req.query.handle as string | undefined) ?? "";
  const handle = normaliseHandle(raw);

  if (!HANDLE_RE.test(handle)) {
    res.json({ available: false, reason: "Formato inválido (3-30 letras, números ou hífens)" });
    return;
  }

  try {
    const rows = await db.select({ id: usersTable.id })
      .from(usersTable).where(eq(usersTable.handle, handle)).limit(1);
    res.json({ available: rows.length === 0 });
  } catch (err) {
    logger.error({ err }, "handle check failed");
    res.status(500).json({ error: "Erro interno" });
  }
});

// ─── set / update handle (authenticated) ────────────────────────────────────

const handleSchema = z.object({
  handle: z.string().min(3).max(30).regex(/^[a-z0-9-]+$/, "Apenas letras minúsculas, números e hífens"),
});

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

  try {
    const rows = await db.select({ id: usersTable.id })
      .from(usersTable).where(eq(usersTable.sessionToken, token)).limit(1);
    if (rows.length === 0) { res.status(401).json({ error: "Sessão inválida" }); return; }

    const taken = await db.select({ id: usersTable.id })
      .from(usersTable).where(eq(usersTable.handle, handle)).limit(1);
    if (taken.length > 0 && taken[0]!.id !== rows[0]!.id) {
      res.status(409).json({ error: "Este handle já está a ser usado" });
      return;
    }

    const [updated] = await db.update(usersTable)
      .set({ handle })
      .where(eq(usersTable.id, rows[0]!.id))
      .returning(USER_COLS);

    res.json({ user: toUserDTO(updated!) });
  } catch (err) {
    logger.error({ err }, "set handle failed");
    res.status(500).json({ error: "Erro ao guardar handle" });
  }
});

// ─── link business (authenticated) ─────────────────────────────────────────
//
// Verifies that the user knows the business owner PIN, then saves owned_slug.

const linkBusinessSchema = z.object({
  slug: z.string().min(1).max(80),
  pin:  z.string().length(4).regex(/^\d{4}$/),
});

router.put("/user-auth/owned-slug", async (req, res) => {
  const token = bearerToken(req);
  if (!token) { res.status(401).json({ error: "Sem autorização" }); return; }

  const parse = linkBusinessSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Slug e PIN são obrigatórios" });
    return;
  }
  const { slug, pin } = parse.data;

  try {
    // Verify user session
    const userRows = await db.select({ id: usersTable.id })
      .from(usersTable).where(eq(usersTable.sessionToken, token)).limit(1);
    if (userRows.length === 0) { res.status(401).json({ error: "Sessão inválida" }); return; }

    // Find business by slug
    const bizRows = await db.select({ id: businessProfilesTable.id, ownerPin: businessProfilesTable.ownerPin })
      .from(businessProfilesTable)
      .where(eq(businessProfilesTable.slug, slug))
      .limit(1);

    if (bizRows.length === 0) {
      res.status(404).json({ error: "Negócio não encontrado. Verifica o slug." });
      return;
    }

    const biz = bizRows[0]!;
    if (!biz.ownerPin || biz.ownerPin !== hashPin(pin)) {
      res.status(401).json({ error: "PIN do negócio incorreto." });
      return;
    }

    // Save owned_slug
    const [updated] = await db.update(usersTable)
      .set({ ownedSlug: slug })
      .where(eq(usersTable.id, userRows[0]!.id))
      .returning(USER_COLS);

    res.json({ user: toUserDTO(updated!) });
  } catch (err) {
    logger.error({ err }, "link business failed");
    res.status(500).json({ error: "Erro ao vincular negócio" });
  }
});

export default router;
