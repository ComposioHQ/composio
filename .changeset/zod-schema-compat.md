---
'@composio/core': patch
'@composio/claude-agent-sdk': patch
---

Improve Zod compatibility at the SDK schema boundary. Custom tools now convert both `zod/v3` and Zod v4 schemas to JSON Schema correctly instead of degrading Zod v4 object schemas to empty schemas. `@composio/core` now exposes `jsonSchemaToZodShape` via `@composio/core/utils/json-schema`, and the Claude Agent SDK provider uses that core subpath instead of converting to a full Zod object and casting `.shape` out of it.
