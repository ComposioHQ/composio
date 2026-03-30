---
'@composio/mastra': patch
---

Omit `outputSchema` from Mastra `createTool` so third-party API responses with `null` or extra fields are not rejected by Mastra output validation (see ComposioHQ/composio#3047).
