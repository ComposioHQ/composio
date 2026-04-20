# @composio/cli

CLI for managing Composio projects, built on Effect.ts + Bun.

## Required Checks

```bash
# After touching anything in ts/packages/cli/
pnpm typecheck                # From repo root -- must pass before commit
```

## Architecture

Entry point: `src/bin.ts` -- composes Effect layers, runs root command via `BunRuntime.runMain()`.

### Commands (`src/commands/`)

| Command | Description |
|---------|-------------|
| `composio login [--key] [--user-api-key] [--org]` | Login via browser or direct API key |
| `composio logout` | Clear stored API key |
| `composio whoami` | Show logged-in user |
| `composio version` | Display CLI version |
| `composio upgrade [--beta]` | Self-update binary from GitHub releases |
| `composio generate ts\|py` | Generate type stubs for toolkits/tools/triggers |
| `composio connections list` | List connected accounts |
| `composio listen` | Listen to Composio events in real-time |
| `composio triggers` | Manage triggers |
| `composio config` | View/edit CLI configuration |
| `composio config experimental` | Toggle experimental feature flags |
| `composio run` | Execute tools via CLI |
| `composio install-skill` | Install skills for Claude/Codex/OpenClaw |
| `composio manage <subcommand>` | Manage toolkits, tools, accounts, triggers, logs, orgs, projects |

### Services (`src/services/`)

Key services: `user-context` (auth state from `~/.composio/`), `composio-clients-cached` (API client + file cache), `connected-account-selection` (multi-account, enabled by default), `config` (env var provider: `COMPOSIO_*`, `DEBUG_OVERRIDE_*`, `FORCE_*`), `tool-router-session-connections`, `triggers-realtime`, `upgrade-binary`, `tool-file-uploads`, `tool-input-validation`.

### Effects (`src/effects/`)

Reusable computations: `app-config` (USER_API_KEY, ORG_ID, PROJECT_ID, etc.), `debug-config`, `force-config`, `setup-cache-dir`, `toolkit-version-overrides`, `with-log-level`, `version`, `compare-semver`.

### Key Patterns

- Generator-based: `Effect.gen(function* () { ... })`
- `Effect.all([...], { concurrency: 'unbounded' })` for parallel fetches
- stdout = data (`ui.output()`), stderr = decoration (Clack spinners/logs)
- When piped, all decoration suppressed; only `ui.output()` writes to stdout
- API key stored in OS keyring via `@composio/cli-keyring` (migrated from plaintext)

### Code Generation (`src/generation/`)

Pipeline: Fetch toolkits/tools/triggers from API -> Index by toolkit -> Generate TS/Python source via `@composio/ts-builders` -> Optionally transpile TS to ESM JS.

### Models (`src/models/`)

Effect Schema definitions: `Toolkit`, `Tool` (with `available_versions`), `TriggerType`, `UserData` (apiKey, baseURL, webURL), `Session`, `ConnectedAccountItem`.

## Vendor Submodules (Read-Only Reference)

- `ts/vendor/effect/` -- Effect.ts source (core, @effect/cli, @effect/platform)
- `ts/vendor/clack/` -- @clack/prompts source (terminal UI)

Do NOT modify. Actual deps come from npm via `pnpm install`.

## Release Workflow

- **Beta** (automatic): push to `next` touching `ts/packages/cli/**` triggers binary build + GitHub prerelease
- **Stable**: create changeset (`.changeset/<name>.md` with `"@composio/cli": patch`), merge, changeset bot bumps version, merge that -> stable release + npm publish
- Manual promotion: `workflow_dispatch` -> `promote-stable` with beta tag
- Install beta: `composio upgrade --beta`

## Design References

- CLI design guidelines: `ts/packages/cli/.cursor/rules/cli-design-guidelines.mdc`
- VHS recordings: `recordings/recordings.yaml`, run `bun scripts/record.ts`

## Gotchas

- Multi-account selection is enabled by default in stable CLI.
- `@composio/cli-keyring` handles API key migration from plaintext to OS keyring automatically.
- Dev mode toggle via `composio config` controls experimental features.
- Link aliases are passed through tool router session creation.
