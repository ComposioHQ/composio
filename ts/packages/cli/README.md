# @composio/cli

> A CLI for discovering tools, executing them, connecting accounts, scripting workflows, and generating type stubs.

This package defines the Composio CLI used to interact with the Composio platform. It supports root workflows for searching and executing tools, plus developer-oriented `dev` commands for project, trigger, log, and connected-account management.

## Overview

The CLI is built using:

- [TypeScript](https://www.typescriptlang.org/)
- [The Effect ecosystem](https://effect.website/docs)
- [Bun](https://bun.sh/)
- [Vitest](https://vitest.dev/)

## 🧑‍💻 Usage

```
composio [--log-level all|trace|debug|info|warning|error|fatal|none]
```

### Optional Flags

- `--log-level`: Set the log verbosity level. Accepted values: all, trace, debug, info, warning, error, fatal, none
- `--install-skill [skill-name] <claude|codex|openclaw>`: Manually install the composio skill for a supported agent when automatic installation fails. `--instal-skill` is still accepted as a backward-compatible alias.

## 🧭 Commands

- `composio version`: Display the current CLI version.
- `composio whoami`: Show the currently logged-in user/account.
- `composio login [--no-browser] [--no-wait] [--key text] [--user-api-key text] [--org text] [-y, --yes] [--no-skill-install]`: Log in to the Composio CLI session.
- `composio logout`: Log out from the Composio CLI session.
- `composio orgs list|switch`: Inspect and switch your default organization context.
- `composio search <query...> [--toolkits text] [--limit integer] [--human]`: Find tools by use case across toolkits/apps.
- `composio execute <slug> [-d, --data text] [--dry-run] [--get-schema]`: Execute a tool by slug, with schema and connection checks.
- `composio link [<toolkit>] [--no-wait]`: Connect an account for a toolkit/app.
- `composio run <code> [-- ...args]` or `composio run --file <path> [-- ...args]`: Run inline or file-based TS/JS workflows with Composio helpers injected.
- `composio proxy <url> --toolkit <toolkit> [-X method] [-H header]... [-d data]`: Call a toolkit API directly through Composio using a connected account.
- `composio tools list|info`: Inspect available tools and their cached schemas.
- `composio triggers list <toolkit>|info`: Inspect toolkit-scoped trigger types and their schemas.
- `composio connections list [--toolkit <toolkit>]`: Print toolkit connection statuses as JSON.
- `composio connections remove <account>`: Interactively remove a toolkit connection after confirmation.
- `composio artifacts cwd`: Print the cwd-scoped CLI session artifacts directory.
- `composio dev <subcommand>`: Developer workflows for init, playground execution, logs, toolkits, auth configs, accounts, triggers, orgs, and projects.
- `composio generate [-o, --output-dir <directory>] [--toolkits <toolkit>] [--type-tools]`: Auto-detect the project language (Python or TypeScript) and generate type stubs for toolkits, tools, and triggers.
- `composio generate py [-o, --output-dir <directory>] [--toolkits <toolkit>]`: Generate Python type stubs for toolkits, tools, and triggers from the Composio API.
- `composio generate ts [-o, --output-dir <directory>] [--compact] [--transpiled] [--type-tools] [--toolkits <toolkit>]`: Generate TypeScript types for toolkits, tools, and triggers from the Composio API.
- `composio upgrade [--beta]`: Self-update the Composio CLI from the stable channel, or from the beta channel with `--beta`.
- `composio --install-skill [skill-name] <claude|codex|openclaw>`: Manually install the composio skill for Claude, Codex, or OpenClaw.

## Configuration

The Composio CLI supports configuration via environment variables. It stores authenticated user context in `user_data.json` and general CLI settings in `config.json`.

By default, both files are stored in `~/.composio`, but you can specify a custom location using the `COMPOSIO_CACHE_DIR` environment variable.

| Environment Variable                     | JSON config                         | Description                                                               | Default                                                                  |
| ---------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| COMPOSIO_USER_API_KEY                    | `user_data.json`: `api_key`         | Composio user API key                                                     | None                                                                     |
| COMPOSIO_ENVIRONMENT                     | -                                   | Selects the production or staging URL defaults                            | production                                                               |
| COMPOSIO_BASE_URL                        | `user_data.json`: `base_url`        | The base URL of the Composio backend API                                  | https://backend.composio.dev                                             |
| COMPOSIO_WEB_URL                         | `user_data.json`: `web_url`         | The base URL of the Composio web app                                      | https://dashboard.composio.dev/                                          |
| COMPOSIO_CACHE_DIR                       | -                                   | The directory where the Composio CLI stores cache files                   | ~/.composio                                                              |
| COMPOSIO_SESSION_DIR                     | `config.json`: `artifact_directory` | The root directory for CLI session artifacts                              | `COMPOSIO_CACHE_DIR`, then `artifact_directory`, then `$TMPDIR/composio` |
| COMPOSIO_BIN_DIR                         | -                                   | The directory `composio install` adds to `PATH` (see below)               | Resolved from the running binary                                         |
| COMPOSIO_LOG_LEVEL                       | -                                   | The log level for the Composio CLI                                        | None                                                                     |
| COMPOSIO_ORG_ID                          | -                                   | The organization ID used for project-scoped commands                      | Active project                                                           |
| COMPOSIO_PROJECT_ID                      | -                                   | The project ID used for project-scoped commands                           | Active project                                                           |
| COMPOSIO_AGENTS_BASE_URL                 | -                                   | The base URL of the Composio agents service                               | https://agents.composio.dev                                              |
| COMPOSIO_WEBHOOK_SECRET                  | -                                   | The signing secret for events forwarded by `composio dev triggers listen` | Generated for the current session                                        |
| COMPOSIO_DISABLE_CONNECTED_ACCOUNT_CACHE | -                                   | Disables the connected-account cache                                      | true                                                                     |
| COMPOSIO_PERF_DEBUG                      | -                                   | Set to `1` to write performance diagnostics                               | 0                                                                        |
| COMPOSIO_TOOL_DEBUG                      | -                                   | Set to `1` to write tool diagnostics                                      | 0                                                                        |
| DEBUG_OVERRIDE_VERSION                   | -                                   | The version to use when upgrading the Composio CLI (for debugging)        | None                                                                     |
| FORCE_USE_CACHE                          | -                                   | Whether to force the use of previously cached HTTP responses              | None                                                                     |
| NO_COLOR                                 | -                                   | If set, disables color output in the CLI (https://no-color.org/)          | None                                                                     |

The CLI and its installer use these variables to coordinate nested commands. They aren't intended for manual configuration.

| Environment Variable           | Description                                                                | Default |
| ------------------------------ | -------------------------------------------------------------------------- | ------- |
| COMPOSIO_CLI_INVOCATION_ORIGIN | Identifies whether another CLI surface, such as `composio run`, invoked it | cli     |
| COMPOSIO_CLI_PARENT_RUN_ID     | Reuses the parent run ID for nested command telemetry                      | None    |
| COMPOSIO_RUN_ACP_ONLY          | Set to `1` to disable the legacy sub-agent fallback                        | 0       |
| COMPOSIO_RUN_OUTPUT_DIR        | Shares one artifact directory across nested `composio run` commands        | None    |

Additionally, `composio upgrade` supports the following environment variables:

| Environment Variable         | Description                                                                                            | Default                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------- |
| COMPOSIO_GITHUB_API_BASE_URL | The base URL for the GitHub API                                                                        | https://api.github.com |
| COMPOSIO_GITHUB_OWNER        | The owner of the Composio repository on GitHub                                                         | ComposioHQ             |
| COMPOSIO_GITHUB_REPO         | The repository name for the Composio CLI                                                               | composio               |
| COMPOSIO_GITHUB_TAG          | The tag to use when fetching the Composio CLI binary from Github                                       | latest                 |
| COMPOSIO_GITHUB_ACCESS_TOKEN | The access token for the GitHub API. Useful during development to avoid getting rate-limited by Github | None                   |

### Choosing the PATH entry with `COMPOSIO_BIN_DIR`

`composio install` writes a single `PATH` line into your shell config. The directory it points at is resolved in this order:

1. `COMPOSIO_BIN_DIR`, when set to an absolute path
2. `~/.local/bin`, when its `composio` entry point resolves to the binary that is running
3. the directory of the running binary

Set `COMPOSIO_BIN_DIR` when the entry point users should reach is not the binary itself — a shim, a symlink farm, or a version-manager `bin` directory:

```bash
COMPOSIO_BIN_DIR="$HOME/.local/bin" composio install
```

The command aborts with a non-zero exit code, writing nothing, when the resolved directory is relative or contains a character that cannot be embedded safely in a quoted rc line (`` ` ``, `$`, `"`, `\`, a newline, or the `:` PATH separator).

### CLI binary release tags

CLI binaries are published as GitHub release assets.

- Current tag format: `@composio/cli@<semver>` (for example `@composio/cli@0.1.24`)
- Temporary compatibility: legacy `v<semver>` tags are also supported during migration
- `composio upgrade` and `install.sh` can resolve either format during the compatibility window

If you pin upgrades with `COMPOSIO_GITHUB_TAG`, prefer the package-scoped tag format:

```bash
COMPOSIO_GITHUB_TAG='@composio/cli@0.1.24' composio upgrade
```

To pull from the beta channel instead of the stable channel:

```bash
composio upgrade --beta
```

### Plugin setup release dependency

`composio setup` installs plugins from these public marketplace repositories:

- Claude Code: `ComposioHQ/composio-plugin-cc`
- Codex: `ComposioHQ/composio-plugin-openai`

Both repositories must be publicly accessible with a `composio@composio` entry before releasing a CLI version that advertises automatic plugin setup. The CLI release must also contain `composio-skill.zip`; Claude setup installs that standalone skill, while the Codex plugin bundles its own copy.

## Caching

The CLI implements a file-based caching system for improved performance and offline capabilities.

### Cache Features

- **Cache-first reads**: When `FORCE_USE_CACHE=true`, the CLI first checks for cached data before making API calls. If you already ran `composio generate` before, it will work even if you're offline.
- **Best-effort writes**: All successful API responses are automatically cached to disk for future use. Writes are atomic — a run interrupted mid-write leaves the previous cache intact rather than a truncated file.
- **Graceful fallback**: If cache files are corrupted or missing, the CLI falls back to making API calls.
- **Parameter-aware caching**: Methods with parameters include those parameters in the cache key.

### Cache Structure

Cache files are stored in the directory specified by:

1. `COMPOSIO_CACHE_DIR` environment variable (if set)
2. `~/.composio/` directory (default)

The following files are cached:

- `toolkits.json` - Results from toolkit listings
- `tools-as-enums.json` - Results from tool enum listings
- `tools.json` - Results from tool listings
- `trigger-types-as-enums.json` - Results from trigger type enumerations
- `trigger-types.json` - Results from paginated trigger types payloads

### Known toolkit slugs

`known-toolkit-slugs.json` also lives in the cache directory, but it is not one of the files above.

Running a tool means knowing which toolkit it belongs to, and the tool slug alone does not say: `GOOGLE_ANALYTICS_RUN_REPORT` belongs to `google_analytics`, not `google`. The CLI ships with the list of toolkit slugs that existed when it was built and records any it learns afterwards in this file, so resolving a toolkit costs a small local read instead of downloading the catalog.

It holds derived data, not saved API responses, so it is read on every run regardless of `FORCE_USE_CACHE` — that variable keeps its meaning of opting in to replaying previously cached API responses. Deleting the file is safe: the CLI re-learns what it needs. Being out of date is also safe, because the backend never removes a toolkit; a slug the file has never seen simply costs one catalog fetch, after which it is remembered and refreshed weekly in the background.

## Development

### Installation

```bash
pnpm install
```

### Build TypeScript code

```bash
bun run build
```

### Build self-contained executable

```bash
bun run build:binary
```

or

```bash
bun run ./scripts/build-binary.ts
```

### Install self-contained executable

```bash
bun run install:binary
```

or

```bash
bun run ./scripts/install-binary.ts ./dist/composio
```

By default, the executable will be installed in `~/.composio/composio`.
You can customize the installation directory by setting the `COMPOSIO_INSTALL_DIR` environment variable.

### Run interactively

```bash
bun cli
```

For instance, to generate type stubs for a TypeScript project, you can run:

```bash
bun cli generate ts
```

### Test

```bash
bun run test
```
