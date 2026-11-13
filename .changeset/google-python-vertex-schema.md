---
'@composio/python-sdk': patch
---

Fix `composio_google` raising `ParseError` while wrapping tools whose schemas use JSON Schema keywords outside the Vertex AI `Schema` subset, such as `human_parameter_name`, `examples`, `const`, `oneOf`, type lists, and non-string enums. `wrap_tool` now reduces each schema to that subset: it drops unsupported keywords, turns `oneOf` into `anyOf`, a `null` type or enum member into `nullable`, a string `const` into a one-value `enum`, and moves non-string enum values into the description.
