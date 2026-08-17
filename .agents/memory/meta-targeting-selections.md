---
name: Meta targeting selections
description: Durable rule for location and interest targeting in Meta campaign flows.
---

The campaign wizard must save the user-facing label together with the opaque Meta/Zernio identifier. The publish path must query the provider again and only send a stored identifier when it still matches a valid provider result; never trust free-form labels or client-supplied IDs alone.

**Why:** Meta targeting accepts provider identifiers rather than arbitrary city or interest text, and stale or invented values can make publication fail or target the wrong audience.

**How to apply:** Any new audience dimension should use authenticated provider-backed suggestions, persist label + ID, show loading/empty/error states, and fail closed when a required selection has no valid ID.