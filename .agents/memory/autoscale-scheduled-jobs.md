---
name: Autoscale scheduled jobs
description: Prevent duplicate cron-like work when the API has multiple replicas.
---

Scheduled work needs a durable unique claim for its logical period, not just an advisory lock.

**Why:** An advisory lock prevents overlap only. A second replica can acquire it after the first finishes and repeat the same daily notification or interval sync.

**How to apply:** Claim the job/period before external side effects. This deliberately chooses at-most-once delivery: a crash after claiming can skip that period. Reliable retry requires an outbox and provider idempotency, not merely deleting a failed claim. Do not apply this notification policy to financial reconciliation.