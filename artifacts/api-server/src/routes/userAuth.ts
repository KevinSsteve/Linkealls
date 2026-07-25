/**
 * User authentication routes — phone + PIN, no SMS verification.
 *
 * POST /user-auth/register  { phone, name, pin }  → { user, token }
 * POST /user-auth/login     { phone, pin }         → { user, token }
 * GET  /user-auth/me                               → { user }          (bearer token)
 * POST /user-auth/logout                           → 200               (bearer token)
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
  // strip spaces / dashes, ensure +244 prefix
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("244")) return `+${digits}`;
  if (digits.startsWith("9") && digits.length === 9) return `+244${digits}`;
  return `+${digits}`;
}

function bearerToken(req: { headers: { authorization?: string } }) {
  const h = req.headers.authorization ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
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
    // check duplicate
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
    }).returning({ id: usersTable.id, phone: usersTable.phone, name: usersTable.name });

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
      user:  { id: rows[0]!.id, phone: rows[0]!.phone, name: rows[0]!.name },
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
    const rows = await db.select({ id: usersTable.id, phone: usersTable.phone, name: usersTable.name })
      .from(usersTable).where(eq(usersTable.sessionToken, token)).limit(1);

    if (rows.length === 0) { res.status(401).json({ error: "Sessão inválida" }); return; }
    res.json({ user: rows[0] });
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

export default router;
