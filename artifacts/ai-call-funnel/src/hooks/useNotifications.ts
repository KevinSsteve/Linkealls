import { useState, useEffect, useCallback } from "react";

const BASE = import.meta.env.BASE_URL;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export type NotifStatus = "unsupported" | "denied" | "subscribed" | "unsubscribed" | "loading";

export function useNotifications() {
  const [status, setStatus] = useState<NotifStatus>("loading");

  // Detect support + current permission on mount
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    // Check if already subscribed
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        setStatus(sub ? "subscribed" : "unsubscribed");
      })
      .catch(() => setStatus("unsubscribed"));
  }, []);

  const subscribe = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return;
    setStatus("loading");
    try {
      // Register service worker
      const reg = await navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE });
      await navigator.serviceWorker.ready;

      // Fetch VAPID public key
      const keyRes = await fetch(`${BASE}api/notifications/vapid-public-key`);
      if (!keyRes.ok) throw new Error("VAPID key unavailable");
      const { key } = (await keyRes.json()) as { key: string };

      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }

      // Subscribe with PushManager
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as unknown as ArrayBuffer,
      });

      // Send subscription to server
      await fetch(`${BASE}api/notifications/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });

      setStatus("subscribed");
    } catch (err) {
      console.error("Push subscription failed:", err);
      setStatus("unsubscribed");
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setStatus("loading");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(`${BASE}api/notifications/unsubscribe`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("unsubscribed");
    } catch {
      setStatus("unsubscribed");
    }
  }, []);

  return { status, subscribe, unsubscribe };
}
