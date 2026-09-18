---
name: Owner nav pattern
description: How the bottom nav is implemented across all owner pages and the layout constraint for sub-detail views.
---

## Rule
Keep owner navigation consistent at the bottom of owner pages; obtain the current
tabs and destinations from the component rather than retaining an old route list.

**Why:** The old approach put nav links in Owner.tsx's header — they overflowed on small screens and disappeared when navigating to sub-pages.

## Layout constraint
When a sub-detail view (e.g. LeadDetail, CampaignDetail) is rendered inside a `flex flex-col h-full` parent alongside `<OwnerNav />`, the detail component's root div must be `flex flex-col flex-1 min-h-0` — NOT `h-full`. Using `h-full` causes it to ignore the sibling OwnerNav and overflow.

## How to apply
- Keep navigation outside the page's scrollable content, as the last child of its flex column.
- Let owner roots and nested details share the height supplied by the app shell. Do not add a separate `100dvh` height to a descendant.
- **Why:** The shell follows the visual viewport when a mobile keyboard opens. A descendant that fixes itself to the full screen can ignore that smaller available height and hide navigation or actions.
- Use shrinkable flex children with `min-height: 0`; give only the content region vertical scrolling. Preserve the current theme rather than imposing an old dark background.
