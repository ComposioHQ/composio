# AGENTS.md

TypeScript workspace guidance for AI agents.

## Scope

`ts/` contains the TypeScript SDK packages, examples, CLI, and runtime E2E tests.

## Skill Routing

- Use `typescript-sdk` for `@composio/core`, shared TypeScript package behavior, generated SDK surfaces, and modifiers.
- Use `typescript-providers` for packages under `ts/packages/providers/`.
- Use `typescript-testing` for Vitest, typecheck, package builds, examples, or runtime E2E test selection.
- Use `cli-command` or `cli-e2e` for `ts/packages/cli/` and `ts/e2e-tests/cli/`.
- Use `cli-release` for first-party CLI beta builds, stable promotion, release verification, or recovery.

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
- Never add changesets for `@composio/cli` or `@composio/cli-local-tools` while `.changeset/config.json` ignores them; record CLI notes in `ts/packages/cli/CHANGELOG.md` instead.
- Prefer focused package tests before broad workspace tests.
- Parse untyped or external data (API payloads, JSON, `unknown`) at the boundary with schemas and let inferred types flow downstream: zod in SDK packages (`@composio/core`, providers, shared packages), `effect/Schema` in `ts/packages/cli/`. Never hand-roll structural guards (`'x' in obj` / `typeof` chains) or cast parsed JSON with `as`.
