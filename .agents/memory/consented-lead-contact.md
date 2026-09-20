---
name: Consented lead contact
description: Privacy and attribution rules for visitor phone capture and WhatsApp handoff.
---

Treat a visitor's business follow-up phone as its own consent domain. It must never be populated from checkout payment data or from AI-extracted call fields, and refusal must not block the conversation.

**Why:** Payment authorization, free-form conversation extraction, and permission for a business to follow up are different purposes. Combining them creates misleading consent and cross-feature data leakage.

**How to apply:** Normalize and validate Angolan mobile numbers only after an explicit purpose statement and visitor action. Build WhatsApp destinations from the business's validated public number on the server. Keep visitor capabilities, lead IDs, and private phones out of handoff URLs; attribute clicks through a capability-protected tenant-scoped endpoint.