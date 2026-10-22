# json-schema-to-zod + Zod v3 Compatibility Test

Verifies that `@composio/json-schema-to-zod` works correctly for a consumer that depends on `zod@3.25.76` and `zod-to-json-schema`.

## Why This Exists

The `@composio/json-schema-to-zod` package must support both Zod v3 and v4. The workspace link resolves the converter's own zod copy from the package, so this suite exercises the root entry's Zod v3 output against a consumer on the oldest supported release; coverage of the converter running on `zod@3.25.76` itself lives in the package's `zod-3.25` Vitest project. This suite ensures:

- JSON Schema to Zod conversion works with Zod v3
- All schema types (string, object, array, anyOf) convert correctly
- Round-trip conversion (JSON Schema -> Zod -> JSON Schema) preserves semantics
- `additionalProperties` handling works correctly

## What It Tests

| Test                  | Description                                                        |
| --------------------- | ------------------------------------------------------------------ |
| Basic string schema   | Converts `{ type: 'string' }` and validates                        |
| Object schema         | Required fields, nested properties, validation constraints         |
| Array schema          | Typed array items with validation                                  |
| Email format          | Format validation for email strings                                |
| Nested schemas        | Complex nested objects and arrays                                  |
| anyOf schemas         | Union type conversion                                              |
| Round-trip conversion | JSON Schema -> Zod -> JSON Schema preserves `additionalProperties` |

## Test Setup

This test runs **directly in Bun** (no Docker fixtures). The test file imports `@composio/json-schema-to-zod` and `zod-to-json-schema` from the monorepo workspace:

```typescript
import { jsonSchemaToZod, type JsonSchema } from '@composio/json-schema-to-zod';
import zodToJsonSchema from 'zod-to-json-schema';
```

Tests use `bun:test` assertions to verify schema conversion and round-trip behavior.

## Isolation Tool

**Docker** with Node.js versions: 22.23.4, 24.22.1, 26.12.1.

## Running

```bash
pnpm test:e2e
```
