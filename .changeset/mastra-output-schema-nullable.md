---
'@composio/mastra': patch
---

Relax the Mastra provider output schema so real third-party API responses are no longer rejected by Mastra's output validation (which dropped the data and substituted an error). Before compilation the output schema is made lenient: every typed node becomes nullable, objects allow extra keys (`additionalProperties: true`), `enum`/`const` are widened to also admit `null`, and `required` is dropped (APIs omit unset fields rather than returning `null` for them). All of these only widen what validates, so previously-valid output is unaffected.
