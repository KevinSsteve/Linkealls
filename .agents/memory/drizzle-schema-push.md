---
name: Drizzle schema push guardrail
description: Safe handling of Drizzle schema drift when an unrelated constraint change asks to truncate existing data.
---

When `drizzle-kit push` stops because an unrelated unique constraint would require truncating populated data, do not use `push-force` or accept truncation just to apply a separate schema change. Apply only the narrowly required development DDL through the database workflow, then resolve the unrelated schema drift deliberately.

**Why:** The project contains existing payout data, and the non-interactive workflow cannot answer the destructive prompt safely.

**How to apply:** Before any future schema push, inspect the proposed diff. Separate safe additive changes from unrelated destructive/index changes and never run a force push without explicit approval and a verified backup/reconciliation plan.