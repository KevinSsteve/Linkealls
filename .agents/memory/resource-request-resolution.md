---
name: Resource request resolution
description: Durable rules for resolving visitor requests for approved media or missing resources.
---

Approved images, videos, documents and details may be shown only when they are public, approved, valid, and scoped to the current business. The model can describe the availability, but the application owns the actual resource link and rendering.

**Why:** A visitor request can overlap with contact consent or a purchase. Replacing the whole message with a contact marker, or claiming that a team member will send something, loses intent and creates an unverified promise.

**How to apply:** Redact only phone candidates before model/persistence, keep the rest of the commercial request, persist a pending proposal for missing resources, and create the owner request only after a compatible explicit confirmation. Make the owner request tenant-scoped and idempotent.