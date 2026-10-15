---
'@composio/json-schema-to-zod': minor
---

Add a `@composio/json-schema-to-zod/v4` entry that builds classic Zod v4 schemas with the same `jsonSchemaToZod` and `jsonSchemaToZodShape` functions as the root entry, which keeps building Zod v3 schemas. The v4 builder forwards `format`, `contentEncoding`, `contentMediaType`, and `type: "integer"` into the schema's metadata so `z.toJSONSchema()` and the frameworks built on it render them again; `withoutAnnotations: true` turns that off. `/v4` requires zod `>= 4.1.13`, the first release whose `zod/v4` shares its metadata registry across copies, and throws at load time below it.

The root builder now reports an issue inside a nested object once, at its own path. Issues raised by `patternProperties`, `additionalProperties`, unrecognized keys, and `oneOf` under a property previously carried that property's name twice (`['x', 'x', 'key']`).
