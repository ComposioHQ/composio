# CLI Implementation

## Command Files

- Top-level command files use `<name>.cmd.ts`.
- Nested command groups live in a directory with a group entrypoint.
- Register new commands through `src/commands/index.ts` or the nearest group entry.

## Effect Patterns

The CLI is on `effect@4.0.0-rc.115` (exact pin) plus `@effect/platform-bun`/`@effect/vitest` at the same version. `@effect/cli` and `@effect/platform` no longer exist as separate deps — their functionality is consolidated into `effect`'s barrel and `effect/unstable/*` submodules.

Common shape, from `ts/packages/cli/src/commands/tools/commands/tools.list.cmd.ts`:

```typescript
import { Argument, Command, Flag } from 'effect/unstable/cli';
import { Effect, Option } from 'effect';

const toolkit = Argument.String('toolkit').pipe(
  Argument.withDescription('Toolkit slug to list tools for (e.g. "gmail")')
);

const query = Flag.String('query').pipe(
  Flag.withDescription('Text search by name, slug, or description'),
  Flag.optional
);

const limit = Flag.Int('limit').pipe(
  Flag.withDefault(30),
  Flag.withDescription('Number of results per page (1-1000)')
);

export const myCmd = Command.make(
  'my-command',
  { toolkit, query, limit },
  ({ toolkit, query, limit }) =>
    Effect.gen(function* () {
      // resolve services with yield*
    })
).pipe(Command.withDescription('...'));
```

`Args`/`Options` (v3 `@effect/cli`) are gone — use `Argument` for positionals and `Flag` for named options, both from `effect/unstable/cli`. Constructors are capitalized (`Argument.String`, `Flag.String`/`.Boolean`/`.Int`/`.Literals`); `Argument.variadic()` remains lowercase and must be called rather than piped as a bare reference. Combinators remain lowercase (`.withDefault`/`.withDescription`/`.withAlias`/`.optional`). Optional flags read via `Option.getOrUndefined(...)`/`Option.isSome(...)`, matching the `query`/`tags` pattern above.

Follow existing local patterns before introducing new service abstractions.

## Effect Platform Boundaries

`node:path`, `node:fs`, `node:os`, `node:child_process`, `process.env`, and `try`/`catch` are lint-banned (oxlint) in `src/`:

- Path arithmetic → `Path` service from `effect/Path` (`const path = yield* Path.Path`).
- Filesystem I/O → `FileSystem` service from `effect/FileSystem` (`const fs = yield* FileSystem.FileSystem`).
- homedir/tmpdir/platform/arch → the `NodeOs` service (`src/services/node-os.ts`, a `Context.Service` with a `static readonly Default` layer); subprocesses → `ChildProcess`/`ChildProcessSpawner` from `effect/unstable/process`, or `services/detached-process.ts` for children that outlive the CLI.
- Environment reads → `effect/Config`; sync fallible ops (`JSON.parse`, `new URL`) → `Result.try` with a `Data.TaggedError` (JSON records via `parseJsonRecord` in `src/utils/parse-json.ts`, which returns `Result.Result<Record<string, unknown>, JsonParsingError>`; a `Result` is not yieldable in v4 even though it typechecks, so lift it with `yield* Effect.fromResult(parseJsonRecord(raw))`).
- Helpers that cannot become Effects (sync callbacks, promise pipelines) take the resolved service instance as a plain parameter instead of importing Node builtins.

`Either` (v3) is gone; the direct replacement is `Result` (`Either.try` → `Result.try`, `Either.isLeft`/`.left` → `Result.isFailure`/`.failure`, `Either.mapLeft` → `Result.mapError`). `ParseResult`/`ParseError` are gone too — `Schema.decodeUnknownEffect`/`Schema.decodeEffect` now fail with `Schema.SchemaError`.

Never add an `eslint-disable`: `pnpm run validate:boundaries` (CI-blocking via `pnpm test`) rejects any disable not registered in `lint-boundaries.json`. Genuine new runtime boundaries require regenerating the manifest with `pnpm run validate:boundaries -- --update` plus a justification in the PR. Full policy: "Effect Boundary Policy" in `ts/packages/cli/AGENTS.md`.

## Analytics Events

Event names and builders live in `src/analytics/events.ts`; `buildEvent` stamps every event with
`journey_stage` and `cli_channel`, and `trackCliEventEffect` (`src/analytics/dispatch.ts`) adds
`agent_host_env` (`claude`, `codex`, or `none`, from `src/services/agent-host-env.ts`) to every
enqueued envelope. Setup-related events and their extra properties:

- `CLI_SETUP_HOST_DETECTED`: `host_config_dir_present` and `host_binary_in_known_paths` only when
  `available` is `false` (probed by `src/services/agent-host-env.ts`).
- `CLI_SETUP_FAILED`: `failure_reason_code` read from `SetupCommandError.reasonCode`
  (`src/services/setup-command-error.ts`).
- `CLI_PLUGIN_HINT_SHOWN`: emitted by `src/services/plugin-hint.ts` once per printed hint with
  `command_path` and `agent_host`.

## Required Checks

For CLI source changes, run from the repo root:

```bash
pnpm typecheck
pnpm --filter @composio/cli test
```

For binary behavior, pair with the `cli-e2e` skill.

## Recordings

Add VHS recordings when a user-facing command changes documented workflow, introduces a new visible command surface, or needs release-note demo coverage. Skip them for internal wiring changes or hidden developer helpers, and say why in the PR.
