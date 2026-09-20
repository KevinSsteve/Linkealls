---
name: Chrome Android chat viewport
description: Keyboard-safe viewport sizing for full-screen chat routes on Chrome Android.
---

Keep the full-screen chat shell in normal flow at the large viewport height (`100lvh`). Use `visualViewport.height` only while a text control is focused and the measured keyboard delta is significant. On `pageshow`, clear restored text-field focus, inline keyboard height, document scroll, and browser scroll restoration. Do not use `interactive-widget=resizes-content`, `100dvh`, or a fixed outer shell as the normal-height source.

**Why:** Chrome Android and Android WebView can retain a keyboard-reduced dynamic/layout viewport after refresh even though the keyboard has disappeared. Both fixed shells and `100dvh`/`interactive-widget=resizes-content` can then preserve the short height and leave a large white region below the chat.

**How to apply:** Use `100lvh` with a `100vh` fallback for the outer route shell, keep only the messages pane scrollable, and temporarily contract the inner chat to `visualViewport.height` during genuine keyboard use. Validate focus → contraction → reload → focus/scroll reset → expansion.