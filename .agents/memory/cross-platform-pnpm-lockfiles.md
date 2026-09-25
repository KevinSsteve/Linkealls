---
name: Cross-platform pnpm lockfiles
description: Preserve multi-platform native binary resolution without discarding security overrides.
---

Do not reintroduce pnpm overrides that map native optional binaries for other operating systems to `-` when the shared lockfile must work outside Replit.

**Why:** A Linux-only dependency optimisation prevents macOS and Windows runners from resolving their esbuild, Rollup, Lightning CSS and Tailwind binaries from the same lockfile. The security version overrides address a separate concern and should stay intact.

**How to apply:** When regenerating the workspace lockfile, keep optional platform packages available, preserve security pins, and confirm a frozen-lockfile install succeeds. A Linux check does not replace running a macOS/Windows CI matrix.