---
"@composio/core": patch
---

**Fix:** `session.search()` no longer throws `ZodError` when the API returns `schemaRef` without `message` (budget-trimmed tools) or `current_user_info` as an array (multi-account toolkits like Supabase). Resolves [#3103](https://github.com/ComposioHQ/composio/issues/3103). The `toolkitConnectionStatuses[*].currentUserInfo` schema now accepts both `Record<string, unknown>` and `unknown[]`, and the snake_case transformer's `current_user_info` field type is widened accordingly.
