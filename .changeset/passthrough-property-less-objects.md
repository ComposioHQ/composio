---
'@composio/claude-agent-sdk': patch
'@composio/json-schema-to-zod': patch
---

Allow additional properties on object schemas that declare no `properties` and no `additionalProperties`, so free-form object fields keep their content instead of failing validation with `unrecognized_keys`. Preserve those properties when a free-form schema is used as a Claude Agent SDK tool's root input.
