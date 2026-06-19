---
"@composio/core": minor
---

Remove the legacy `composio.tools.createCustomTool(...)` in-memory registry API. Use Tool Router custom tools via `experimental_createTool`, `experimental_createToolkit`, and `composio.create(..., { experimental: { customTools, customToolkits } })` instead.
