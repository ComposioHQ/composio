---
'@composio/json-schema-to-zod': patch
'@composio/core': patch
---

Guard schema `pattern` and `patternProperties` compilation. A pattern that does not compile or exceeds 1024 characters now fails conversion with an `InvalidPatternError` that names the offending property path instead of a raw `SyntaxError`. `@composio/core` surfaces that path in the `JsonSchemaToZodError` message. No backtracking heuristic is applied: a hostile `pattern` that backtracks catastrophically remains a known limitation.
