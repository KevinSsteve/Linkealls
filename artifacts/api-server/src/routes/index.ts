import { Router, type IRouter } from "express";
import healthRouter from "./health";
import userAuthRouter from "./userAuth";
import storageRouter from "./storage";
import catalogRouter from "./catalog";
import { createBusinessScopedRouter } from "./businessScoped.js";
import businessesRouter from "./businesses.js";
import paymentsRouter from "./payments.js";
import replitAuthRouter from "./replitAuth.js";

const router: IRouter = Router();

// ── Multi-tenant scoped routes ───────────────────────────────────────────────
// All business-specific operations available at /api/b/:businessSlug/...
router.use("/b/:businessSlug", createBusinessScopedRouter());

// ── Platform-level public routes ─────────────────────────────────────────────
router.use(businessesRouter);
router.use(healthRouter);
router.use(replitAuthRouter);
router.use(userAuthRouter);
router.use(storageRouter);
router.use(catalogRouter); // public catalog by slug + slug availability check
router.use(paymentsRouter); // GPO webhook + simulation endpoint

// ── Legacy single-tenant routes — removed (410) ──────────────────────────────
// The old global endpoints all pointed to one shared business profile.
// Any lingering client gets an explicit 410 instead of shared data.
const GONE_PREFIXES = [
  "/business-profile",
  "/leads",
  "/assistant",
  "/campaigns",
  "/auth/pin",
  "/notifications",
];
for (const prefix of GONE_PREFIXES) {
  router.use(prefix, (_req, res) => {
    res.status(410).json({
      error: "Esta rota foi descontinuada. Usa /api/b/:businessSlug/… .",
    });
  });
}

export default router;
