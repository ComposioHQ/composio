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

## CLI Focus

The CLI package owns source and test typechecks, skill validation, Vitest, and its build:

```bash
pnpm --filter @composio/cli typecheck
pnpm --filter @composio/cli typecheck:tsc
pnpm --filter @composio/cli test
pnpm --filter @composio/cli build
```

For a single CLI test file, pass the path through the package test script so its skill precheck still runs:

```bash
pnpm --filter @composio/cli test test/src/path/to/file.test.ts
```

Use `pnpm test:e2e:cli` when command parsing, binary packaging, stdout/stderr, filesystem isolation, exit codes, or platform behavior changes.

## When To Use E2E

- Use Node/Deno/Cloudflare E2E for runtime packaging or module-resolution regressions.
- Use CLI E2E for CLI binary behavior and output contracts.
- Docker must be available for runtime and CLI E2E tests.

## Test Placement

- Package tests live under `ts/packages/<package>/test/`.
- Runtime E2E tests live under `ts/e2e-tests/runtimes/`.
- CLI E2E tests live under `ts/e2e-tests/cli/`.

## Agent skill verification

Changes under `.agents/skills` use the root validators:

```bash
pnpm validate:agent-skills
pnpm validate:skill-routing
```

Effect v4 skill examples have an additional compiler check documented in `effect-v4/SKILL.md`.
