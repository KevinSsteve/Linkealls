---
name: Qualification evidence precedence
description: Rules for merging call, chat and owner qualification under concurrent updates.
---

Automated qualification is monotonic: weaker later chat evidence must not reduce a stronger existing score, and empty extraction fields must not erase known data.

**Why:** Visitors commonly chat before calling, and concurrent chat can finish while call extraction is running. Treating either channel as a replacement loses evidence and corrupts owner prioritisation.

**How to apply:** Persist call lifecycle independently, then rebase extracted evidence on the latest lead with checked revision updates and bounded retries. Merge non-empty call facts while preserving concurrently changed fields.

Owner corrections, owner control and terminal lead states remain authoritative over automated chat or call qualification.

**Why:** Automation must not silently reverse an explicit owner decision or report success after a failed concurrent update.

**How to apply:** Preserve owner-protected fields and terminal states, require stronger evidence before automated promotion, and only notify or log extraction success after a confirmed persisted transition.