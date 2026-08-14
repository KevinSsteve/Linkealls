---
name: Multicaixa Express payments invariants
description: Money-handling rules for the e-kwanza/AppyPay GPO integration (orders, wallet, payouts, plan)
---

Rules that must survive any future change to payments code:

- **Balance is always derived** from `SUM(wallet_ledger.amount)`; never add a mutable balance column. Serialize per-business balance checks with `pg_advisory_xact_lock(917001, businessId)` (aggregates can't be `FOR UPDATE`). Subscription renewal uses lock key `917002`.
- **Settlement is one transaction**: status transition (pendente→paga) + ledger credit must commit together; retries repair a lost credit via the unique index on `wallet_ledger.order_id` + `onConflictDoNothing`.
- **Payout unknown outcome ≠ failure**: on gateway timeout/network error keep the payout `pendente` (debit retained) and reconcile later; only refund (`estorno_saque`) after an authoritative rejection. Refunding on timeout is a double-spend.
- **Webhook fail-closed**: real-mode callbacks require a valid HMAC x-signature (timingSafeEqual); merchant identifier is public info, not auth. In simulation mode real webhooks get 401 and `/payments/simulate/pay` is the only settlement path.
- **Gateway field rules (found via real 401/400s):** `merchantTransactionId` max 15 chars, alphanumeric only (no dashes); `paymentMethod` must carry the `GPO_` prefix (the portal shows only the GUID — code normalizes). A bad paymentMethod yields an opaque 401 `{"error":"UNKNOWN"}`, not a validation message. `description` is also strict (400 INVALID_FORMAT on colons/accents/spaces) — sanitize to `[A-Za-z0-9_]`, ≤40 chars.
- **POST /charges is synchronous**: it blocks up to ~60s until the buyer approves/declines; the 200 response's `responseStatus.successful` is the final outcome — settle/fail immediately from it, don't wait only for the webhook (code 211 = buyer didn't approve in time).
- Simulation mode = any of APPYPAY_CLIENT_ID/SECRET/RESOURCE or EKWANZA_GPO_PAYMENT_METHOD missing; going live also needs EKWANZA_API_KEY/NOTIFICATION_TOKEN/PARTNER_REGISTRATION for webhook verification.

**Why:** each rule maps to a concrete failure found in review (forged settlement, lost credit on crash, timeout double-spend, renewal race).
**How to apply:** any edit to services/payments.ts, routes/payments.ts, or ekwanza.ts must preserve these; test with the curl simulation flow (create order → simulate/pay twice → single ledger row).
