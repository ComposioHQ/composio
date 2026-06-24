---
'@composio/core': patch
---

Add a provider-agnostic JSON-schema property-key sanitizer: `sanitizeSchemaPropertyKeys(schema, policy)`, `restoreOriginalKeys(value, mapping)`, `mappingHasRenames(mapping)`, and the `KeyMapping` / `KeySanitizationPolicy` types.

Some providers constrain the characters and length of tool `input_schema` property keys and reject the whole request on a single violation. This utility rewrites offending keys to conforming aliases (recursing through `properties`, array `items`/`prefixItems`, the composition keywords `allOf`/`anyOf`/`oneOf` and `not`/`if`/`then`/`else`, plus `additionalProperties`/`patternProperties`/`$defs`/`contains`) and records a schema-shaped reverse mapping so the original parameter names can be restored before execution. The _constraint_ is injected as a `KeySanitizationPolicy`, so the traversal, collision handling, prototype safety, and depth cap stay provider-agnostic. The `@composio/anthropic` provider now consumes it.
