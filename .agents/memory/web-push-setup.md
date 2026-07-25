---
name: Web Push Setup
description: How Web Push notifications are wired up in this project (VAPID, service worker, subscription storage, daily cron).
---

## Setup
- VAPID keys stored as env secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- `pushSubscriptions jsonb[]` column added to `business_profiles` via drizzle schema; rebuild + push required after schema change

## Backend
- `artifacts/api-server/src/services/notifications.ts` — VAPID init, `saveSubscription`, `removeSubscription`, `sendPushToOwner`, `startDailySummaryCron`
- `artifacts/api-server/src/routes/notifications.ts` — `GET /notifications/vapid-public-key`, `POST /notifications/subscribe`, `DELETE /notifications/unsubscribe`
- `startDailySummaryCron()` called in `src/index.ts` inside `server.listen` callback; uses `setInterval(60s)` checking Angola WAT (UTC+1) at 08:00
- `processCallCompletion` in `leads.ts` calls `sendPushToOwner` when `score >= 60` (lead qualificado)

## Frontend
- `artifacts/ai-call-funnel/public/sw.js` — service worker registered at artifact `BASE_URL` scope; handles `push` + `notificationclick`
- `artifacts/ai-call-funnel/src/hooks/useNotifications.ts` — `useNotifications()` returns `{ status, subscribe, unsubscribe }`; status is `unsupported | denied | subscribed | unsubscribed | loading`
- `NotificationsSection` component rendered inside `ProfileEditor.tsx` between "Qualificação" and "Testar chamada" sections

## TypeScript quirks
- `Uint8Array<ArrayBufferLike>` not assignable to `applicationServerKey` — cast via `as unknown as ArrayBuffer`
- Route body typed as `endpoint?: string` — validate presence first, then construct concrete `PushSubscriptionJSON` object for `saveSubscription`

**Why:** Web Push requires VAPID keys set before `webPush.sendNotification` is called; stale subscriptions (410/404) must be pruned from the DB or next send fails.
