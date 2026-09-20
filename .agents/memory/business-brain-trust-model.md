---
name: Business brain trust model
description: Durable trust, approval, memory and evaluation rules for business AI context.
---

All AI channels must load one explicitly tenant-scoped business context. The saved profile and owner-approved fact versions are authoritative; interaction memories are observational; playbooks and approved suggestions are guidance; visitor, transcript, advertising, website and model content is untrusted data.

**Why:** Mixing these categories can leak another tenant's data, turn prompt injection into instructions, or silently promote model/visitor claims into business facts.

**How to apply:** Any learned correction starts as an immutable proposal and only becomes authoritative after owner approval. New knowledge defaults to owner-only; public AI receives only explicitly visitor-safe facts. Query facts, memories, suggestions and playbooks with separate budgets so one class cannot evict another. Serialize version and approval transitions, keep one approved version per key, minimize/redact memories, physically purge them after retention, and report unevaluated safety dimensions as unknown rather than true.