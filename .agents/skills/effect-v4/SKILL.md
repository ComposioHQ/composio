---
name: effect-v4
description: Write, review, or upgrade Effect v4 code in the Composio CLI, cli-keyring, and json-schema-to-effect-schema packages, all pinned exactly to effect@4.0.0-rc.112 — Context.Service and explicit layers, Schema.TaggedError and typed recovery, the effect/unstable/cli command surface, and the vendored effect source oracle. Use when writing or reviewing Effect v4 code, answering a v4 API question, working in effect/unstable/cli, defining a Context.Service service, modeling an error with Schema.TaggedError, bumping the Effect prerelease pins, or verifying an unfamiliar API against ts/vendor/effect. Do not use for CLI command UX/wiring design (use cli-command) or CLI E2E tests (use cli-e2e).
---

# Effect v4

The CLI, `@composio/cli-keyring`, and `@composio/json-schema-to-effect-schema` run on
Effect v4 (release candidate). Every claim below is grounded in the migrated source, not memory of v3.

## Exact version matrix

`effect`, `@effect/platform-bun`, and `@effect/vitest`
are pinned to the **same exact** `4.0.0-rc.112` — never `^`, `@next`, or a mismatched
prerelease across packages. `@effect/cli` and `@effect/platform` no longer exist as
dependencies; their surfaces are consolidated into `effect` and `effect/unstable/*`.
See [versions.json](versions.json) for the full matrix (also `typescript`, `vitest`).

## Read next

- [references/core-patterns.md](references/core-patterns.md) — services, layers, typed
  errors, Schema, choosing between `Effect.gen` and `Effect.fn`, and the v3→v4 rename table
  (labeled historical, for recognizing stale patterns).
- [references/cli-surface.md](references/cli-surface.md) — `effect/unstable/cli`:
  `Command`, `Flag`, `Argument`, `GlobalFlag`, `CliConfig`, the custom
  `CliOutput.Formatter`, and the runner's double-print rule.
- [references/upgrade-workflow.md](references/upgrade-workflow.md) — procedure for
  bumping to a newer prerelease.

Code excerpts in those references are short quotes from real, currently-compiling repo
files (path cited at each excerpt) — not standalone examples. The compile-checked
source of truth is always the cited file itself; when it and a reference disagree,
trust the file and fix the reference.

## Non-negotiables

- `Effect.gen(function* () {...})` for effect values — the dominant form, including named
  module consts — and `(params) => Effect.gen(...)` for parameterized helpers.
  `Effect.fn(...)` is the function form whose effects carry stack-frame annotations (its
  optional name string adds a per-call tracing span), worth it for service members and
  combinator callbacks that should be attributable in error reports. All forms re-run
  their body per execution. See "`Effect.gen` vs `Effect.fn`" in core-patterns.
- Define services with `Context.Service` and an explicit `static readonly Default`/`layer`
  layer built with `Layer.succeed`/`Layer.effect`/`Layer.provide`. V4 does not generate a
  layer for you.
- Model expected failures with `Schema.TaggedError` (or a plain `Data.TaggedError`
  when no Schema fields are needed) and recover with `Effect.catchTag`/`catchTags`/`Match`,
  never manual `_tag` string comparisons.
- Wrap fallible Promises with `Effect.tryPromise({ try, catch })`; `Effect.promise` turns
  rejection into a defect. No `async`/`await` or `try`/`catch` inside Effect workflows —
  ESLint bans them in `ts/packages/cli/src`.
- Treat every remembered v3 package name and API as wrong until verified against
  `ts/vendor/effect` (read-only source oracle — never edit or import from it) and the
  installed `effect@4.0.0-rc.112` typings. Source may be ahead of the published package;
  the compiler is the compatibility gate.

## Verification

```bash
pnpm typecheck
pnpm --filter @composio/cli test
```

Run `pnpm validate:agent-skills` and `pnpm validate:skill-routing` after editing this
skill or its descriptions, and compile the TypeScript blocks in this skill and in
`typescript-testing/references/effect-v4-cli.md` against the pinned packages with:

```bash
node .agents/skills/effect-v4/scripts/check-examples.mjs
```

Blocks that quote repo files with unresolvable imports carry a `no-check` fence info string.
