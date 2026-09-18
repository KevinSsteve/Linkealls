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
- Any new owner page: wrap in `flex flex-col h-full bg-[#080E18]`, put `<OwnerNav />` as the last child.
- Any sub-detail component that fills remaining space: use `flex flex-col flex-1 min-h-0` on its root div.
- `scrollable content area: flex-1 overflow-y-auto min-h-0`
