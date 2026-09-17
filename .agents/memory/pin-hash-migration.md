---
name: PIN hash migration
description: Security and compatibility rule for storing short numeric PINs.
---

Account and business PINs use a versioned, salted scrypt representation. Verification may accept the legacy SHA-256 representation only to authenticate an existing user, then immediately replace it with the current scrypt format.

**Why:** Four-digit PINs have only 10,000 possibilities, so a fast unsalted hash provides almost no protection after a database leak. A transparent upgrade preserves existing accounts without a forced reset.

**How to apply:** New or changed PINs must always use the current slow hash. Keep legacy verification isolated in the shared PIN helper, upgrade only after a valid comparison, and rate-limit online verification separately.