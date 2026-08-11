---
'@composio/core': patch
---

Add `type: "object"` to nested JSON Schema nodes that carry `properties` without an explicit type, so tool schemas work with strict OpenAPI 3.0 consumers like Google Gemini.
