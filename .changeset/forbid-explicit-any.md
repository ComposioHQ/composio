---
'@composio/core': minor
---

Replace the loose JSON Schema property type with a recursive, type-safe definition.

`JSONSchemaProperty` (re-exported from `@composio/core` and reachable through
`Tool.input_parameters` / `Tool.output_parameters`) is now a concrete recursive
interface instead of effectively `any`. Runtime behavior is unchanged, but
consumer code that indexed into it without narrowing (for example
`schema.properties.foo.type` or `schema.default.someField`) may see new type
errors: `properties` entries are now possibly `undefined` and `default` /
`enum` values are `unknown`. Narrow with optional chaining or explicit type
guards when upgrading.
