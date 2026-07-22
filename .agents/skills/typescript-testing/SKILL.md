---
name: typescript-testing
description: Select and run TypeScript SDK verification for packages, examples, type checks, linting, builds, Vitest suites, Effect v4 CLI tests, and runtime E2E tests. Use when adding tests, diagnosing TypeScript CI, choosing a focused test command, validating TypeScript package changes, or writing/porting CLI tests against effect@4.0.0-beta.99 and @effect/vitest. Do not use for Python-only checks.
---

# TypeScript Testing

Use this skill to choose verification for TypeScript changes.

Read `references/test-commands.md` before running broad checks or adding new test coverage.

Read `references/effect-v4-cli.md` before writing or modifying tests under `ts/packages/cli/test/`
— it covers `it.effect`/`layer(...)` conventions, explicit per-service test layers (no `.Default`
auto-generation in v4), and the `@effect/platform-bun` subpath-import rule.
