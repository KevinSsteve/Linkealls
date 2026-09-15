---
name: Generated image ratios
description: How to handle campaign images when the generator ignores requested aspect ratios.
---

Treat a requested aspect ratio in an image prompt as composition guidance, not a guaranteed output dimension. Preserve the square original, then create an explicit crop for the final slot without stretching the image.

**Why:** The campaign generator can return a square source even when the prompt repeatedly specifies a wide or vertical ratio. Letting CSS perform an unreviewed `object-fit: cover` crop can remove the intended subject or product.

**How to apply:** Ask for safe negative space in the prompt, inspect the original, create and review a crop matching the actual UI slot, and keep both original and final versions when the image may need to be regenerated or repositioned later.