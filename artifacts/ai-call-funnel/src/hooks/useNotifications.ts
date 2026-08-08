import { useState, useEffect, useCallback } from "react";
import { businessApi } from "../lib/api";

const BASE = import.meta.env.BASE_URL;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export type NotifStatus = "unsupported" | "denied" | "subscribed" | "unsubscribed" | "loading";

/** Web-push subscription hook, scoped to a business (owner panel). */
export function useNotifications(businessSlug: string) {
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

      // Fetch VAPID public key (business-scoped route)
      const { vapidPublicKey } = await businessApi(businessSlug).getVapidPublicKey();

      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }

      // Subscribe with PushManager
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as ArrayBuffer,
      });

      // Send subscription to server
      await businessApi(businessSlug).subscribePush(sub.toJSON());

      setStatus("subscribed");
    } catch (err) {
      console.error("Push subscription failed:", err);
      setStatus("unsubscribed");
    }
  }, [businessSlug]);

  const unsubscribe = useCallback(async () => {
    setStatus("loading");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await businessApi(businessSlug).unsubscribePush(sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("unsubscribed");
    } catch {
      setStatus("unsubscribed");
    }
  }, [businessSlug]);

  return { status, subscribe, unsubscribe };
}
