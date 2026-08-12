# CLI Implementation

## Command Files

- Top-level command files use `<name>.cmd.ts`.
- Nested command groups live in a directory with a group entrypoint.
- Register new commands through `src/commands/index.ts` or the nearest group entry.

## Effect Patterns

The CLI uses `@effect/cli`, `effect`, and Bun runtime layers.

Common shape:

```typescript
import { Command } from '@effect/cli';
import { Effect } from 'effect';

export const myCmd = Command.make('my-command', {}, () =>
  Effect.gen(function* () {
    // resolve services with yield*
  })
);
```

Follow existing local patterns before introducing new service abstractions.

## Effect Platform Boundaries

`node:path`, `node:fs`, `node:os`, `node:child_process`, `process.env`, and `try`/`catch` are lint-banned (oxlint) in `src/`:

- Path arithmetic → `Path` service from `@effect/platform` (`const path = yield* Path.Path`).
- Filesystem I/O → `FileSystem` service from `@effect/platform`.
- homedir/tmpdir/platform/arch → the `NodeOs` service; subprocesses → platform `Command` or `services/detached-process.ts`.
- Environment reads → `effect/Config`; sync fallible ops (`JSON.parse`, `new URL`) → `Either.try` with a `Data.TaggedError` (JSON records via `parseJsonRecord` in `src/utils/parse-json.ts`).
- Helpers that cannot become Effects (sync callbacks, promise pipelines) take the resolved service instance as a plain parameter instead of importing Node builtins.

Never add an `eslint-disable`: `pnpm run validate:boundaries` (CI-blocking via `pnpm test`) rejects any disable not registered in `lint-boundaries.json`. Genuine new runtime boundaries require regenerating the manifest with `pnpm run validate:boundaries -- --update` plus a justification in the PR. Full policy: "Effect Boundary Policy" in `ts/packages/cli/AGENTS.md`.

## Required Checks

For CLI source changes, run from the repo root:

```bash
pnpm typecheck
pnpm --filter @composio/cli test
```

For binary behavior, pair with the `cli-e2e` skill.

## Recordings

Add VHS recordings when a user-facing command changes documented workflow, introduces a new visible command surface, or needs release-note demo coverage. Skip them for internal wiring changes or hidden developer helpers, and say why in the PR.
