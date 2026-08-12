# AGENTS.md

Core TypeScript SDK guidance.

## Scope

This directory owns `@composio/core`: the main `Composio` class, models, providers, services, types, utilities, and generated integration surfaces.

## Skill Routing

Use `typescript-sdk` for feature work and `typescript-testing` for verification. Use `cross-sdk-parity` when behavior must match the Python SDK or generated client contracts.

## Commands

Run from the repository root unless a package-local command is more precise:

```bash
pnpm --filter @composio/core test
pnpm --filter @composio/core typecheck
pnpm typecheck
pnpm test
```

## Rules

- Keep public API changes typed and documented.
- Add regression coverage for behavior changes.
- Do not hand-edit generated client code unless the generator output is explicitly in scope.
- Check Python parity before changing shared concepts such as tools, toolkits, sessions, auth configs, or connected accounts.
- Parse untyped or external data (API payloads, JSON, `unknown`) at the boundary with zod schemas and let `z.infer` types flow downstream. Never hand-roll structural guards (`'x' in obj` / `typeof` chains) or cast parsed JSON with `as` — an assertion is not validation.
