---
name: typescript-testing
description: Select and run TypeScript SDK verification for packages, examples, type checks, linting, builds, Vitest suites, Effect-based CLI tests, and runtime E2E tests. Use when adding tests, diagnosing TypeScript CI, choosing a focused test command, validating TypeScript package changes, or migrating @effect/vitest from Effect v3 to v4. Do not use for Python-only checks or Effect v4 API translation outside tests.
---

# TypeScript Testing

Inspect the owning package's manifest and test configuration before choosing commands or test APIs. Start with the narrowest check that exercises the changed behavior, then broaden according to package and public-contract risk.

## Test posture

- Test observable behavior through public package or CLI boundaries when practical.
- Keep unit tests deterministic; mock clocks, randomness, network, process state, and filesystem boundaries rather than internal plumbing.
- Use integration or E2E coverage when behavior crosses packages, runtimes, binary packaging, stdout/stderr, or process exit boundaries.
- Treat expected Effect failures as data and assert them with narrowing helpers; avoid conditional assertions that can silently skip.
- Do not rewrite current CLI tests to Effect v4 APIs before the production dependency cutover reaches that test slice.

## Reference map

- Read [test-commands.md](references/test-commands.md) before running broad checks or adding coverage.
- Read [effect-v4-cli.md](references/effect-v4-cli.md) when porting `@effect/vitest`, test services, shared layers, `TestClock`, or typed failure assertions to Effect v4.

## Handoff

Report the focused and broader commands run, the behavior contract covered, and any skipped E2E surface with its reason.
