---
'@composio/core': minor
'@composio/slim': minor
---

Requires `@composio/client` `2.0.0-rc.22`. `composio.toolkits.get(slug)` now returns `meta.appUrl` when the API sends the toolkit's app URL; it was always left out before. `composio.sessionConfigs.get()` keeps the `require_approval` lists of a stored policy, and no longer fails validation on a policy entry that only sets `require_approval`; `SessionConfigPolicy` gains the matching optional `require_approval` fields and the approval-only entry. Session hooks, blocked calls and hook results are read from the API types of `@composio/client` instead of SDK copies, with the same results and errors for well-formed responses; a malformed `hook_results` or blocked response is no longer re-validated by the SDK, matching every other API response.
