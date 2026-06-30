# AGENTS.md

TypeScript runtime and CLI end-to-end test guidance.

## Scope

`ts/e2e-tests/` contains Docker-based runtime tests for Node.js, Deno, Cloudflare Workers, and CLI suites.

## Skill Routing

Use `typescript-testing` for runtime E2E selection. Use `cli-e2e` for tests under `ts/e2e-tests/cli/`.

## Commands

Run from the repository root:

```bash
pnpm test:e2e
pnpm test:e2e:node
pnpm test:e2e:deno
pnpm test:e2e:cloudflare
pnpm test:e2e:cli
```

## Rules

- Docker E2E tests require a running Docker daemon.
- CLI E2E tests run the compiled standalone binary in a fresh container.
- Keep package manifests private and scoped under `@e2e-tests/*`.
- Prefer adding narrow E2E coverage for packaging/runtime regressions instead of broad duplicative tests.
