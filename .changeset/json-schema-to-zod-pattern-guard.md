---
'@composio/json-schema-to-zod': patch
'@composio/core': patch
---

Guard schema `pattern` and `patternProperties` compilation. A pattern that does not compile, nests unbounded quantifiers (such as `^(a+)+$`), or exceeds 1024 characters now fails conversion with an `InvalidPatternError` that names the offending property path instead of a raw `SyntaxError` or a validator that can block the event loop. `@composio/core` surfaces that path in the `JsonSchemaToZodError` message.
