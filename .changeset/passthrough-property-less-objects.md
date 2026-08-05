---
'@composio/json-schema-to-zod': patch
---

Allow additional properties on object schemas that declare no `properties` and no `additionalProperties`, so free-form object fields keep their content instead of failing validation with `unrecognized_keys`.
