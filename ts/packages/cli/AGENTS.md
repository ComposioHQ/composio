# AGENTS.md

Instructions for AI agents working on `@composio/cli`. The sibling `CLAUDE.md` is a symlink to this file.

## Required Checks

When you touch CLI code (anything under `ts/packages/cli/src/`), run `pnpm typecheck` from the repo root before pushing. Fix all type errors. Build/lint failures block CI.

## Architecture

The CLI is built on the **Effect.ts ecosystem** and runs on **Bun**. Service-oriented architecture with dependency injection via Effect layers, generator-based control flow (`Effect.gen`), and structured error handling.

### Entry Point — `src/bin.ts`

Bootstraps the CLI by composing Effect layers and running the root command via `BunRuntime.runMain()`:

- `CliConfigLive` — @effect/cli behavior (case-sensitive, no auto-correct, no built-ins)
- `ComposioUserContextLive` — User authentication state from `~/.composio/`
- `ComposioSessionRepositoryLive` — OAuth2 session management
- `ComposioToolkitsRepositoryCachedLive` — Cached API client for toolkits/tools
- `UpgradeBinaryLive` — Self-update from GitHub releases
- `BunFileSystem.layer`, `BunContext.layer` — Bun runtime integration

Errors are captured via the custom `effect-errors/` module (source-mapped stack traces, Effect span timelines, formatted output).

### Commands — `src/commands/`

Each command uses `@effect/cli`'s `Command.make()` pattern. Top-level command files end in `.cmd.ts`; nested command groups live in their own subdirectory with a `<group>.cmd.ts` entry. Current top-level commands:

| Group / Command           | Purpose                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `version`                 | Display CLI version                                                                                    |
| `whoami`                  | Show logged-in user info (writes raw API key to stdout when piped — see Output Conventions)            |
| `login`                   | Login with browser redirect or direct user/API key (`--no-browser`, `--no-wait`, `--key`, `--user-api-key`, `--org`) |
| `logout`                  | Clear stored API key                                                                                   |
| `signup`                  | Create a Composio account                                                                              |
| `upgrade`                 | Self-update binary from GitHub releases                                                                |
| `init`                    | Bootstrap a Composio project in the current directory                                                  |
| `install`                 | Install local-tool integrations                                                                        |
| `generate {ts|py}`        | Generate type stubs (auto-detects project language if no subcommand)                                   |
| `agent`                   | Manage AI agent presets                                                                                |
| `toolkits`                | List / inspect / version toolkits                                                                      |
| `tools`                   | List / inspect / `execute` tools                                                                       |
| `triggers`                | List / manage trigger types                                                                            |
| `auth-configs`            | Manage auth-config resources (`ac_*`)                                                                  |
| `connected-accounts`      | Manage connected accounts (`ca_*`)                                                                     |
| `connections`             | Alias / helper for connected-account flows                                                             |
| `orgs`                    | Manage organizations                                                                                   |
| `projects`                | Manage projects                                                                                        |
| `local-tools`             | Manage local toolkits (via `@composio/cli-local-tools`)                                                |
| `logs`                    | View tool-execution logs (`logs-cmd/`)                                                                 |
| `config`                  | Read/write CLI config                                                                                  |
| `listen`                  | Listen for events                                                                                      |
| `proxy`                   | Proxy authenticated API requests                                                                       |
| `run`                     | Run a saved script / preset                                                                            |
| `dev`                     | Developer-only utilities                                                                               |
| `artifacts`               | Manage generated artifacts                                                                             |

Options use `Options.text()`, `Options.boolean()`, `Options.choice()`, `Options.directory()` with Effect Schema validation. Feature flags live in `feature-tags.ts` and `experimental-features.ts`.

### Services — `src/services/`

| Service                            | Purpose                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| `ComposioUserContext`              | Auth state — reads/writes `~/.composio/user-config.json`, merges env vars    |
| `ComposioSessionRepository`        | Creates OAuth2 sessions, polls until `linked` state                          |
| `ComposioToolkitsRepository`       | API client — fetches toolkits, tools, trigger types; validates versions      |
| `ComposioToolkitsRepositoryCached` | Decorator over base repository with file-based caching and graceful fallback |
| `NodeOs`                           | OS abstraction (`homedir`, `platform`, `arch`)                               |
| `EnvLangDetector`                  | Detects project language (TS/Python) from config / lock files                |
| `JsPackageManagerDetector`         | Detects npm/pnpm/yarn/bun for install instructions                           |
| `UpgradeBinary`                    | Fetches latest release from GitHub, downloads and replaces binary            |

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

- CLI: `cli-config.ts` — `showBuiltIns: false`, `autoCorrectLimit: 0`, `isCaseSensitive: true`
- Constants: `constants.ts` — env prefixes (`COMPOSIO_`, `DEBUG_OVERRIDE_`)
- User config: `~/.composio/user-config.json`
- Cache files: `toolkits.json`, `tools.json`, `tools-as-enums.json`, `trigger-types.json`

### Key Dependencies

`effect`, `@effect/cli`, `@effect/platform`, `@effect/platform-bun`, `@clack/prompts` (terminal UI — stderr by default), `ansis` / `picocolors`, `@composio/client` (Composio API), `@composio/core` (types), `@composio/ts-builders` (AST gen), `@composio/cli-keyring` (OS credential store), `@composio/cli-local-tools` (local toolkit defs), `semver`, `open`, `decompress`.

## Output Conventions: Composable CLI Output

Follow the Unix convention of separating human-readable decoration from machine-readable data:

- **stdout** — data only (`ui.output()`). Captured by pipes / `$(...)` / `> file`.
- **stderr** — all decoration (Clack spinners, logs, notes, intro/outro). Visible in terminal, invisible in pipes.

Rules:

1. All `TerminalUI` methods **except `output()`** write to stderr via Clack's `{ output: process.stderr }`, and only in interactive mode.
2. `ui.output(data)` writes to stdout **only when piped** (checked via `process.stdout.isTTY`).
3. When stdout is piped, **all decoration is suppressed** — `composio whoami | pbcopy` is completely silent and clipboard gets the clean key.
4. **Data commands** (whoami, version, login, generate, etc.) call both decoration (stderr) and `ui.output()` (stdout).
5. **Action commands** (logout, upgrade) produce no stdout data — output is purely decorative.
6. **Never** write data to stderr or decoration to stdout.

When adding a new command: ask "Does this produce a value scripts should capture?" — yes → `ui.output(value)` + `ui.log.*`/`ui.note()`. No → decoration only.

## Effect.ts Patterns

Generator-based syntax throughout:

```typescript
Effect.gen(function* () {
  const service = yield* ServiceName; // resolve dependency
  const result = yield* someEffect;   // await computation
  yield* Effect.log('message');
  return result;
});
```

Key patterns: `Effect.all([...], { concurrency: 'unbounded' })` for parallel work, `Layer.provide()` for dependency composition, `Effect.mapError()` / `Effect.catchTag()` for typed errors, `Effect.scoped` for resource cleanup.

## Vendor Reference Sources

Read-only submodules under `ts/vendor/` (do NOT modify — actual deps come from npm):

- `ts/vendor/effect/packages/effect/src/` — core Effect runtime
- `ts/vendor/effect/packages/cli/src/` — `@effect/cli` (Command, Options, Args)
- `ts/vendor/effect/packages/platform/src/` — `@effect/platform`
- `ts/vendor/clack/packages/prompts/src/` — `@clack/prompts` (text, select, confirm, spinner, note, task, etc.)
- `ts/vendor/clack/packages/core/src/` — `@clack/core` primitives

## CLI Design Guidelines

Principles for arguments, flags, help, output, errors, interactivity, config precedence:

- Cursor rules: `ts/packages/cli/.cursor/rules/cli-design-guidelines.mdc`
- Claude skill: `/workspace/zen/skills/create-cli/` (also available as `/create-cli`)

Use these when adding new commands or making UX decisions.

## Recording CLI Demos

New commands should ship with VHS recordings (SVG + asciicast). Workflow:

1. Add entry to `recordings/recordings.yaml` (fields: `name`, `command`, `description`, `sleepAfterEnter`, `height: dynamic` for long output).
2. Run `bun scripts/record.ts` — requires `COMPOSIO_API_KEY` and `vhs` on `PATH`.

Outputs land in `recordings/{tapes,svgs,ascii}/<group>/<name>.{tape,svg,ascii}`.

## Release Workflow

Two channels: **beta** (automatic) and **stable** (manual promotion via changeset).

### Beta (automatic)

Every push to `next` touching `ts/packages/cli/**` triggers `.github/workflows/build-cli-binaries.yml`:

1. Find latest stable `@composio/cli@X.Y.Z`
2. Compute next patch `X.Y.Z+1`
3. Build cross-platform binaries (linux-x64, linux-aarch64, darwin-x64, darwin-aarch64)
4. Publish GitHub prerelease `@composio/cli@X.Y.(Z+1)-beta.<run_number>`

Also triggerable from any branch via `workflow_dispatch` → `build-beta`. Users install with `composio upgrade --beta`.

### Stable (via changeset)

1. Create changeset PR (`.changeset/<name>.md` with `"@composio/cli": patch`)
2. Merge into `next`
3. Changeset bot opens "Release: update version" PR bumping `package.json`
4. Merge that PR → push to `next` detects version change → builds **stable** release (`@composio/cli@X.Y.Z`, marked `latest`)
5. `ts.release.yml` also publishes to npm

Promote an existing beta to stable via `workflow_dispatch` → `promote-stable` with the beta tag (e.g. `@composio/cli@0.2.20-beta.42`).

### Key Workflow Files

- `.github/workflows/build-cli-binaries.yml` — binary build + release
- `.github/workflows/ts.release.yml` — changeset bot + npm publish
- `.github/workflows/cli.test-installation.yml` — post-release install smoke tests
- `.changeset/config.json`
