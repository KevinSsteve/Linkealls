---
name: Chrome Android chat viewport
description: Keyboard-safe viewport sizing for full-screen chat routes on Chrome Android.
---

Use `interactive-widget=resizes-content` in the viewport policy and keep the full-screen chat shell in normal flow with a dynamic viewport height. Do not pin the outer shell with `position: fixed` and `inset: 0`, and do not persist a JavaScript-measured viewport height.

**Why:** Chrome Android changes the visible viewport as its address bar and software keyboard open or close. A fixed outer shell can remain tied to the wrong viewport and, combined with hidden overflow, leave the chat clipped or a blank region after refresh.

**How to apply:** Let the browser resize the layout viewport, use `100dvh` with a `100vh` fallback for the route shell, keep only the messages pane scrollable, and validate full reload plus a focused composer at both full and keyboard-contracted heights.