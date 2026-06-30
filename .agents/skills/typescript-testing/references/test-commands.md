# TypeScript Test Commands

## Root Commands

```bash
pnpm lint
pnpm lint:packages
pnpm typecheck
pnpm typecheck:tsc
pnpm build:packages
pnpm test
pnpm test:e2e
pnpm test:e2e:node
pnpm test:e2e:deno
pnpm test:e2e:cloudflare
pnpm test:e2e:cli
```

## Package Focus

Use package filters for narrow checks:

```bash
pnpm --filter @composio/core test
pnpm --filter @composio/core typecheck
pnpm --filter @composio/<provider> test
pnpm --filter @composio/<provider> typecheck
```

## When To Use E2E

- Use Node/Deno/Cloudflare E2E for runtime packaging or module-resolution regressions.
- Use CLI E2E for CLI binary behavior and output contracts.
- Docker must be available for runtime and CLI E2E tests.

## Test Placement

- Package tests live under `ts/packages/<package>/test/`.
- Runtime E2E tests live under `ts/e2e-tests/runtimes/`.
- CLI E2E tests live under `ts/e2e-tests/cli/`.
