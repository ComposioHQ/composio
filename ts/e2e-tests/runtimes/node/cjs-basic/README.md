# Node.js CommonJS require(esm) Interop Test

Verifies that `@composio/core` can still be loaded from a CommonJS caller on Node.js 22 through Node's native `require(esm)` support, without Composio publishing CommonJS artifacts.

## Why This Exists

The TypeScript SDK packages are ESM-only. This suite ensures:

- `require('@composio/core')` works on Node.js 22, 24, and 25.
- `require.resolve('@composio/core')` resolves to `dist/index.mjs`, not a `.cjs` artifact.
- The main public exports remain available through Node's native CommonJS-to-ESM interop.

## What It Tests

| Test                  | Description                                           |
| --------------------- | ----------------------------------------------------- |
| require(esm) support  | Node exposes native `process.features.require_module` |
| Entry resolution      | `@composio/core` resolves to `dist/index.mjs`         |
| CommonJS require      | `require('@composio/core')` doesn't throw             |
| Composio class        | Main class is exported and constructible              |
| OpenAIProvider        | Provider class exports and instantiation              |
| AuthScheme            | Auth enum is accessible                               |
| ComposioError         | Error classes are exported                            |
| jsonSchemaToZodSchema | Utility function is exported                          |
| constants             | Constants namespace is accessible                     |
| logger                | Logger instance is exported                           |

## Fixture

```
fixtures/
└── test.cjs    # CommonJS script using require('@composio/core')
```

## Isolation Tool

**Docker** with Node.js versions: 22.22.3, 24.16.0, 25.9.0.

## Running

```bash
pnpm test:e2e
```
