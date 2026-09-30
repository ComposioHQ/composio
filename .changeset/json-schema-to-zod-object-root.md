---
'@composio/json-schema-to-zod': patch
'@composio/core': patch
---

Fix tool schemas rejected by OpenAI and Anthropic when a parameter uses `anyOf`, `oneOf`, `allOf`, `$ref`, or similar keywords. The converted schema is a `ZodObject` again, so the LangChain, Vercel, LlamaIndex, and Claude Agent SDK providers send tool parameters with a top-level `type: "object"`. Patterns with escapes such as `\_` or `\:` no longer fail every call to the tool.
