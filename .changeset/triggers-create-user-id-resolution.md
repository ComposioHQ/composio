---
"@composio/core": minor
---

`triggers.create` now resolves the connection from `user_id` on the backend instead of client-side.

- The SDK no longer makes an extra `connectedAccounts.list()` call. When `connectedAccountId` is omitted, the backend resolves the first active connection for the user and the trigger's toolkit (ordered by most recently created), matching tool execution.
- **Behavior change:** `create` no longer throws `ComposioConnectedAccountNotFoundError` for a missing or invalid connection. That case now surfaces as the backend error from the upsert call. `ComposioTriggerTypeNotFoundError` (invalid slug) and `ValidationError` (including empty `userId`) are still thrown client-side.
- **Requires a backend that resolves the trigger connection from `user_id` on upsert** ([ComposioHQ/platform#10932](https://github.com/ComposioHQ/platform/pull/10932)). Self-hosted deployments must be on a version that includes it.
