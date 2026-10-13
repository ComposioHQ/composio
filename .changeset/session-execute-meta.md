---
'@composio/core': minor
'@composio/slim': minor
---

Add `session.executeMeta()` to run a Composio meta tool (`COMPOSIO_*`) within a session. It takes a meta tool slug and optional arguments, and returns the same result as `session.execute()`, including `resultType`. Like `session.execute()`, it throws `ComposioToolInputRequiredError` when the tool needs user input and is not retried. The new `ToolRouterSessionMetaToolSlug` type lists the accepted slugs.

The Python SDK gains the matching `session.execute_meta()` and `ToolRouterSessionMetaToolSlug`.
