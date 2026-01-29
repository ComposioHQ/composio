# json-schema-to-zod + Zod v3 Compatibility Test

Verifies that `@composio/json-schema-to-zod` works correctly with `zod@3.25.76`.

## Why This Exists

The `@composio/json-schema-to-zod` package must support both Zod v3 and v4. This suite ensures:

- JSON Schema to Zod conversion works with Zod v3
- All schema types (string, object, array, anyOf) convert correctly
- Round-trip conversion (JSON Schema -> Zod -> JSON Schema) preserves semantics
- `additionalProperties` handling works correctly

## What It Tests

| Test                  | Description                                                      |
| --------------------- | ---------------------------------------------------------------- |
| Basic string schema   | Converts `{ type: 'string' }` and validates                      |
| Object schema         | Required fields, nested properties, validation constraints       |
| Array schema          | Typed array items with validation                                |
| Email format          | Format validation for email strings                              |
| Nested schemas        | Complex nested objects and arrays                                |
| anyOf schemas         | Union type conversion                                            |
| Round-trip conversion | JSON Schema -> Zod -> JSON Schema preserves `additionalProperties` |

## Running

```bash
pnpm test:e2e
```
