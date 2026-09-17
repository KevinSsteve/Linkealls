---
name: Sensitive action confirmation
description: Durable security decision for confirming high-impact owner operations.
---

High-impact owner operations must require a recent confirmation of the existing business `ownerPin`, stored as a short-lived expiry on the active local session. Re-authentication must be checked on the server; the browser prompt is only a convenience.

**Why:** A valid owner session can remain open on a shared or unattended browser, so session ownership alone is not sufficient for account deletion, money movement, campaign publication, PIN changes, or brain/profile mutations. Reusing `ownerPin` avoids creating a second business authentication mechanism.

**How to apply:** Keep the authorization window short, clear it whenever a session token is rotated or invalidated, bind checks to both the session token and its normal expiry, and fail closed when the recent confirmation is absent.