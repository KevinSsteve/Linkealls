---
name: pg Pool needs an error handler in production
description: Why the shared node-postgres Pool must have pool.on('error') and idle timeouts on Neon/autoscale
---

The shared `pg` Pool must always register `pool.on("error", ...)` and set `idleTimeoutMillis` below the server's idle cutoff.

**Why:** A production publish failed at the promote step: Neon terminated an idle connection, `pg` emitted an unhandled `'error'` event, the Node process crashed, and health probes got 500 on every route (including ones that never touch the DB). Dev never reproduces this because dev connections aren't idle-terminated the same way.

**How to apply:** Any new DB client/pool (in lib/db or elsewhere) needs the error handler + idle timeout. Symptom signature: publish fails "waiting for service to be ready", healthcheck 500s on all paths, and a raw pg client object dump in deployment logs.
