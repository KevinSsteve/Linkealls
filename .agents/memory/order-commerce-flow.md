---
name: Order commerce flow
description: Durable rules for keeping Linkealls orders, conversations, follow-up, and payment proofs consistent.
---

Keep gateway payment status separate from operational fulfillment status. A confirmed payment should create an auditable order event, update the linked conversation with the next action, and notify the owner; retries must not duplicate wallet credits or follow-up messages.

**Why:** Payment completion is not delivery completion, and the owner needs a live process rather than a financial list.

**How to apply:** Add new order behavior through the order event timeline and conversation context. Keep customer proof files under a dedicated private object prefix and expose them only through owner-authorized download routes.