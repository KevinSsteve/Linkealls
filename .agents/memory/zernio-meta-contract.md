---
name: Zernio Meta Ads contract
description: Non-obvious Zernio Meta create-ad requirements used by Linkealls campaigns.
---

Zernio's Meta `POST /v1/ads/create` contract uses ODAX goal names such as `awareness`, `traffic`, `engagement`, and `lead_generation`; targeting fields are flat at the top level. City targeting requires an opaque city key and interest targeting requires `{ id, name }` objects resolved through Zernio lookup endpoints. Conversion-style goals need Meta promoted objects, so do not expose them in the simple campaign wizard until the app collects the required pixel, Page, app, or catalog configuration.

**Why:** The API accepts a different contract from the product-friendly labels and rejects free-form locations, interest names, nested targeting, or conversion goals without their promoted object.

**How to apply:** Keep product labels separate from gateway values, resolve friendly city/interest input immediately before real publication, and fail closed before payment for unsupported Meta objectives.