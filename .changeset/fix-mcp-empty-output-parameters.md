---
'@composio/core': patch
---

Fix `tools.execute` (and `tools.get` / `tools.list`) failing with a `ZodError` for every tool from an MCP-backed toolkit (e.g. `granola_mcp`, `apify_mcp`, `tavily_mcp`).

MCP toolkits don't declare an output schema, and the Composio API serializes that as `output_parameters: {}`. The SDK's `ParametersSchema` required `{ type: 'object', properties: {...} }`, so `transformToolCases` rejected the response and `getRawComposioToolBySlug` — called by `execute` and the list path — threw.

The SDK now normalizes empty (`{}`), `null`, and missing `input_parameters` / `output_parameters` payloads to `undefined` before validation. `outputParameters` was already declared `.optional()` in the public `Tool` type, so this preserves the contract: "undefined means no declared schema." Tools that *do* declare a schema continue to be validated strictly.

No public API change; no toolkit allow-list.
