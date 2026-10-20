---
'@composio/core': patch
---

Fold OpenAPI `nullable` into the type in strict tool schemas

`toStrictJsonSchema` no longer passes OpenAPI `nullable` through. Anthropic strict tool use rejects it on an object schema with a 400 for the whole request. A node with `nullable: true` now accepts `null` through its `type` (`["object", "null"]`) or a null branch, matching how the tool's arguments are validated, and the rewrite is reported as a `nullable-converted` change. `nullable: false` is removed as an `unsupported-keyword-stripped` change. `omitNullToolArguments` now keeps a `null` for a property marked `nullable: true`, as it already does for one whose `type` includes `null`.
