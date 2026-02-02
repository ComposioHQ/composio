# json-schema-to-zod + Zod v4 Compatibility Test

Verifies that `@composio/json-schema-to-zod` works correctly with `zod@4`.

## Why This Exists

The `@composio/json-schema-to-zod` package must support both Zod v3 and v4. This suite ensures:

- JSON Schema to Zod conversion works with Zod v4
- All schema types (string, object, array, anyOf) convert correctly
- `additionalProperties` handling works correctly with Zod v4's API
- Complex nested structures and union types parse correctly

## What It Tests

| Test                   | Description                                                |
| ---------------------- | ---------------------------------------------------------- |
| Basic string schema    | Converts `{ type: 'string' }` and validates                |
| Object schema          | Required fields, nested properties, validation constraints |
| Array schema           | Typed array items with validation                          |
| Email format           | Format validation for email strings                        |
| Nested schemas         | Complex nested objects and arrays                          |
| anyOf schemas          | Union type conversion                                      |
| additionalProperties   | Strict, passthrough, and typed catchall modes              |
| Complex nested arrays  | Arrays of objects with nested arrays                       |
| Union with constraints | anyOf with minLength, minimum, and required fields         |

## Test Setup

This test runs **directly in Bun** (no Docker fixtures). The test file imports `@composio/json-schema-to-zod` from the monorepo workspace:

```typescript
import { jsonSchemaToZod, type JsonSchema } from '@composio/json-schema-to-zod';
```

Tests use `bun:test` assertions to verify schema conversion and parsing behavior.

## Isolation Tool

**Docker** with Node.js versions: current (as specified in `.nvmrc`).

## Running

```bash
pnpm test:e2e
```
