---
name: Account deletion
description: Rules for self-service deletion of Linkealls accounts and business data.
---

Account deletion must be initiated by the authenticated user session and must stop when a gateway operation is pending. Deleting an account also removes its public business space and operational data, so the UI requires an explicit APAGAR confirmation.

**Why:** Development and production data are isolated, and direct production edits are not available to the agent; users need a safe in-app path for their own accounts.

**How to apply:** Keep deletion transactional, invalidate the local session after success, and never expose an unauthenticated deletion or admin-style phone-number deletion endpoint.