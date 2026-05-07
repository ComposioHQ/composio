---
'@composio/core': minor
---

Fix `composio.tools.getRawComposioTools({ toolkits: [...] })` returning a truncated tool list and add a per-call `toolkitVersions` override.

**Behavior change:** when callers passed only `toolkits` (no `limit`, no `important`), the SDK silently appended `important: 'true'` to the request, so the server returned only the curated "important" subset. For the `airtable` toolkit this dropped the count from 23 to 17. Calls now return the full toolkit unless the caller explicitly opts in with `important: true`. Existing callers who relied on the implicit filtering can preserve the old behavior by adding `important: true` to their query.

**New option:** `toolkitVersions` is now accepted on individual `tools.list` / `getRawComposioTools` calls (`'latest'` or `Record<toolkitSlug, version>`) and overrides the SDK-init default for that call. The constructor-level `toolkitVersions` continues to apply when the per-call value is omitted.
