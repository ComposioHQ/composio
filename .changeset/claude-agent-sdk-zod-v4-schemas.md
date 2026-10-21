---
'@composio/claude-agent-sdk': minor
---

Build tool input schemas with the Zod v4 builder from `@composio/json-schema-to-zod/v4`, so `format`, `contentEncoding`, `contentMediaType`, and `type: "integer"` survive the SDK's conversion to the JSON Schema the model sees. Before, a field such as `{ type: "string", format: "binary" }` reached the model as `{ type: "string" }`. The values a tool accepts and rejects are unchanged.

The `zod` peer dependency is now `^4.1.13` (was `^4.0.0`): the v4 builder needs the metadata registry zod shares across copies from 4.1.13 on, and throws at load time on an older zod. Upgrade zod to 4.1.13 or newer before upgrading this package.
