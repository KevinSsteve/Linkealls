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