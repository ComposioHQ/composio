# AGENTS.md

TypeScript workspace guidance for AI agents.

## Scope

`ts/` contains the TypeScript SDK packages, examples, CLI, and runtime E2E tests.

## Skill Routing

- Use `typescript-sdk` for `@composio/core`, shared TypeScript package behavior, generated SDK surfaces, and modifiers.
- Use `typescript-providers` for packages under `ts/packages/providers/`.
- Use `typescript-testing` for Vitest, typecheck, package builds, examples, or runtime E2E test selection.
- Use `cli-command` or `cli-e2e` for `ts/packages/cli/` and `ts/e2e-tests/cli/`.

## Commands

Run from the repository root:

```bash
pnpm build:packages
pnpm typecheck
pnpm lint:packages
pnpm test
pnpm test:e2e:node
pnpm test:e2e:deno
pnpm test:e2e:cloudflare
pnpm test:e2e:cli
```

## Rules

- Do not edit `ts/vendor/`; those submodules are read-only references.
- Keep generated outputs owned by their generator.
- Add changesets only for changes to published TypeScript packages.
- Prefer focused package tests before broad workspace tests.
