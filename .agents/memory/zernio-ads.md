---
name: Zernio real ads decisions
description: Durable money-safety decisions for the campaign real-ads pipeline
---

- Simulated payment paths are opt-in to `NODE_ENV === "development"` only. **Why:** an unset NODE_ENV in a deploy must block charges, never accept real money for fake ads. **How to apply:** any new payment/settlement bypass must check for explicit development, not "not production".
- Every prerequisite for publishing (gateway credentials, per-channel house accounts, public base URL, creative generation config) is verified BEFORE any debit/charge. Owners must never be charged into a flow that cannot complete.
- GPO charge attempts are recorded immutably per merchant transaction id (attempts table); retries create new rows so delayed success webhooks are always matched — a late duplicate payment is flagged loudly for refund, never dropped.
- Unknown charge outcomes stay pending (never marked failed); a definitive paid callback may override a locally-recorded failure.
- Campaign budget is funded in whole USD, floored, and quoted to the owner as exactly that amount; budget/duration become immutable once payment starts.
- Ad lifetime counts from actual publication; when ending a window locally, cancel the remote ad first.
