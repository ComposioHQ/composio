# @composio/json-schema-to-effect-schema

## 0.1.2

### Patch Changes

- 04fdb41: Check a string tool parameter as base64 only when its `contentEncoding` is `base64`. `format: "binary"` (raw octets in OpenAPI) and other encodings such as `base16` were validated as base64, so the Vercel, LangChain, LlamaIndex, and Claude Agent SDK providers rejected tool calls with plain text or hex in those fields, and the schema sent to the model described them as `contentEncoding: "base64"`. Those fields are now plain strings. `contentEncoding: "base64"` keeps its check, and `format: "byte"` stays unchecked.

## 0.1.1

### Patch Changes

- ab289d6: Translate draft-4 boolean `exclusiveMinimum`/`exclusiveMaximum` flags (as emitted by OpenAPI 3.0 exporters) into their Draft 7 numeric spelling so exclusive bounds are enforced instead of silently ignored.
