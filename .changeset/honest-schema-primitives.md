---
'@composio/json-schema-to-zod': patch
---

Preserve Draft 7 acceptance across primitive, composed, referenced, conditional, and typeless schemas. Enforce sibling and object/array assertions, retain positional tuple and `additionalItems` behavior, and prevent native Zod materialization from rejecting values already accepted by the source schema.
