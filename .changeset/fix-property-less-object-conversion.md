---
'@composio/json-schema-to-zod': minor
---

Accept and preserve arbitrary content in property-less objects (`{ type: "object" }` or `properties: {}`) at root, nested, and array-item positions, instead of collapsing them to a strict empty object. Dynamic keys are also routed correctly: every matching `patternProperties` entry validates its key, and a schema-valued `additionalProperties` applies only to keys no property or pattern claims.
