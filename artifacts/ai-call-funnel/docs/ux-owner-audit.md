# Owner UX Audit & Improvements

## Scope
Audited all active owner routes (`/owner/*`) inside the `ai-call-funnel` artifact to ensure they meet the "mobile-first UI/UX" requirements without breaking features or logic. No underlying operations (prices, states, payments, API methods) were modified.

## Pages Reviewed
- `Owner.tsx` (Profile root, identity edit, nested form logic)
- `Leads.tsx` (Leads directory and `LeadDetail` view)
- `Conversas.tsx` (Conversations directory and `ConversationDetail` view)
- `Assistant.tsx` (AI Assistant config, transcript and test interface)
- `Campaigns.tsx` & `CampaignDetail.tsx` (Read-only advertising history)
- `Mercado.tsx` (Business catalog search)
- `Vendas.tsx` (Paid order tracking)
- `Comercio.tsx` (Order fulfillment and proofs)
- `Carteira.tsx` (Wallet management, statement and payouts)
- `Plano.tsx` (Subscription dashboard)

## Changes Implemented

### 1. New Design Primitives (`owner-ux.css`)
Created a dedicated stylesheet to standardise UI components:
- `.owner-view-root`: Standard view wrapper adopting flex column layout to adapt gracefully to different safe area insets and the presence/absence of `OwnerNav`. Replaces ad-hoc implementations of `flex flex-col h-full bg-[#...]`.
- `.owner-content-scroll`: Safe flex-1 scrollable area applying `overscroll-behavior-y: contain` (prevents whole-page bounce on iOS) and respecting `env(safe-area-inset-bottom)`.
- `.owner-header`: Sticky headers equipped with native safe-area offsets (`env(safe-area-inset-top)`).
- `.owner-header-back`: A minimum `44px x 44px` tappable area for mobile return actions.
- Empty states (`.owner-state-container`): Centralized, consistent visual language for null-result views (e.g. empty lists).

### 2. Layout Structure Updates
Updated root and scrollable containers across the board to use `.owner-view-root` and `.owner-content-scroll`. This resolves layout conflicts and ensures nested detail views (like `LeadDetail`, `ConversationDetail`) don't stretch unpredictably or overflow the bottom navigation bar (`OwnerNav`).

- **Owner.tsx**: Cleaned up the root and main scrollable logic. Eliminated redundant internal `<EditorIntro>` when we already provided a header-level back button.
- **Leads.tsx**: Refactored both the main index and the `LeadDetail` scrollable areas to use the new UX primitives. Upgraded empty state to use `.owner-state-container`.
- **Conversas.tsx**: Replaced hardcoded `h-full` and manually styled flexbox lists with `.owner-view-root`. Applied standard empty states.
- **Assistant.tsx**: Swapped inner layout parameters to rely on the new consistent CSS structure while preserving the dark/WhatsApp specific aesthetic properties.
- **Campaigns.tsx & CampaignDetail.tsx**: Modernized the layouts; ensured launch notices were strictly preserved and actions didn't enable new payments.
- **Mercado.tsx, Vendas.tsx, Comercio.tsx, Carteira.tsx, Plano.tsx**: Upgraded to standard header styling and root view containers.

### 3. Touch Affordances
- Expanded native hit areas for action buttons (like refresh, back, and list items) ensuring compliance with the >=44px standard for mobile.

### Unresolved Issues / Test Gaps
- **`WaEmptyState` in sub-components**: The generic `WaEmptyState` (from `wa/WaEmptyState.tsx`) is still being used in `Vendas`, `Comercio`, `Mercado` and `Carteira` as requested, avoiding touching out-of-scope files. Visually, it is mostly identical but does not rely on `owner-ux.css`.
- **Native Safari scroll bouncing**: Handled inside `owner-content-scroll`, but testing required for absolute edge cases on iOS 15 where flex layout interactions can behave inconsistently.
- `OwnerGate` now returns a neat loading state instead of `null` to avoid blanks while checking session.
