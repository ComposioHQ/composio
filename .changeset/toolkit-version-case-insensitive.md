---
'@composio/core': patch
---

Resolve toolkit version pins case-insensitively. Version maps are keyed by normalized (lowercase) slugs, but `getToolkitVersion` previously looked them up with the raw slug, so a pin configured under a different casing (e.g. `{ GitHub: '20250101_00' }` or `COMPOSIO_TOOLKIT_VERSION_GITHUB`) could silently fall back to `'latest'`. Normalization is now centralized in a single `normalizeToolkitSlug` helper used symmetrically on both the write (map-building) and read (lookup) paths, so the two sides can no longer drift. This mirrors the equivalent fix in the Python SDK.
