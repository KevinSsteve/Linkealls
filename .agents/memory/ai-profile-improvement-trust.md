---
name: AI profile improvement trust boundary
description: Safety rules for AI-generated profile proposals and reusable visitor resources.
---

The model may identify gaps and create structured proposals or resource requests, but it must never write profile-visible or resource-visible data directly. Provenance is server-derived, not accepted from model or client input.

**Why:** Owner approval is meaningful only for the exact payload reviewed. Concurrent edits, cross-tenant upload reuse, or approval-preserving resource edits can otherwise publish content the owner never approved.

**How to apply:** Use field allowlists and financial deny rules; tenant-owned uploads; private/draft defaults; material edits that clear approval; version/CAS checks on review and adjustment; recent reauthentication for apply, reversal, resource approval, and delivery; purpose, validity, tenant, and idempotency gates on delivery.