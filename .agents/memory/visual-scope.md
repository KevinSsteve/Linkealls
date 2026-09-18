---
name: Visual scope
description: Defines which Linkealls surfaces share the warm product theme and which entry experiences must remain visually isolated.
---

Apply the warm cream, dark-ink, and green Linkealls language across public catalog/chat, owner operations, recovery, legal, legacy notices, and error states. Keep the landing page and the redesigned login, registration, business setup, and handle-selection experiences visually unchanged.

**Why:** A broad token replacement previously leaked into the deliberately excluded landing and entry flows. Those experiences have their own approved styling even though they share the same stylesheet.

**How to apply:** Scope future shared-token and global CSS changes carefully. Check both component diffs and selectors for landing or authentication leakage before completing product-wide visual work.