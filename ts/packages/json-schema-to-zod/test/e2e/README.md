# E2E Tests

End-to-end tests that verify `@composio/json-schema-to-zod` works correctly with different versions of zod.

## Structure

- `zod-v3/` - Tests with zod 3.25.76 and `zod-to-json-schema` for round-trip conversion
- `zod-v4/` - Tests with zod ^4.0.0 and native `z.toJSONSchema()` for validation
