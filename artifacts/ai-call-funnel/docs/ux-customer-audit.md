# Customer UX/UI Audit & Improvements

This document lists the specific components and pages audited and improved to enhance the customer-facing mobile experience, adhering to the requirements (Angolan mobile users opening a small business link, browsing products, and talking with AI).

## Audit Scope & Changes

### 1. `src/styles/customer-ux.css`
A new file containing scoped CSS fixes to bypass the global `user-select: none` behavior gracefully, and ensure sizing meets mobile standards without touching the shared application-wide configurations.
- Added `.customer-selectable` to allow text selection on paragraphs/divs while explicitly leaving out broad global prohibitions on links (allowing `a` tags to be selectable if needed by standard browser behavior).
- Added `.touch-target-min` to enforce minimum touch dimensions of `44x44px` on interactive elements.
- Added `.customer-break-words` utility to prevent horizontal scrolling on long chat messages or URLs (using a locally scoped name to avoid overriding `.break-words` globally).
- Added catalogue-specific safe-area spacing that preserves the existing 120px clearance for fixed bottom navigation. Generic padding overrides were deliberately avoided.

### 2. `src/components/BuyModal.tsx`
- **Selectability**: Implemented `.customer-selectable` wrapper so users can easily copy their order reference, the total price, or error messages.
- **Touch targets**: 
  - Adjusted the modal close (`X`) button to meet `44px` standards using `.touch-target-min`.
  - Adjusted quantity controls (`+` and `-`) ensuring they have enough padding and are easily tap-able.
  - Adjusted the "Simular aprovação no telemóvel" button to ensure it comfortably meets touch standards.
- **Focus & Dismissal**: The shared dialog focus hook focuses the dialog, cycles Tab/Shift+Tab through its visible enabled controls, prevents background focus, and restores the trigger on unmount. Escape dismissal is bypassed when busy or waiting for payment.
- **UX/Feedback**: Maintained the existing error reporting and visual polling logic for payment processing.

### 3. `src/components/InlineCheckout.tsx`
- **Touch targets**: Increased the close button inside the inline checkout card to `w-11 h-11` (44px) and added `.touch-target-min` to simulation buttons.
- **Selectability**: Wrapped the checkout card content with `.customer-selectable` to allow text copying.
- **Feedback**: Retained and preserved all error boundaries and status displays.

### 4. `src/components/ChatBubble.tsx`
- **Layout & Selectability**: Added `.customer-selectable` to chat messages allowing the user to copy important information (IBANs, instructions, lists). 
- **Word Wrapping**: Implemented `.customer-break-words` on the text so that very long words (e.g. URLs or un-spaced alphanumeric sequences) automatically wrap onto the next line instead of breaking the horizontal bounds of the bubble.

### 5. `src/components/ChatInput.tsx`
- **Accessibility**: Labelled the text field and send button. The text-only composer no longer presents a misleading microphone icon on empty input; sending is disabled until text exists, and Enter respects IME composition.
- **Touch Targets**: Enforced `.touch-target-min` on the send button.
- **Safe Area**: Uses explicitly calc'd safe-area bottom padding (`env(safe-area-inset-bottom)`) inline to ensure the input field is never clipped by the OS home indicator.

### 6. `src/components/CallScreen.tsx`
- **Touch Targets**: Added `.touch-target-min` to the Minimize and End Call buttons.
- **Accessibility**: Added proper `aria-label` on the End Call button and `aria-hidden` on the visible text label to avoid duplicate screen-reader outputs.

### 7. `src/components/IncomingCallModal.tsx`
- **Dismissal**: Safely mapped the `Escape` key to the `reject` action via `useEffect`, properly relying on `useCallback` handlers. 
- **Touch Targets**: Preserved the already adequate `w-16 h-16` call/reject buttons.

### 8. `src/components/OrderProofUpload.tsx`
- **Touch Targets**: Added `.touch-target-min` to the file input label directly to enforce the `44px` minimum vertical and horizontal spacing.
- **Formatting**: Ensured the UI uses semantic feedback logic via `Loader2` without disrupting layout.

### 9. `src/pages/Catalogo.tsx`
- **Layering & Semantics**: Kept `.catalog-buy-modal-overlay` rendering structure intact to respect the existing `position: fixed` z-index exception applied globally.
- **Touch targets**: Improved the touch footprint of the quantity (`+` and `-`) buttons in the product detail view using `.touch-target-min`.
- **Selectability**: Made the entire `catalog-page` root wrapper `.customer-selectable`.
- **Safe Area**: Implemented `.pt-safe` and `.pb-safe` on `.catalog-shell`.

### 10. `src/pages/Chat.tsx`
- **Touch targets**:
  - `MinimizedCallBanner`: End call and Expand buttons updated to `w-11 h-11` and `.touch-target-min`.
  - `OrderTrackingCard`: Refresh button footprint significantly increased using `.touch-target-min`.
  - `AgentMsgBubble` & `AgentMessageOverlay`: Dismiss buttons made bigger and easier to tap accurately.
  - `ProductVitrine` & `InlineProductShelf`: Close buttons increased and safely padded out.

### 11. `src/pages/Captacao.tsx`
- **Styling**: Imported `customer-ux.css` so that chat text bubbles and other inner components properly inherit the new selectability rules and touch-target fixes.

### 12. `src/pages/UserProfile.tsx`
- **React Hydration / Structure bug**: Fixed an issue where the `Link` element from `wouter` contained a nested `<button>`, generating invalid DOM structure (`<a><button>...</button></a>`). Ported styles and classes directly onto the `Link` element.
- **Touch Targets & UX**: Ensured the main call-to-action buttons meet minimum mobile sizes (`.touch-target-min`) and the profile's description/name is correctly `.customer-selectable`.

## Browser Validation Still Needed
Because these changes have been applied in a static context (source inspection):
1. **iOS Safari Bottom Bar (Safe Area)**: Physical-device verification of catalogue navigation clearance and the composer's existing inline safe-area spacing remains separate from browser viewport emulation.
2. **Text Selection Interactions**: Ensure that selecting and copying text in the chat bubble or `BuyModal` on real touch devices (long press) does not conflict with scroll mechanics or misfire `onClose` events.
3. **Product Shelf Overflow**: Verify if the `InlineProductShelf` behaves exactly as expected when aggressively swiping horizontally.
4. **Hydration & Route Consistency**: Final validation that `wouter` transitions seamlessly between `UserProfile`, `Chat`, and `Catalogo` without dropping any contextual UTM parameters.
