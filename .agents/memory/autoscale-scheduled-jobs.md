---
name: Autoscale scheduled jobs
description: Prevent duplicate cron-like work when the API has multiple replicas.
---

Any timer started inside the API process must acquire a transaction-scoped PostgreSQL advisory lock before executing work that sends notifications, calls providers, or changes state.

**Why:** Autoscale can run several API replicas, and process-local flags do not prevent every replica from executing the same timer.

**How to apply:** Use a stable job name for the distributed lock, keep the work idempotent, log failures, and only record a local run as complete after the lock holder finishes successfully.