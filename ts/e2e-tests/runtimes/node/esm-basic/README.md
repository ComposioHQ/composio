# Node.js ESM Compatibility Tests

Verifies that `@composio/core` works correctly when imported via `import` in ES Module environments.

## Why This Exists

ESM is the modern JavaScript module standard. This suite ensures:

- `import('@composio/core')` resolves without errors
- Named imports work (`import { Composio } from '@composio/core'`)
- All public exports are accessible
- No CJS-only patterns break ESM consumers

## What It Tests

| Test                  | Description                              |
| --------------------- | ---------------------------------------- |
| Dynamic import        | `import('@composio/core')` doesn't throw |
| Composio class        | Main class is exported and constructible |
| OpenAIProvider        | Provider class exports and instantiation |
| AuthScheme            | Auth enum is accessible                  |
| ComposioError         | Error classes are exported               |
| jsonSchemaToZodSchema | Utility function is exported             |
| constants             | Constants namespace is accessible        |
| logger                | Logger instance is exported              |
| Named imports         | Destructuring imports work correctly     |
| Uses LLMs?            | ❌                                       |

## Isolation Tool

**Docker** with specific Node.js versions (20.17.0, 20.19.0)

This ensures tests run against exact Node.js versions independent of the developer's local setup, catching version-specific ESM resolution issues.

## Running

```bash
# Via pnpm (recommended)
pnpm test:e2e

# Direct execution
bash run-docker-test.sh
```

The test runs on different Node.js versions (20.17.0 and 20.19.0) to catch regressions across versions.
