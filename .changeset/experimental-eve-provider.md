---
'@composio/experimental': minor
'@composio/core': patch
---

Add an eve provider: `EveProvider` makes `session.tools()` return eve-native `defineTool`s, `defineComposioTools` is the replay-safe `step.started` resolver, and `(ctx, next)` hooks can rewrite, deny, or transform Tool Router meta-tool calls.

Preserve successful local-tool results when the remote half of a mixed `COMPOSIO_MULTI_EXECUTE_TOOL` batch fails at the transport layer, so callers can see which side effects already completed before retrying.
