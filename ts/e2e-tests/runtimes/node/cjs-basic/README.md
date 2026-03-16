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

## Fixture

```
fixtures/
└── test.cjs    # CommonJS test script using require()
```

The fixture is a standalone `.cjs` file that:

- Uses `require('@composio/core')` to import the package
- Verifies each export exists and has the correct type
- Attempts to instantiate `OpenAIProvider` to catch runtime errors
- Outputs test results to stdout with pass/fail markers

## Isolation Tool

**Docker** with Node.js versions: 20.18.0, 20.19.0, 22.12.0.

## Running

```bash
pnpm test:e2e
```
