import { Router } from "express";
import {
  getVapidPublicKey,
  saveSubscription,
  removeSubscription,
} from "../services/notifications.js";

const router = Router();

/** GET /notifications/vapid-public-key — returns the VAPID public key for the browser. */
router.get("/notifications/vapid-public-key", (_req, res) => {
  const key = getVapidPublicKey();
  if (!key) {
    res.status(503).json({ error: "Push notifications not configured" });
    return;
  }
  res.json({ key });
});

/** POST /notifications/subscribe — stores a PushSubscription from the browser. */
router.post("/notifications/subscribe", async (req, res) => {
  const sub = req.body as {
    endpoint?: string;
    expirationTime?: number | null;
    keys?: { p256dh: string; auth: string };
  };

  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    res.status(400).json({ error: "Invalid subscription object" });
    return;
  }

  // Shape is now validated — cast to the concrete type
  await saveSubscription({
    endpoint: sub.endpoint,
    expirationTime: sub.expirationTime ?? null,
    keys: sub.keys,
  });
  res.json({ ok: true });
});

/** DELETE /notifications/unsubscribe — removes a subscription by endpoint. */
router.delete("/notifications/unsubscribe", async (req, res) => {
  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) {
    res.status(400).json({ error: "endpoint required" });
    return;
  }
  await removeSubscription(endpoint);
  res.json({ ok: true });
});

export default router;
