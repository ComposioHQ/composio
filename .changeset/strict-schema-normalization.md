---
'@composio/core': patch
'@composio/openai': patch
'@composio/vercel': patch
---

Fix strict-mode tool schemas for OpenAI structured outputs. Strict normalization now recurses into nested objects, nullable types (`type: ['string', 'null']`) and `anyOf`/`allOf`/`oneOf` branches, inlines `$defs`/`$ref`, and marks every object with `additionalProperties: false` plus a complete `required` array — so tools with complex parameters no longer produce schemas the API rejects with a 400. The new `toStrictJsonSchema()` core util returns a change log instead of failing silently; `removeNonRequiredProperties` behavior is unchanged for non-strict callers. The Python `OpenAIResponsesProvider` gains a matching opt-in `strict=True` constructor flag.
