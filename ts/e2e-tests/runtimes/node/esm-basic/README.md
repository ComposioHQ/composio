# Node.js ESM Compatibility Test

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

## Fixture

```
fixtures/
└── test.mjs    # ESM test script using import()
```

The fixture is a standalone `.mjs` file that:

- Uses `import('@composio/core')` to dynamically import the package
- Verifies each export exists and has the correct type
- Tests destructured named imports (`{ Composio, OpenAIProvider }`)
- Attempts to instantiate `OpenAIProvider` to catch runtime errors
- Outputs test results to stdout with pass/fail markers

## Isolation Tool

**Docker** with Node.js versions: 20.18.0, 20.19.0, 22.12.0.

## Running

```bash
pnpm test:e2e
```
