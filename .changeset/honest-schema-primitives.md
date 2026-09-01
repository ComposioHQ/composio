---
'@composio/json-schema-to-zod': patch
---

Preserve Draft 7 scalar semantics: intersect `enum` and `const` values with their declared type and constraints, apply scalar constraints to typeless schemas per instance type, and count string lengths in Unicode code points instead of UTF-16 code units.
