# AGENTS.md

Instructions for AI agents working on `@composio/cli`. The sibling `CLAUDE.md` is a symlink to this file.

## Required Checks

When you touch CLI code (anything under `ts/packages/cli/src/`), run `pnpm typecheck` from the repo root before pushing. Fix all type errors. Build/lint failures block CI.

This package pins its `typescript` dependency to TypeScript 6 (`catalog:ts6` in `package.json`) because `src/generation/typescript/*` drives the JS compiler API, which TS7 (tsgo) does not ship. The pin only affects `import ts from 'typescript'` resolution — the `tsc` binary the typecheck scripts invoke still comes from the workspace root (TS7), since the TS6 alias package only ships a `tsc6` bin. Keep the pin until the generation pipeline moves off the compiler API.

## Architecture

The CLI is built on the **Effect.ts ecosystem** and runs on **Bun**. Service-oriented architecture with dependency injection via Effect layers, generator-based control flow (`Effect.gen`), and structured error handling.

### Entry Point — `src/bin.ts` / `src/cli-main.ts`

`bin.ts` is a thin bootstrap: it strips the internal `--telemetry-debug` flag, routes background-worker invocations (analytics dispatch) through a minimal layer set, and otherwise dynamically imports `cli-main.ts`, which composes the full Effect layer stack and drives the root command through `effect/unstable/cli`'s `Command.runWith`, run via `BunRuntime.runMain()`. Key layers (see `cli-main.ts` for the complete list):

- `CliConfigLive` — `effect/unstable/cli` `CliConfig` restricted to `builtIns: [GlobalFlag.Help]` (see Configuration below); the only `CliConfig` customization Composio makes — no custom `CliOutput.Formatter` is provided, so `Command.runWith` renders help and parse errors with v4's own defaults
- `ComposioUserContextLive` — User authentication state from `~/.composio/`
- `ComposioSessionRepositoryLive` — OAuth2 session management
- `ComposioToolkitsRepositoryCachedLive` — Cached API client for toolkits/tools
- `UpgradeBinaryLive` — Self-update from GitHub releases
- `BunFileSystem.layer`, `BunPath.layer`, `BunServices.layer`, `FetchHttpClient.layer` — Bun runtime integration (`@effect/platform-bun`'s `BunContext` no longer exists in v4; `BunServices.layer` is the aggregate replacement)

`Command.runWith` renders help text and parse/validation errors itself (to the right stream) before re-failing with `CliError.ShowHelp`, which carries `[Runtime.errorReported] = false` (suppresses `runMain`'s automatic error log) and `[Runtime.errorExitCode]` (0 for a bare `--help`, 1 alongside parse errors). `cli-main.ts`'s sandboxed catch-all re-fails `ShowHelp` with its original `Cause` via `Effect.failCause` instead of swallowing it, and its custom `teardown` reads `Runtime.getErrorExitCode` off the squashed failure — so this module never prints for `ShowHelp`, it just lets the error's own contract drive `runMain`. See the module docstring at the top of `cli-main.ts` for the full rationale (argv-prefix contract with `src/commands/index.ts` included).

Errors are captured via the custom `effect-errors/` module (source-mapped stack traces, Effect span timelines, formatted output).

### Commands — `src/commands/`

Each command uses `effect/unstable/cli`'s `Command.make()` pattern. Top-level command files end in `.cmd.ts`; nested command groups live in their own subdirectory with a `<group>.cmd.ts` entry. Current top-level commands:

| Group / Command | Purpose |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `version` | Display CLI version |
| `whoami` | Show logged-in user info (writes raw API key to stdout when piped — see Output Conventions) |
| `login` | Login with browser redirect or direct user/API key (`--no-browser`, `--no-wait`, `--key`, `--user-api-key`, `--org`) |
| `logout` | Clear stored API key |
| `signup` | Create a Composio account |
| `upgrade` | Self-update binary from GitHub releases |
| `init` | Bootstrap a Composio project in the current directory |
| `install` | Set up shell integration (PATH and completions) |
| `generate {ts        | py}` | Generate type stubs (auto-detects project language if no subcommand) |
| `agent` | Manage AI agent presets |
| `toolkits` | List / inspect / version toolkits |
| `tools` | List / inspect / `execute` tools |
| `triggers` | List / manage trigger types |
| `auth-configs` | Manage auth-config resources (`ac_*`) |
| `connected-accounts` | Manage connected accounts (`ca_*`) |
| `connections` | Alias / helper for connected-account flows |
| `orgs` | Manage organizations |
| `projects` | Manage projects |
| `local-tools` | Manage local toolkits (via `@composio/cli-local-tools`) |
| `logs` | View tool-execution logs (`logs-cmd/`) |
| `config` | Read/write CLI config |
| `listen` | Listen for events |
| `proxy` | Proxy authenticated API requests |
| `run` | Run a saved script / preset |
| `dev` | Developer-only utilities |
| `artifacts` | Manage generated artifacts |

Named options use `Flag.string()`, `Flag.boolean()`, `Flag.integer()`, `Flag.choice()`, `Flag.directory()` (from `effect/unstable/cli`); positionals use `Argument.string()` / `Argument.variadic()`. Both share `.withDefault`/`.withDescription`/`.withAlias`/`.optional` combinators. Feature flags live in `feature-tags.ts` and `experimental-features.ts`.

### Services — `src/services/`

| Service                            | Purpose                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| `ComposioUserContext`              | Auth state — reads/writes `~/.composio/user-config.json`, merges env vars    |
| `ComposioSessionRepository`        | Creates OAuth2 sessions, polls until `linked` state                          |
| `ComposioToolkitsRepository`       | API client — fetches toolkits, tools, trigger types; validates versions      |
| `ComposioToolkitsRepositoryCached` | Decorator over base repository with file-based caching and graceful fallback |
| `NodeOs`                           | OS abstraction (`homedir`, `platform`, `arch`)                               |
| `JsPackageManagerDetector`         | Detects npm/pnpm/yarn/bun for install instructions                           |
| `UpgradeBinary`                    | Fetches latest release from GitHub, downloads and replaces binary            |

Services are `Context.Service` classes that export a `<Name>Shape` type and an explicit `static readonly Default` layer (`Layer.effect` / `Layer.sync`, dependencies provided with `Layer.provide`). Build a test double with `Service.of({ ... })`; there are no generated accessors or constructors.

OS credential storage uses the sibling package `@composio/cli-keyring` (macOS Keychain / Linux Secret Service).

### Effects — `src/effects/`

Reusable Effect computations: `app-config` (reads `COMPOSIO_*` env), `debug-config`, `force-config`, `setup-cache-dir`, `toolkit-version-overrides` (parses `COMPOSIO_TOOLKIT_VERSION_<NAME>=<ver>`), `validate-toolkit-versions`, `with-log-level`, `find-composio-core-generated`, `version`, `compare-semver`, `log-metrics`.

### Models — `src/models/`

Effect Schema definitions with `fromJSON` / `toJSON` helpers via `JSONTransformSchema()`: `Toolkit`, `Tool`, `TriggerType`, `UserData`, `Session`.

### Code Generation — `src/generation/`

Pipeline for `composio generate {ts,py}`:

1. **Fetch** — Toolkits, tools, trigger types (filterable via `--toolkits`)
2. **Index** — Groups by toolkit prefix into `ToolkitIndex`
3. **Generate** — Builds TS/Python source using `@composio/ts-builders` AST builders
4. **Transpile** — Optionally converts TS → ESM JS for `@composio/core/generated`

`--type-tools` includes full type definitions.

### Configuration

- CLI: `cli-config.ts` defines `ComposioCliConfig` (`builtIns: [GlobalFlag.Help]`, `effect/unstable/cli`'s `CliConfig.Service` shrank to just that one field in v4) — the only `CliConfig` customization Composio makes, wired into `cli-main.ts`'s layer stack as `CliConfigLive`. v3's `autoCorrectLimit`/`isCaseSensitive` have no v4 config equivalent, and neither is reproduced anymore: "Did you mean?" suggestions on `UnrecognizedOption`/`UnknownSubcommand` now render as v4's parser always computes them (no config knob exists to disable them, and Composio wants them), and v4's parser performs no case-folding at all, so case-sensitivity needs no knob. `cli-main.ts` provides no custom `CliOutput.Formatter` — `Command.runWith` uses v4's own `CliOutput.defaultFormatter()`. `GlobalFlag.Version` is deliberately not enabled: `composio --version`, `composio -v`, and the `composio version` command all print the same bare `pkg.version` via `ui.output()`, because `src/commands/index.ts` rewrites the flag spellings to the `version` command before parsing (`normalizeVersionFlag`).
- Constants: `constants.ts` — env prefixes (`COMPOSIO_`, `DEBUG_OVERRIDE_`)
- User config: `~/.composio/user-config.json`
- Cache files: `toolkits.json`, `tools.json`, `tools-as-enums.json`, `trigger-types.json`

### Key Dependencies

`effect` (pinned `4.0.0-rc.112`; `@effect/cli` and `@effect/platform` no longer exist as separate packages — folded into `effect`'s barrel and `effect/unstable/{cli,http,process}`), `@effect/platform-bun`, `@effect/vitest` (same exact pin), `@clack/prompts` (terminal UI — stderr by default), `picocolors`, `@composio/client` (Composio API), `@composio/core` (types), `@composio/ts-builders` (AST gen), `@composio/cli-keyring` (OS credential store), `@composio/cli-local-tools` (local toolkit defs), `@composio/json-schema-to-effect-schema`, `semver`, `open`, `extract-zip`.

## Output Conventions: Composable CLI Output

Follow the Unix convention of separating human-readable decoration from machine-readable data:

- **stdout** — data only (`ui.output()`). Captured by pipes / `$(...)` / `> file`.
- **stderr** — all decoration (Clack spinners, logs, notes, intro/outro). Visible in terminal, invisible in pipes.

The three streams are **independent contracts**. Each capability depends only on the streams that actually serve it — there is deliberately no aggregate "interactive" flag (`TerminalCapabilities` in `src/services/terminal-ui.ts`):

- **Prompting** (`canPrompt`) = `stdin.isTTY && stderr.isTTY`. stdin must accept input and stderr must display the Clack prompt. stdout is irrelevant: piping data must never change prompting or authentication behavior — `composio login | tee` behaves exactly like an attended login.
- **Machine output** = `!stdout.isTTY`. `ui.output(data)` writes only when stdout is redirected (pipe, subshell, file), or when the caller passes `{ force: true }`. Redirecting stdin or stderr must never make data leak onto a visible stdout terminal.
- **Decoration** (`canDecorate`) = `stderr.isTTY`. Spinners, logs, and notes only need stderr, so they still render when stdin or stdout is redirected.

Rules:

1. All `TerminalUI` methods **except `output()`** write to stderr via Clack's `{ output: process.stderr }`, and only when stderr is a TTY (`canDecorate`).
2. `ui.output(data)` writes to stdout **only when stdout is piped** (or with explicit `force`). No other stream participates in that decision.
3. Prompts (`ui.confirm`, `ui.select`) run only when `canPrompt`; otherwise they fall back to their defaults without blocking.
4. Piped stdout stays clean: `composio whoami | pbcopy` puts only the key in the clipboard — decoration still renders on the terminal via stderr, and is suppressed only when stderr itself is captured.
5. **Data commands** (whoami, version, login, generate, etc.) call both decoration (stderr) and `ui.output()` (stdout).
6. **Action commands** (logout, upgrade) produce no stdout data — output is purely decorative.
7. **Never** write data to stderr or decoration to stdout, and never branch program behavior (auth paths, command flow) on stdout's TTY state.

When adding a new command: ask "Does this produce a value scripts should capture?" — yes → `ui.output(value)` + `ui.log.*`/`ui.note()`. No → decoration only.

## Effect.ts Patterns

Generator-based syntax throughout:

```typescript
Effect.gen(function* () {
  const service = yield* ServiceName; // resolve dependency
  const result = yield* someEffect; // await computation
  yield* Effect.log('message');
  return result;
});
```

Key patterns: `Effect.all([...], { concurrency: 'unbounded' })` for parallel work, `Layer.provide()` for dependency composition, `Effect.mapError()` / `Effect.catchTag()` for typed errors, `Effect.scoped` for resource cleanup.

For table-driven tests over independent finite choices, use Effect Array do notation
to build a typed Cartesian product instead of enumerating every case or nesting loops:

```typescript
const cases = pipe(
  Arr.Do,
  Arr.bind('firstAxis', () => choices),
  Arr.bind('secondAxis', () => choices)
);
```

Each `Arr.bind` adds one independent axis to the generated cases.

### Effect safety and migration seams

- Never branch on an Effect value's internal tag field directly. Use the owning module's public refinement or matcher (`Option`, `Result`, `Exit`, `Cause`, `CliError`), `Match.valueTags` for exhaustive unions, or `Predicate.isTagged` for a single narrowing guard.
- Do not wrap a plain `Error` in `Effect.fail` for expected failures. Give the failure a meaningful `Data.TaggedError` type with structured fields and a preserved cause, then recover with `catchTag` / `catchTags`. Reserve `Effect.die` and `Effect.dieMessage` for impossible invariants.
- Treat `unknown`, JSON, persisted state, and API payloads as trust boundaries. Decode them with `effect/Schema` or narrow them with `Predicate`; an `as` assertion is not validation, and hand-rolled structural guards (`'x' in obj` / `typeof` chains) are not a substitute for a schema. `effect/Schema` is the CLI's schema tool — do not introduce zod here (zod is the convention in the SDK packages and docs).
- Do not inspect private `effect/unstable/cli` internals (parser state, `HelpDoc` string shapes, `CliError` suggestion machinery). `Command.runWith` renders help and parse/validation errors itself — see the entry-point section above — so command-tree introspection must stay on the public `Command.Any` surface (`name`, `alias`, `subcommands`). `CliError.InvalidValue` takes structured `{ option, value, expected, kind }` fields, not a free-form message — commands that need a custom validation message raise a local `Data.TaggedError` instead (see `src/commands/login.cmd.ts`'s `LoginOptionError`) and let it flow through the existing `effect-errors` pretty-printer, not a hand-built `CliError`.
- Prefer `Effect.mapError`, `Effect.matchEffect`, and typed recovery over `Effect.catch` blocks (the v4 name for what was `Effect.catchAll`) that flatten distinct failures into one message-only error.

### Effect Boundary Policy

All platform access goes through Effect services. `node:path`, `node:fs`, `node:os`, `node:child_process`, `process.env`, and `try`/`catch` are lint-banned (oxlint) in `src/`. Use the sanctioned equivalents:

| Need                                                          | Use                                                                                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Path arithmetic (join/resolve/dirname/…)                      | `Path` service from `effect/Path` (`const path = yield* Path.Path`)                                                                         |
| Filesystem I/O                                                | `FileSystem` service from `effect/FileSystem` (`const fs = yield* FileSystem.FileSystem`)                                                   |
| homedir / tmpdir / platform / arch                            | `NodeOs` service (`src/services/node-os.ts`, the sole `node:os` boundary)                                                                   |
| Subprocesses                                                  | `ChildProcess` / `ChildProcessSpawner` from `effect/unstable/process`; children that outlive the CLI via `src/services/detached-process.ts` |
| Environment reads                                             | `effect/Config`                                                                                                                             |
| Sync fallible ops (`JSON.parse`, `new URL`, `JSON.stringify`) | `Result.try` with a `Data.TaggedError`; JSON records via `parseJsonRecord` (`src/utils/parse-json.ts`)                                      |

Import platform modules by subpath (`import * as FileSystem from 'effect/FileSystem'`, `import * as BunFileSystem from '@effect/platform-bun/BunFileSystem'`), never from the `@effect/platform-bun` package barrel; oxlint rejects the barrel in `src/`.

Conversion patterns, in order of preference:

1. Yield the service inside existing Effect code.
2. Convert a plain helper into an Effect when its callers are Effect-hosted (a `Result` is not an `Effect` in v4 and cannot be yielded directly, even though the type checker accepts it: lift it with `Effect.fromResult(...)` inside `Effect.gen`).
3. Pass the resolved service instance (e.g. `Path.Path`, `FileSystem.FileSystem`) as a plain parameter into sync callbacks or promise pipelines that cannot become Effects (see `tool-permissions.ts`, `generation/typescript/virtual-compiler-host.ts`).
4. Modules that self-provide layers add `BunPath.layer` / `BunFileSystem.layer` / `NodeOs.Default` to their stack instead of reaching for Node builtins.

The only code allowed to bypass services sits at declared runtime boundaries: the `bin.ts` bootstrap, the child-process companion runtime (`run-helpers-runtime.ts`, `run-subagent-*` — bundled into `.mjs` files that run in the user's spawned process), import-time UI setup (`ui/colors.ts`, `ui/redact.ts`), environment **writes** and whole-environment enumeration (which `effect/Config` cannot express), and spawn-time env handshakes between parent and child `composio run` processes. Every such boundary is an inline `// eslint-disable-next-line <rule> -- <reason>` comment registered in `lint-boundaries.json`. (oxlint honors both the `eslint-disable` and `oxlint-disable` spellings; only `eslint-disable-next-line` is sanctioned here, and the boundary validator rejects `oxlint-disable` comments in `src/`. The restricted-syntax rule ships from a JS plugin, so its disables name it `eslint-js/no-restricted-syntax`.)

**Enforcement**: `pnpm run validate:boundaries` (part of `pnpm test`, CI-blocking) fails when any eslint-disable in `src/` is missing from the manifest, lacks a `-- reason`, or uses a file-wide form. Do not add new disables — thread the service instead. If code genuinely cannot run inside the Effect runtime, that is a new boundary: regenerate the manifest with `pnpm run validate:boundaries -- --update` and justify the boundary in the PR.

## Vendor Reference Sources

Read-only submodules under `ts/vendor/`, pinned at the `effect@4.0.0-rc.112` release commit (do NOT modify — actual deps come from npm). v4 folded `@effect/cli`/`@effect/platform` into the core `effect` package, so there is no longer a separate `packages/cli` or `packages/platform` — everything lives under `packages/effect/src/`:

- `ts/vendor/effect/packages/effect/src/` — core Effect runtime (`Effect`, `Schema`, `Layer`, `Context`, `Result`, `Cause`, `Config`, `FileSystem`, `Path`, `PlatformError`, …)
- `ts/vendor/effect/packages/effect/src/unstable/cli/` — `effect/unstable/cli` (`Command`, `Flag`, `Argument`, `CliError`, `CliConfig`, `CliOutput`, `GlobalFlag`, `HelpDoc`, `Completions`, `Prompt`)
- `ts/vendor/effect/packages/effect/src/unstable/http/` — `effect/unstable/http` (`HttpClient`, `HttpClientRequest`, `HttpClientResponse`, `FetchHttpClient`)
- `ts/vendor/effect/packages/effect/src/unstable/process/` — `effect/unstable/process` (`ChildProcess`, `ChildProcessSpawner`)
- `ts/vendor/effect/packages/platform/bun/src/` — `@effect/platform-bun` (`BunFileSystem`, `BunPath`, `BunServices`, `BunRuntime`, `BunChildProcessSpawner`, …)
- `ts/vendor/effect/migration/` — official v3-to-v4 migration guides (`services.md`, `schema.md`, `cause.md`, `runtime.md`, `v3-to-v4.md`, …)
- `ts/vendor/clack/packages/prompts/src/` — `@clack/prompts` (text, select, confirm, spinner, note, task, etc.)
- `ts/vendor/clack/packages/core/src/` — `@clack/core` primitives

## CLI Design Guidelines

Principles for arguments, flags, help, output, errors, interactivity, configuration, and exit codes:

- Use the repo-local `cli-command` skill for command design, implementation, Effect patterns, output conventions, and source-reference guidance.
- Use the repo-local `cli-e2e` skill for Docker-based CLI end-to-end tests under `ts/e2e-tests/cli/`.

Use these when adding new commands or making UX decisions.

## Client Cache Sync

When modifying `src/services/composio-clients.ts`, inspect `src/services/composio-clients-cached.ts` in the same change. The cached repository is a layer wrapper over `ComposioToolkitsRepository`; method additions, removals, signature changes, and new exported error types must stay in sync. Decide for each new method whether it should be cached or passed through. Validation-style methods are usually passthrough; fetch methods are usually cached.

## Recording CLI Demos

User-facing CLI commands should ship with VHS recordings (SVG + asciicast) when the command changes a documented workflow, introduces a new visible command surface, or needs demo coverage in release notes. Small internal wiring changes and hidden developer-only helpers can skip recordings if the PR says why. Workflow:

1. Add entry to `recordings/recordings.yaml` (fields: `name`, `command`, `description`, `sleepAfterEnter`, `height: dynamic` for long output).
2. Run `bun scripts/record.ts` — requires `COMPOSIO_API_KEY` and `vhs` on `PATH`.

Outputs land in `recordings/{tapes,svgs,ascii}/<group>/<name>.{tape,svg,ascii}`.

## Release Workflow

Use the repo-local `cli-release` skill before building or publishing first-party CLI binaries.

- A push to `next` touching CLI paths publishes a rolling beta automatically.
- The normal stable path promotes an existing tested beta through the `promote-stable` workflow action.
- `@composio/cli` and `@composio/cli-local-tools` are ignored by Changesets. Never add a changeset targeting either package; it wedges the TypeScript SDK release action. Put human-facing CLI notes in `CHANGELOG.md` directly.
- `package.json` uses a private development sentinel and is never a
  binary-release authority. For an intentional minor or major release,
  dispatch `build-beta` with its optional version input, verify that beta, then
  promote it normally.

### Key Workflow Files

- `.github/workflows/build-cli-binaries.yml` — binary build + release
- `.github/workflows/cli.test-installation.yml` — post-release install smoke tests
- `.github/scripts/cli-release/resolve-release-target.sh` — beta/stable target resolution
- `.changeset/config.json`
