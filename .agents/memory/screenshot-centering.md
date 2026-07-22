---
name: Screenshot captures ignore margin-inline (mx-auto)
description: Why centered layouts look left-aligned in screenshot verification and how to center reliably
---

The workspace screenshot capture renders `margin-inline: auto` (Tailwind `mx-auto`) as zero margin, so `max-w-* mx-auto` layouts appear left-aligned in captures even though the served CSS is correct and real browsers center fine.

**Why:** Verified empirically: `.mx-auto { margin-inline: auto }` was present in the served Tailwind v4 CSS, yet captures at 800px and 1280px showed content hugging the left edge; switching the parent to `flex justify-center` + child `w-full max-w-*` centered it in the very next capture with no other changes.

**How to apply:** When centering page content in this project, prefer `flex justify-center` on the wrapper with `w-full max-w-*` on the child. If a capture shows a left-hugging layout with `mx-auto`, don't chase phantom CSS bugs — either trust the CSS or switch to flex centering so screenshots verify correctly.
