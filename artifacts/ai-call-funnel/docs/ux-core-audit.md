# UX Core Audit & Refinements

## Pages Checked (Source & Validation)
- `src/pages/HomePage.tsx` (Source fix: layout, mobile menu accessibility/close triggers)
- `src/pages/LoginPage.tsx` (Source fix: 768px layout overflow, contrast, padding, aria properties, label linking)
- `src/pages/RegisterPage.tsx` (Source fix: 768px layout overflow, contrast, padding, aria properties, Terms/Privacy links)
- `src/pages/RecoverAccessPage.tsx` (Source fix: layout, contrast, padding, aria properties, error IDs)
- `src/pages/ChooseHandle.tsx` (Source fix: spacing, contrast, disabled state clarity, aria properties)
- `src/pages/BusinessOnboardingPage.tsx` (Source fix: spacing, contrast, aria properties)
- `src/pages/LegalPage.tsx` (Source fix: review layout, meta description updates)
- `src/pages/not-found.tsx` (Source fix: explicitly wired into the router switch)

## Audit Checklist (Source Fixes)
- [x] **Global User Select**: Removed broad `user-select: none !important` from `body` which broke text selection destructively. Replaced with restrained scoped CSS that targets only `button` and `.app-header` elements, leaving anchors, inputs, and regular text interactive for copying public business names and links.
- [x] **Focus Styles**: Fixed the global `--focus-ring` in `index.css`. Transitioned from `outline: none` to `outline: 2px solid var(--accent); outline-offset: 2px;` coupled with a transparent shadow fallback, ensuring proper visible outlines for forced-colors and high-contrast modes.
- [x] **Hero Mobile Height & Typography**: Fixed `.home-hero` rule in `index.css`. Removed the hardcoded `min-height: 765px` that was causing oversized vertical blanks on smaller devices, replacing it with `min-height: calc(100dvh - 68px)`. Adjusted `font-size: clamp()` settings on the hero title so it fits mobile screens without excessive wrapping or truncation.
- [x] **Route Fallbacks**: Replaced the previous blind `<Redirect to="/" />` with a dedicated, branded `not-found.tsx` page to handle unknown single-segment routes gracefully. *Note: `/:handle` is still handled correctly by the `Catalogo` route prior to the fallback.*
- [x] **Mobile Menu Accessibility**: Added an `aria-controls` ID to the mobile menu in `HomePage.tsx`. Configured `Escape` key and outside-click listeners to close the menu and return focus to the toggle button, without improperly trapping focus in a disclosure menu.
- [x] **768px Auth Grid Overflow**: Fixed `md:grid-cols-[minmax(...)]` in `LoginPage.tsx` and `RegisterPage.tsx` which caused horizontal overflow due to columns exceeding the 768px width. Switched breakpoint to `lg` to ensure stacked column layout on smaller tablets.
- [x] **Vertical Blank Space**: Restructured the vertical layout in auth pages. Changed `flex-1` and explicit large paddings (`mt-14`) to `justify-center` and smaller `mt-10` paddings so content flows naturally within `100dvh`, preventing large awkward blank areas on 320/390px widths.
- [x] **Contrast & Readability**: Adjusted the hex codes for `COLORS.soft` and `COLORS.muted` in auth flows from `#425466` and `#8898aa` to `#344558` and `#5b6e82`. This darkens secondary labels and helper text, improving the contrast ratio against the white background.
- [x] **Button Targets**: Enhanced `.auth-primary` buttons in auth/onboarding steps to have explicit `min-h-[56px]`, `box-shadow`, and `rounded-[16px]` to feel consistent, providing a minimum 44px tap target area easily reached by thumbs on mobile devices.
- [x] **Auth Form ARIA Labels & Links**: Applied `aria-invalid` and `aria-describedby` dynamically to `TextField` and `PhoneField` based on error states. Added `role="status"` and `aria-live="polite"` to `PinDots` to announce the count of filled digits rather than repeating digits themselves.
- [x] **Footer Links**: Upgraded "Termos e privacidade" prose in `RegisterPage` to use base-aware `<Link href="/termos" target="_blank" rel="noopener noreferrer">` components.
- [x] **Auth Clean Page Overrides**: Cleaned up excessive `!important` block overrides that were negating design refinements on auth pages.

## Validation Evidence
All fixes were applied directly to the `.tsx` and `.css` source files scoped in the workspace. No backend dependencies were altered, no emojis were added to the UI, and existing real behavior, API contracts, and routes have been strictly preserved. The changes rely heavily on existing CSS variables and Tailwind paradigms already present in the codebase. Typescript compilation (`npm run typecheck`) passed cleanly. No new external packages were introduced.