# @composio/cli — Agent Instructions

> This file is mirrored to `AGENTS.md` — keep both in sync.

Built on the **Effect.ts ecosystem**, runs on **Bun**, ships as a standalone binary. Service-oriented with dependency injection via Effect layers, generator control flow (`Effect.gen`), and structured error capture.

## Required Checks

When touching anything under `src/commands/`, `src/services/`, `src/effects/`, or `src/cli-main.ts`:

```bash
pnpm typecheck        # From REPO ROOT (turbo-scoped). MUST pass before commit.
pnpm --filter @composio/cli test
pnpm --filter @composio/cli lint
```

For binary-level smoke tests: `pnpm test:e2e:cli` (Docker-based).

## Entry Points

- `src/bin.ts` — thin wrapper, delegates to `cli-main.ts`
- `src/cli-main.ts` — composes Effect layers, runs root command via `BunRuntime.runMain()`
- `src/commands/index.ts` — `buildRootCommand()` wires every command and subcommand

Core layers composed in `cli-main.ts`:
- `ComposioCliConfig` / `ComposioCliUserConfigLive` — config sources
- `ComposioUserContextLive` — auth state (`~/.composio/`)
- `ComposioSessionRepository`, `ComposioClientSingleton`, `ComposioToolkitsRepository(Cached)` — API clients
- `TerminalUILive` — Clack-backed UI (see Output Conventions)
- `TriggersRealtime`, `ToolsExecutorLive`, `ProjectContext`, `ProjectEnvironmentDetector`, `CommandRunner`, `UpgradeBinary`
- `BunFileSystem.layer`, `BunContext.layer`, `FetchHttpClient.layer`

Errors flow through `effect-errors/` → source-mapped stack traces, span timelines, colored pretty print.

## Commands (`src/commands/`)

Top-level `.cmd.ts` files: `version`, `whoami`, `login`, `logout`, `upgrade`, `install`, `init`, `listen`, `proxy`, `run`, `artifacts`, `dev`.

Subcommand groups (each is a directory):

| Group                | Key subcommands                                                |
| -------------------- | -------------------------------------------------------------- |
| `auth-configs/`      | list, get, create (manage OAuth/API auth configs)              |
| `config/`            | config / `config experimental` (toggle experimental features)  |
| `connected-accounts/`| list, get, link, delete                                        |
| `connections/`       | `connections list` (new — PR #3206)                            |
| `generate/`          | `generate`, `generate ts`, `generate py`                       |
| `logs-cmd/`          | `logs list`, `logs get` — tool execution logs                  |
| `orgs/`              | Org-level operations                                           |
| `projects/`          | Project-level operations                                       |
| `toolkits/`          | list, get                                                      |
| `tools/`             | list, search, execute (also available at root: `composio execute`) |
| `triggers/`          | list, get, enable/disable (also at root: `composio triggers`)  |
| `py/`, `ts/`         | Language-specific generate helpers                             |

Options declared via `Options.text()`, `Options.boolean()`, `Options.choice()`, `Options.directory()` with Effect Schema.

Root-level help verbosity is handled by `root-help.ts` — supports `--help`, `--help=more`, `--help=all`.

## Services (`src/services/`)

| Service                            | Role                                                          |
| ---------------------------------- | ------------------------------------------------------------- |
| `config`                           | Merged config (env → user config → defaults)                  |
| `cli-user-config`                  | Reads/writes `~/.composio/user-config.json`                   |
| `user-context`                     | Auth state, API key resolution (now via OS keyring)           |
| `composio-clients` / `-cached`     | API client + file-cached decorator                            |
| `composio-error-overrides`         | Friendly messages for common API errors                       |
| `session-artifacts`                | Tool-router session artifact storage                          |
| `terminal-ui`                      | Clack-backed UI abstraction (stdout/stderr split, see below)  |
| `tools-executor`                   | Parallel tool execution with typed input validation           |
| `tool-input-validation`            | Schema-based argument validation                              |
| `tool-file-uploads`                | File/URL input normalization                                  |
| `tool-router-session-connections`  | Preloads custom auth connections into sessions                |
| `triggers-realtime`                | Live trigger event stream (Pusher-backed, for `composio listen`) |
| `command-runner` / `command-hints` | Subcommand dispatch + hint graph rendering                    |
| `command-project`, `project-*`     | Detects project root, language, runtime                       |
| `env-lang-detector`                | TS vs Python detection from config/lock files                 |
| `js-package-manager-detector`      | npm / pnpm / yarn / bun detection                             |
| `upgrade-binary`                   | GitHub release self-update (stable + beta channels)           |
| `update-check`                     | Background version check                                      |
| `run-subagent-*`                   | `composio run` subagent runtime (ACP, legacy, output-MCP)     |
| `run-companion-modules`            | Bundled helper modules for `run` subagent                     |
| `stdin`, `node-os`, `node-process` | Platform/IO abstractions                                      |

`@composio/cli-keyring` (workspace package) backs OS-native keyring storage for the API key (PR #3202 migrated from plaintext).

## Effects (`src/effects/`)

Cross-cutting Effect computations: `app-config`, `debug-config`, `force-config`, `setup-cache-dir`, `toolkit-version-overrides`, `validate-toolkit-versions`, `with-log-level`, `find-composio-core-generated`, `version`, `compare-semver`, `log-metrics`.

## Code Generation (`src/generation/`)

Pipeline for `composio generate {ts,py}`:

1. Fetch toolkits/tools/triggers (optional `--toolkits` filter)
2. Index by toolkit prefix → `ToolkitIndex` map
3. Generate source via `@composio/ts-builders` AST builders
4. Optionally transpile TS → ESM JS (writing into `@composio/core/generated`)

With `--type-tools`, emits full parameter type definitions.

## Effect.ts Patterns

```typescript
Effect.gen(function* () {
  const svc = yield* ServiceName;
  const result = yield* someEffect;
  yield* Effect.log('...');
  return result;
});
```

- `Effect.all([...], { concurrency: 'unbounded' })` for parallel fetches
- `Layer.provide()` for dep composition
- `Effect.mapError()` / `Effect.catchTag()` for typed errors
- `Effect.scoped` for resource cleanup

## Output Conventions (Composable CLI)

`TerminalUI` enforces Unix-style stream separation:

- **stdout** — data only (`ui.output(value)`)
- **stderr** — all decoration (Clack intro/outro/spinner/log/note)

Rules:

1. `ui.output()` writes to stdout ONLY when piped (`!process.stdout.isTTY`); no-op in interactive mode (human sees decoration instead).
2. In piped mode, all decoration is suppressed. `composio whoami | pbcopy` gives a clean key.
3. Action commands (logout, upgrade) produce no stdout.
4. Data commands (whoami, version, login, generate) call both decoration and `ui.output()`.
5. Never write data to stderr; never write decoration to stdout.

When adding a command, ask: "Should a script capture this value?" Yes → `ui.output()` + decoration. No → decoration only.

## Reference Submodules (Read-Only)

- `ts/vendor/effect/packages/{effect,cli,platform}/src/` — Effect, @effect/cli, @effect/platform
- `ts/vendor/clack/packages/{prompts,core}/src/` — @clack/prompts, @clack/core

Don't modify these; actual deps come from npm. Consult for API shapes when adding prompts/commands.

## Recording CLI Demos

New commands should have VHS recordings:

1. Add entry to `recordings/recordings.yaml` under the appropriate group
2. Run `bun scripts/record.ts` (requires `COMPOSIO_API_KEY` + `vhs` on PATH)

Per-entry fields: `name`, `command`, `description` (comment above command), `sleepAfterEnter` (default `6s`), `height` (`'dynamic'` | pixels). Output lands in `recordings/{tapes,svgs,ascii}/<group>/<name>.*`.

## Release Workflow

Two-channel system.

**Beta (automatic):** Every push to `next` touching `ts/packages/cli/**` triggers `.github/workflows/build-cli-binaries.yml`:
- Finds latest stable `@composio/cli@X.Y.Z`, computes `X.Y.(Z+1)`
- Builds cross-platform binaries (linux-x64, linux-aarch64, darwin-x64, darwin-aarch64)
- Publishes GitHub prerelease tagged `@composio/cli@X.Y.(Z+1)-beta.<run_number>`
- Users install via `composio upgrade --beta`
- Also triggerable from any branch via `workflow_dispatch` → `build-beta`

**Stable (via changeset):**
1. Create `.changeset/<name>.md` with `"@composio/cli": patch`
2. Merge into `next`
3. Changeset bot opens "Release: update version" PR; merge it
4. Push to `next` with new `package.json` version → stable build (`@composio/cli@X.Y.Z`, `latest`) + npm publish via `ts.release.yml`

**Manual promote:** `workflow_dispatch` → `promote-stable` with beta tag (e.g. `@composio/cli@0.2.20-beta.42`).

Key files: `.github/workflows/build-cli-binaries.yml`, `.github/workflows/ts.release.yml`, `.github/workflows/cli.test-installation.yml`, `.changeset/config.json`.

## CLI Design Guidelines

For flag/argument/help/output UX principles, see:

- Cursor rules: `ts/packages/cli/.cursor/rules/cli-design-guidelines.mdc`
- Claude skill: `.claude/skills/create-cli/SKILL.md`

Use these when adding commands or shaping flag interfaces.
