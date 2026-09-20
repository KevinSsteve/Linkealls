---
name: Visitor access decisions
description: Compatibility and key lifecycle for private visitor conversations and orders.
---

Do not restore UUID-only access to conversations or order proof routes to accommodate old clients. Existing UUID links without the separate authorization cannot establish ownership.

**Why:** A leaked locator previously allowed cross-order proof association and indefinite access to conversations. Compatibility must not recreate that exposure.

**How to apply:** Keep visitor authorization distinct from owner cookie sessions and validate scope, tenant, expiry and object association. Voice authentication must precede provider connections and lead mutations.

Visitor signatures use an optional dedicated secret or a domain-separated derivation from the existing shared session secret.

**Why:** A new mandatory secret would otherwise break an existing deployment; random per-process keys would fail across autoscale replicas.

**How to apply:** Fail closed if configured keys are invalid. Rotating the dedicated key, or the session secret when it supplies the derived key, invalidates outstanding visitor capabilities; coordinate rotation accordingly.

Same-device conversation recovery uses a signed, family-bound HttpOnly token. The server stores the non-secret family ID, expiry, and revocation state; JavaScript-readable visitor capabilities remain session-only.

**Why:** Durable bearer tokens in URLs or localStorage expose private conversations through history, referrers, sharing, or XSS. Rotating a healthy recovery token on every request also makes simultaneous tab restores race and invalidate each other.

**How to apply:** Never persist visitor capabilities in durable JavaScript storage. Keep recovery cookies SameSite, expiring, rotating, and revocable; validate signature, family, tenant, lead, and expiry before issuing a fresh short-lived capability. Paid-click idempotency keys may coordinate tabs only for a few seconds and must never reopen an older conversation.