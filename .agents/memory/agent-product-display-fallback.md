---
name: Agent product display fallback
description: Product cards must not depend solely on Gemini emitting a function call.
---

The chat and call surfaces need a server-side product-intent fallback because a multimodal/live model can answer by text or audio without invoking `show_product_catalog`.

**Why:** Tool calls are model decisions, so relying only on the tool event makes product cards disappear even when the customer clearly asks about products.

**How to apply:** Return or emit matched catalog cards from the server when product intent is detected, while keeping the Gemini tool for precise filtering. Keep the UI connected to both normal-chat and call product state.