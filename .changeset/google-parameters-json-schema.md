---
'@composio/google': minor
---

Fix Gemini rejecting Composio tools with a 400 such as `Unknown name "examples"`. `wrapTool` and `wrapTools` now put each tool's schema in `parametersJsonSchema` instead of `parameters`, so JSON Schema keywords that Composio tools carry, such as `examples`, `const`, `null` types, and integer enums, reach Gemini intact. The `@google/genai` peer dependency now requires `^1.6.0`, the first release that supports `parametersJsonSchema` on function declarations.
