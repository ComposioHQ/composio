---
"@composio/experimental": minor
---

Add an eve provider: `EveProvider` makes `session.tools()` return eve-native `defineTool`s, `defineComposioTools` is the replay-safe `step.started` resolver, and `(ctx, next)` hooks can rewrite, deny, or transform Tool Router meta-tool calls.
