# Deno ESM Compatibility Test

Verifies that `@composio/core` works correctly when imported via `npm:` specifier in Deno.

## Why This Exists

Deno v2.0+ supports npm packages via the `npm:` specifier. This suite ensures:

- `import('npm:@composio/core')` resolves without errors
- Named imports work
- All public exports are accessible
- No Node.js-only patterns break Deno consumers

## What It Tests

| Test                  | Description                                      |
| --------------------- | ------------------------------------------------ |
| Dynamic import        | `import('npm:@composio/core')` doesn't throw     |
| Composio class        | Main class is exported and constructible         |
| OpenAIProvider        | Provider class exports and instantiation         |
| AuthScheme            | Auth enum is accessible                          |
| ComposioError         | Error classes are exported                       |
| jsonSchemaToZodSchema | Utility function is exported                     |
| constants             | Constants namespace is accessible                |
| logger                | Logger instance is exported                      |

## Fixture

```
fixtures/
├── deno.jsonc # Deno config to use local workspace packages
└── test.ts    # Deno test script using npm: specifier
```

The fixture uses Deno's native `npm:` specifier to import `@composio/core` and validates each export.

The `deno.jsonc` file configures `nodeModulesDir: "auto"`, which tells Deno to resolve `npm:` imports from the local `node_modules` directory (populated by pnpm with symlinks to workspace packages). This ensures we test the local build of `@composio/core` rather than the published npm version.

## Isolation Tool

**Docker** with Deno version: 2.6.7

## Running

```bash
pnpm test:e2e:deno
```
