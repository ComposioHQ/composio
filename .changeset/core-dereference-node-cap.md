---
'@composio/core': patch
'@composio/python-sdk': patch
---

`dereferenceJsonSchema` (TypeScript) and `dereference_json_schema` (Python) throw `JsonSchemaRefResolutionError` once inlining a schema's `$ref` pointers would visit more than 100,000 nodes, in both unresolved-reference modes. A schema whose definitions each reference the next one twice used to expand exponentially and hang the process.
