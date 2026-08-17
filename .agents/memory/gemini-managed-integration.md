---
name: Managed Gemini credits
description: Provider decision for Linkealls campaign creative generation
---

The Meta campaign creative flow uses the Replit-managed Gemini integration and Replit credits for both creative planning and image generation. It must not depend on the owner's direct `GEMINI_API_KEY` for those two steps.

**Why:** The direct Google key reached a zero Free Tier image quota, while the Replit-managed provider is the supported billing path for this project.

**How to apply:** Keep the managed Gemini client as the provider for Meta text/image creative work. Treat direct Google Gemini as a separate legacy dependency for Veo/TikTok until video support is deliberately migrated.