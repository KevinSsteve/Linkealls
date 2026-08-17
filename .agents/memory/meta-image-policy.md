---
name: Meta image policy review
description: Offline Meta-ad policy baseline and fail-closed creative approval used by campaign image analysis.
---

The Meta campaign image flow keeps a versioned policy baseline in the server and asks Gemini to return detected text, detected objects, policy status, and policy issues in the same structured review.

**Why:** Image review must remain available without a documentation fetch, and a campaign should not be paid or published when the creative is rejected or still needs review.

**How to apply:** Preserve the stored policy version with each image analysis. Treat `approved` as the only publishable status, while allowing legacy campaigns without a stored review to retain their existing compatibility path.