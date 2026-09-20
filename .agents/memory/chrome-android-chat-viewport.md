---
name: Chrome Android chat viewport
description: Keyboard-safe viewport sizing for full-screen chat routes on Chrome Android.
---

Automatic chat scrolling must target the message pane only, never default `scrollIntoView` on a bottom sentinel.

**Why:** A controlled populated-history comparison reproduced the reported hidden header: default `scrollIntoView({behavior: "smooth"})` scrolled the document by 768px despite overflow-hidden ancestors. Pane-only scrolling kept the document and header at zero. Earlier claims that stale keyboard height or focus restoration were the confirmed cause were unsupported; desktop viewport resizing does not emulate an Android software keyboard.

**How to apply:** Verify delayed restoration of a long history, new messages, header bounds, and every ancestor's scrollTop. An empty dev chat with failed API calls is not a valid regression fixture. When comparing old behavior, preserve the exact options: adding `block: "end"` masked this bug in the first comparison. Do not change viewport policies based on this symptom without separate evidence.

The user confirmed the pane-only scroll fix restored the header, then reported the composer below the screen with Chrome's address bar expanded. Do not reinstate the earlier large-viewport workaround.

**Why:** Large viewport units reserve the browser-bar-hidden height; this can clip the composer when the address bar is visible. This is distinct from the confirmed document-scroll bug.

**How to apply:** Size the shell to the dynamic available viewport, preserving pane-only scrolling. Desktop resize tests do not prove physical Chrome address-bar or software-keyboard behavior.