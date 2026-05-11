# @composio/cli — Agent Guide

Effect.ts CLI built on Bun, distributed as cross-platform single-file binaries. This file is symlinked as `CLAUDE.md`, so it serves both Codex and Claude Code.

## Required check (blocking)

When touching anything under `src/commands/`, run `pnpm typecheck` from the **repo root** (not the package). CLI imports cross-package types from `@composio/core` and `@composio/client`; package-local `tsc` misses regressions. Don't push without it.

## Architecture

Built on the **Effect.ts** ecosystem on **Bun**. Service-oriented with DI via Effect layers, generator-based control flow (`Effect.gen`), and structured error handling. `src/bin.ts` composes layers and runs the root command via `BunRuntime.runMain()`:

- `CliConfigLive` — `@effect/cli` behavior (case-sensitive, no auto-correct, no built-ins)
- `ComposioUserContextLive` — auth state read from `~/.composio/user-config.json`
- `ComposioToolkitsRepositoryCachedLive` — API client + file-cache decorator
- `UpgradeBinaryLive` — self-update from GitHub releases
- `BunFileSystem.layer`, `BunContext.layer` — Bun platform layers

Errors are captured by the custom `effect-errors/` module — source-mapped stack traces, Effect span timelines, boxed pretty output.

## Layout

```
src/
├── bin.ts, cli-main.ts, cli-config.ts, constants.ts, type-utils.ts
├── commands/                # one *.cmd.ts per command, registered in commands/index.ts
│   ├── $default.cmd.ts, version.cmd.ts, whoami.cmd.ts, login.cmd.ts, signup.cmd.ts,
│   │   logout.cmd.ts, upgrade.cmd.ts, run.cmd.ts, proxy.cmd.ts, artifacts.cmd.ts,
│   │   install.cmd.ts, listen.cmd.ts, dev.cmd.ts, init.cmd.ts
│   ├── agent/               # agent {login, signup, claim, inbox, whoami}
│   ├── tools/               # tools {list, info, search, execute}
│   ├── triggers/            # triggers {create, enable, disable, list, listen, info, status}
│   ├── connected-accounts/, connections/, auth-configs/
│   ├── orgs/, projects/, toolkits/, logs-cmd/, local-tools/, config/
│   ├── generate/            # generate ts|py (delegates per detected language)
│   └── root-help.ts, feature-tags.ts
├── services/                # ~30 services: user-context, composio-clients(-cached),
│                            # terminal-ui, command-project, tools-executor,
│                            # triggers-realtime, agents, env-lang-detector,
│                            # connected-account-selection, run-subagent-{acp,legacy,
│                            # output-mcp,shared}, run-companion-modules, etc.
├── effects/                 # app-config, github-config, require-auth, install-skill,
│                            # validate-toolkit-versions, detect-platform, log-metrics,
│                            # select-org-project, toolkit-version-overrides, setup-cache-dir
├── generation/              # `generate ts|py` pipeline: fetch → index → emit via
│                            # @composio/ts-builders → optional TS→ESM transpile
├── effect-errors/           # Cause capture + source-mapped pretty printing
├── analytics/, models/, ui/, utils/
└── feature-tags.ts          # tagged()/experimental() — gates by CLI_EXPERIMENTAL_FEATURES
```

Root commands are wired in `src/commands/index.ts`'s `ROOT_COMMANDS` array — add new top-level commands there, gated with `tagged()` (always visible) or `experimental(flag, …)` (gated by feature flag from `src/constants.ts`).

## Models (`src/models/`)

Effect Schema types with `fromJSON`/`toJSON` via `JSONTransformSchema()`: `Toolkit`, `Tool` (with `available_versions`, `input/output_parameters`), `TriggerType`, `UserData`, `Session`.

## Effect.ts patterns

```typescript
Effect.gen(function* () {
  const service = yield* ServiceName;     // resolve dependency
  const result = yield* someEffect;       // await computation
  yield* Effect.log('message');           // side effect
  return result;
});
```

Common: `Effect.all([...], { concurrency: 'unbounded' })`, `Layer.provide()`, `Effect.mapError()`/`Effect.catchTag()`, `Effect.scoped`. Options validated with Effect Schema via `Options.text/boolean/choice/directory()`.

## Output conventions (sacred)

Unix split: **stdout = data only, stderr = decoration**.

- `ui.output(value)` writes raw data to stdout **only** when piped (`!process.stdout.isTTY`); it's a no-op in interactive mode (the human already saw the decoration).
- Every other `TerminalUI` method (`intro`, `outro`, `log.*`, `note`, `spinner`) writes to stderr via Clack's `{ output: process.stderr }`.
- When stdout is piped, **all** decoration is suppressed — `composio whoami | pbcopy` puts a clean key on the clipboard with zero noise.
- Data commands: `ui.output()` + decoration via `ui.log.*` / `ui.note()`. Action-only commands (logout, upgrade) skip `ui.output()` entirely.
- **Never** write data to stderr or decoration to stdout — breaks `$(...)`, `> file`, and pipes.

Examples:

```bash
composio whoami              # Pretty box on stderr (interactive)
composio whoami | pbcopy     # Silent — clipboard gets clean key
API_KEY=$(composio whoami)   # Silent — variable gets clean key
composio login               # All decoration on stderr, browser opens
composio login 2>/dev/null   # Silent (still opens browser, polls API)
```

## Key dependencies

`effect`, `@effect/cli`, `@effect/platform`, `@effect/platform-bun`, `@clack/prompts` (all UI to stderr), `ansis`+`picocolors` (respects `NO_COLOR`), `@composio/client`, `@composio/core`, `@composio/ts-builders`, `semver`, `open`, `decompress`.

## Vendored Effect / Clack source

`ts/vendor/effect/` and `ts/vendor/clack/` are read-only git submodules — reference only. Real deps come from npm via `pnpm install`.

- `ts/vendor/effect/packages/cli/src/` — `@effect/cli` (Command, Options, Args)
- `ts/vendor/effect/packages/effect/src/` — core runtime
- `ts/vendor/effect/packages/platform/src/` — FileSystem, Terminal
- `ts/vendor/clack/packages/prompts/src/` — high-level prompts (`text`, `select`, `spinner`, `note`, etc.)
- `ts/vendor/clack/packages/core/src/` — low-level prompt primitives

Current Clack usage is mostly `S_BAR`, `S_BAR_H`, `unicodeOr` for box-drawing in custom formatted output. Prefer `@clack/prompts` over `@clack/core` unless you need custom prompt behavior.

## CLI design guidelines

Argument/flag/help/output conventions: `ts/packages/cli/.cursor/rules/cli-design-guidelines.mdc` and the Claude skill at `.claude/skills/create-cli/SKILL.md`. Read before adding flags or designing UX.

## Demo recordings (VHS)

New user-facing commands get a VHS recording. Add an entry to `recordings/recordings.yaml`, then `bun scripts/record.ts` (needs `COMPOSIO_API_KEY` + `vhs` on PATH). Use `height: dynamic` for long output — the recorder probes 2x height, parses the SVG, then re-records at the computed height (capped at `vhs.height * 2`).

YAML fields per entry: `name` (filename stem), `command`, optional `description` (shown above command via VHS `Hide`/`Show`), optional `sleepAfterEnter` (default `6s`), optional `height` (number or `'dynamic'`).

Outputs: `recordings/{tapes,svgs,ascii}/<group>/<name>.{tape,svg,ascii}`. Shared VHS settings at `recordings/tapes/shared-config.tape` (auto-generated).

## Release workflow (two channels)

- **Beta (automatic):** every push to `next` touching `ts/packages/cli/**` runs `.github/workflows/build-cli-binaries.yml` → finds latest stable `@composio/cli@X.Y.Z` → computes patch bump `X.Y.Z+1` → builds linux/darwin × x64/aarch64 binaries → cuts a GitHub prerelease tagged `@composio/cli@X.Y.(Z+1)-beta.<run_number>`. Trigger from any branch via `workflow_dispatch` → `build-beta`. Users opt in via `composio upgrade --beta`.
- **Stable (manual promotion):** changeset PR (`.changeset/<name>.md` with `"@composio/cli": patch`) → merge into `next` → changeset bot opens "Release: update version" PR bumping `package.json` → merge that PR → push to `next` detects version bump → builds **stable** release (`@composio/cli@X.Y.Z`, marked `latest`); `ts.release.yml` also publishes to npm. Promote existing beta via `workflow_dispatch` → `promote-stable`.

Key workflow files: `.github/workflows/build-cli-binaries.yml`, `.github/workflows/ts.release.yml`, `.github/workflows/cli.test-installation.yml`, `.changeset/config.json`.

## Skills

`skills-src/` is built into shippable skills via `pnpm build:skills` (validated by `pnpm validate:skills`). Users install with `composio install`.

## Configuration

- CLI behavior: `showBuiltIns: false`, `autoCorrectLimit: 0`, `isCaseSensitive: true` (in `cli-config.ts`)
- Env-var prefixes: `COMPOSIO_*` for app config, `DEBUG_OVERRIDE_*` for debug, `FORCE_*` for force flags
- User config: `~/.composio/user-config.json` (apiKey, baseURL, webURL)
- Cache files: `~/.composio/{toolkits,tools,tools-as-enums,trigger-types}.json`
