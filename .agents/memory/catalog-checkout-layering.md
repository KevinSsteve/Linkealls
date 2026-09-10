---
name: Catalog checkout layering
description: Stacking and positioning constraint for the public catalog checkout modal.
---

The public catalog checkout overlay must remain `position: fixed` with a high z-index when rendered as a direct child of the catalog page.

**Why:** The catalog page uses a broad direct-child layering rule for visual content. Without an explicit checkout exception, that rule overrides the modal's fixed positioning and makes the purchase button appear unresponsive because the modal is rendered as normal page content.

**How to apply:** Any future catalog overlay or modal must use a dedicated class with an explicit fixed-position/z-index exception after the page layering rule. Keep visitor-facing catalog text selectable, including visible button labels.