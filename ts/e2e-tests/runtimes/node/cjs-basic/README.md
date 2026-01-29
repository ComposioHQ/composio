# Node.js CommonJS Compatibility Test

Verifies that `@composio/core` works correctly when imported via `require()` in CommonJS environments.

## Why This Exists

Many Node.js projects still use CommonJS. This suite ensures:

- `require('@composio/core')` resolves without errors
- All public exports are accessible
- Classes can be instantiated
- No ESM-only syntax leaks into CJS builds

## What It Tests

| Test                  | Description                               |
| --------------------- | ----------------------------------------- |
| Basic require         | `require('@composio/core')` doesn't throw |
| Composio class        | Main class is exported and constructible  |
| OpenAIProvider        | Provider class exports and instantiation  |
| AuthScheme            | Auth enum is accessible                   |
| ComposioError         | Error classes are exported                |
| jsonSchemaToZodSchema | Utility function is exported              |
| constants             | Constants namespace is accessible         |
| logger                | Logger instance is exported               |

## Isolation Tool

**Docker** with Node.js versions: 20.18.0, 20.19.0, 22.12.0

This ensures tests run against exact Node.js versions independent of the developer's local setup, catching version-specific module resolution issues.

## Running

```bash
pnpm test:e2e
```
