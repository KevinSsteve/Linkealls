/**
 * User authentication routes — phone + PIN, no SMS verification.
 *
 * POST /user-auth/register          { phone, name, pin }  → { user, token }
 * POST /user-auth/login             { phone, pin }         → { user, token }
 * GET  /user-auth/me                                       → { user }          (bearer)
 * POST /user-auth/logout                                   → 200               (bearer)
 * GET  /user-auth/handle/check?handle=xxx                  → { available }     (public)
 * PUT  /user-auth/handle            { handle }             → { user }          (bearer)
 */
import { Router } from "express";
import { createHash, randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, usersTable } from "@workspace/db";
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
    const [user] = await db.insert(usersTable).values({
      phone,
      name,
      pinHash:      hashPin(pin),
      sessionToken: token,
    }).returning({
      id: usersTable.id, phone: usersTable.phone,
      name: usersTable.name, handle: usersTable.handle,
    });

    res.status(201).json({ user, token });
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

    res.json({
      user: {
        id:     rows[0]!.id,
        phone:  rows[0]!.phone,
        name:   rows[0]!.name,
        handle: rows[0]!.handle ?? null,
      },
      token,
    });
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
    const rows = await db.select({
      id: usersTable.id, phone: usersTable.phone,
      name: usersTable.name, handle: usersTable.handle,
    }).from(usersTable).where(eq(usersTable.sessionToken, token)).limit(1);

    if (rows.length === 0) { res.status(401).json({ error: "Sessão inválida" }); return; }
    res.json({ user: { ...rows[0]!, handle: rows[0]!.handle ?? null } });
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
    // Verify session
    const rows = await db.select({ id: usersTable.id })
      .from(usersTable).where(eq(usersTable.sessionToken, token)).limit(1);
    if (rows.length === 0) { res.status(401).json({ error: "Sessão inválida" }); return; }

    // Check uniqueness
    const taken = await db.select({ id: usersTable.id })
      .from(usersTable).where(eq(usersTable.handle, handle)).limit(1);
    if (taken.length > 0 && taken[0]!.id !== rows[0]!.id) {
      res.status(409).json({ error: "Este handle já está a ser usado" });
      return;
    }

    const [updated] = await db.update(usersTable)
      .set({ handle })
      .where(eq(usersTable.id, rows[0]!.id))
      .returning({
        id: usersTable.id, phone: usersTable.phone,
        name: usersTable.name, handle: usersTable.handle,
      });

    res.json({ user: { ...updated!, handle: updated!.handle ?? null } });
  } catch (err) {
    logger.error({ err }, "set handle failed");
    res.status(500).json({ error: "Erro ao guardar handle" });
  }
});

export default router;
