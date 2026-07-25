/**
 * Owner PIN authentication routes.
 * The PIN is stored as a SHA-256 hex digest so the raw value is never persisted.
 */
import { Router, type Request, type Response } from "express";
import { createHash } from "crypto";
import { db, businessProfilesTable } from "@workspace/db";
import { logger } from "../lib/logger.js";

const router = Router();

function hashPin(pin: string): string {
  return createHash("sha256").update(pin).digest("hex");
}

async function getPin(): Promise<string | null> {
  const rows = await db.select({ ownerPin: businessProfilesTable.ownerPin }).from(businessProfilesTable).limit(1);
  return rows[0]?.ownerPin ?? null;
}

// ─── POST /auth/pin/verify ─────────────────────────────────────────────────

router.post("/auth/pin/verify", async (req: Request, res: Response) => {
  const pin = String(req.body?.pin ?? "").trim();
  if (!pin) { res.status(400).json({ ok: false, error: "PIN obrigatório" }); return; }

  try {
    const stored = await getPin();
    if (!stored) {
      // No PIN configured yet — let the first attempt set it
      res.json({ ok: false, noPin: true });
      return;
    }
    const ok = hashPin(pin) === stored;
    res.json({ ok });
  } catch (err) {
    logger.error({ err }, "Failed to verify PIN");
    res.status(500).json({ ok: false, error: "Erro interno" });
  }
});

// ─── POST /auth/pin/set ────────────────────────────────────────────────────

router.post("/auth/pin/set", async (req: Request, res: Response) => {
  const pin = String(req.body?.pin ?? "").trim();
  if (!pin || pin.length < 4) {
    res.status(400).json({ ok: false, error: "O PIN deve ter pelo menos 4 dígitos" });
    return;
  }

  // Require current PIN if one is already set (and the request includes it)
  const currentPin = String(req.body?.currentPin ?? "").trim();

  try {
    const stored = await getPin();
    if (stored && !currentPin) {
      res.status(403).json({ ok: false, error: "PIN actual obrigatório para alterar" });
      return;
    }
    if (stored && hashPin(currentPin) !== stored) {
      res.status(403).json({ ok: false, error: "PIN actual incorreto" });
      return;
    }

    // Upsert the profile row with the new PIN
    const rows = await db.select({ id: businessProfilesTable.id }).from(businessProfilesTable).limit(1);
    if (rows.length === 0) {
      await db.insert(businessProfilesTable).values({ ownerPin: hashPin(pin) });
    } else {
      const { eq } = await import("drizzle-orm");
      await db.update(businessProfilesTable).set({ ownerPin: hashPin(pin) }).where(eq(businessProfilesTable.id, rows[0]!.id));
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to set PIN");
    res.status(500).json({ ok: false, error: "Erro interno" });
  }
});

// ─── GET /auth/pin/status ──────────────────────────────────────────────────

router.get("/auth/pin/status", async (_req: Request, res: Response) => {
  try {
    const stored = await getPin();
    res.json({ hasPin: !!stored });
  } catch (err) {
    logger.error({ err }, "Failed to check PIN status");
    res.status(500).json({ hasPin: false });
  }
});

export default router;
