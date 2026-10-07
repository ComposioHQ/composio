---
'@composio/core': patch
---

Fix optional enum and const parameters under strict mode. A typed enum such as `{ "type": "string", "enum": ["asc", "desc"] }` was widened by adding `null` to its `type` only, so the enum still rejected `null` and the model could not omit the parameter. Such schemas are now wrapped whole in `anyOf` with a `null` branch, as are `type` beside `anyOf` and `$ref` with sibling keywords. `omitNullToolArguments` now keeps a `null` only when every keyword of the tool's schema accepts it, so a `null` that an `enum`, `const`, `$ref` sibling or `allOf` rejects is treated as an omitted argument. Schemas whose only obstacle to `null` is `type` or `anyOf` are emitted exactly as before.
