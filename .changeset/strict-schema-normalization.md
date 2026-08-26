---
'@composio/core': minor
'@composio/openai': patch
'@composio/vercel': patch
---

Fix strict-mode tool schemas for OpenAI structured outputs. Strict normalization now applies OpenAI's contract at every depth (nested objects, `anyOf` branches, array items, inlined `$ref`/`$defs`): every object lists all of its properties in `required` and sets `additionalProperties: false`, so tools with nested or optional parameters no longer produce schemas the API rejects with a 400. Optional parameters are no longer dropped: they stay available and are widened to accept `null`, the emulation of optional fields OpenAI documents, and the strict providers drop a `null` argument the tool's own schema does not accept before executing the tool. Tools whose schema strict mode cannot express (objects with arbitrary keys, `allOf`, `prefixItems`, unresolved `$ref`s) are sent without strict mode with a warning naming the tool and path, instead of being narrowed. `@composio/core` exports the new `toStrictJsonSchema()` and `omitNullToolArguments()` utilities; `removeNonRequiredProperties` is unchanged for other callers. The Python `OpenAIResponsesProvider` gains a matching opt-in `strict=True` constructor flag that also emits `strict: true` on the wrapped tool.
