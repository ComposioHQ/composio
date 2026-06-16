---
'@composio/mastra': patch
---

Relax the Mastra provider output schema so third-party API responses with `null` optional fields or extra keys are no longer rejected by Mastra's output validation (which dropped the data and substituted an error). Output schemas are now made nullable with `additionalProperties: true` before compilation; this only widens what validates, so previously-valid output is unaffected.
