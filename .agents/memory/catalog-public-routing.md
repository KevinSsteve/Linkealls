---
name: Public catalog routing
description: Canonical short catalog URLs, reserved route names, and enabled empty-catalog behavior.
---

The public catalog canonical URL is `/<handle>`. Legacy `/e/<businessSlug>/catalogo` and custom `/c/<slug>` links remain supported for compatibility, while reserved application paths must never be claimable as handles.

An enabled catalog with a valid business name is public even when it has no products; the visitor sees an explicit empty-catalog message rather than an unavailable/inactive page.

**Why:** Short links are the product-facing sharing format, and treating an enabled but empty catalog as inactive made valid businesses appear broken.

**How to apply:** Use the handle resolver for canonical links, keep route ordering/reserved names synchronized when adding one-segment routes, and distinguish disabled, incomplete, and empty states in both owner and public UI.

## Independent catalog settings and profile drafts

Catalog visibility and aliases persist independently from the profile draft. A successful settings notification must only reconcile local state, not trigger a second full-profile save or reset the editor.

**Why:** Re-saving an old profile snapshot can overwrite newer data; remounting the editor discards unrelated contact or identity changes that the owner has not saved yet.

**How to apply:** Keep immediate settings operations on their dedicated guarded endpoints. Merge only the confirmed setting into the owner view while preserving the in-progress profile form.