---
'@composio/json-schema-to-zod': patch
'@composio/json-schema-to-effect-schema': patch
'@composio/core': patch
'@composio/slim': patch
---

Check a string tool parameter as base64 only when its `contentEncoding` is `base64`. `format: "binary"` (raw octets in OpenAPI) and other encodings such as `base16` were validated as base64, so the Vercel, LangChain, LlamaIndex, and Claude Agent SDK providers rejected tool calls with plain text or hex in those fields, and the schema sent to the model described them as `contentEncoding: "base64"`. Those fields are now plain strings. `contentEncoding: "base64"` keeps its check, and `format: "byte"` stays unchecked.
