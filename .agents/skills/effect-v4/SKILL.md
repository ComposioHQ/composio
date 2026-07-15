---
name: effect-v4
description: Port the Composio CLI from Effect v3 to Effect v4 beta using the vendored upstream source oracle, exact package pins, and behavior-preserving migration checks. Use for v3-to-v4 API translation, effect/unstable/cli, Context.Service, Schema.TaggedErrorClass, Effect v4 package consolidation, or @effect/vitest v4 work under ts/packages/cli. Do not use for unrelated TypeScript SDK work or routine Effect v3 maintenance.
---

# Effect v4

The CLI still runs on Effect v3. Treat every v4 change as migration work until the package manifest, compiler, and CLI behavior checks prove the cutover.

## Start here

1. Read `ts/packages/cli/AGENTS.md` and inspect the live CLI manifest and lockfile.
2. Read [migration-workflow.md](references/migration-workflow.md) before changing dependencies or imports.
3. Read [cli-migration.md](references/cli-migration.md) for command, argument, flag, help, and runner work.
4. Read [core-patterns.md](references/core-patterns.md) for services, layers, errors, Promise interop, and renamed combinators.
5. For tests, also load `../typescript-testing/references/effect-v4-cli.md`.

## Source and package boundary

- Use `ts/vendor/effect` as a read-only source oracle. Initialize it with `git submodule update --init ts/vendor/effect` when needed; never edit or import from it.
- Record the gitlink SHA separately from npm versions. A source-oracle bump does not authorize a dependency bump.
- Pin every v4 beta exactly. Keep `effect`, `@effect/vitest`, and remaining Effect packages on the same beta; never use `^`, `@beta`, or an arbitrary snapshot for the migration baseline.
- Verify an unfamiliar API against the vendored source, then compile it against the exact package versions in `versions.json`. Source may be ahead of published packages; the compiler is the compatibility gate.

## Non-negotiables

- Preserve CLI stdout/stderr, help, parsing, exit-code, and cross-platform binary contracts.
- Use `Effect.gen` with `yield*`; use `Effect.fn` for named Effect-returning functions.
- Model expected failures with `Schema.TaggedErrorClass` and recover with typed combinators or `Match`, not manual `_tag` branching.
- Define services with `Context.Service` and explicit layers. V4 does not generate `.Default` layers.
- Wrap fallible Promises with `Effect.tryPromise`; do not use `async`/`await` or `try`/`catch` inside Effect workflows.
- Assume v3 package names and remembered APIs are wrong until the local source and checker confirm them.

## Verification

Run the deterministic example compiler after changing this skill or its TypeScript examples:

```bash
node .agents/skills/effect-v4/scripts/check-examples.mjs
```

Also run `pnpm validate:agent-skills` and `pnpm validate:skill-routing`. When production CLI code changes, add the focused CLI checks from [migration-workflow.md](references/migration-workflow.md).
