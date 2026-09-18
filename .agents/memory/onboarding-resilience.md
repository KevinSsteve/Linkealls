---
name: Onboarding reliability
description: Availability is advisory; mutation errors and confirmed ownership take precedence during onboarding.
---

Never treat a successful availability check as a reservation. Do not cache handle
availability, and associate each asynchronous result with the exact candidate
checked. A mutation error must remain visible even when the previous check said
the candidate was available.

**Why:** A production signup repeatedly received a conflict while the UI kept
displaying “Disponível” and masked the failure. Source-only or API-bypassed signup
tests missed this interaction.

**How to apply:** Exercise actual PIN→recovery→onboarding→handle UI, including an
available-then-conflict response. A successful save updates authentication state;
all hooks must remain unconditional across this transition. Wait for initial
session verification before redirecting. A delayed initial session response must
not replace newer login/handle state.

Idempotent profile creation must not catch and swallow a unique violation inside
a PostgreSQL transaction: the transaction remains aborted.

**Why:** Retrying after an uncertain network result must confirm the same owned
handle without silently failing or adopting another business.

**How to apply:** Use a targeted conflict-safe insert and verify pre-existing
ownership transactionally; preserve atomic rollback for any other collision.

Business-source analysis during onboarding is a draft operation, not a live
profile update. Run it before asking for a handle; the authenticated account is
sufficient for analysis. Only explicit review and save may change the profile.

**Why:** Deferring analysis until the owner dashboard made “Analisar o site”
appear not to work, required an unexpected second PIN, and the old background
analysis persisted results before the promised review.

**How to apply:** Reuse extraction without its persistence side effects. Retain
the account-scoped extracted draft through navigation/reload until save succeeds.
An accepted, unchanged AI draft is still unsaved and must offer a save action.
Uploaded screenshots are analysis inputs, not automatic public profile photos.