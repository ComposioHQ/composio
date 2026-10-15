---
'@composio/json-schema-to-zod': patch
'@composio/core': patch
---

Stop rejecting tool calls for string parameters with `format: "binary"` or a non-base64 `contentEncoding`. OpenAPI `binary` is raw bytes, not base64, so the LangChain, Vercel, LlamaIndex, and Claude Agent SDK providers no longer reject values such as plain text, and no longer tell the model the field is base64. Only `contentEncoding: "base64"` is still checked as base64.
