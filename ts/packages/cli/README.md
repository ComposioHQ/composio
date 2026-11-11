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
composio [--log-level All|Trace|Debug|Info|Warn|Error|Fatal|None]
```

### Optional Flags

- `--log-level`: Set the log verbosity level. Accepted values (case-sensitive): All, Trace, Debug, Info, Warn, Error, Fatal, None
- `composio setup skill <claude|codex|openclaw> [--name skill-name]`: Install the CLI skill for an agent host.

## 🧭 Commands

- `composio version` (also `composio --version` or `-v`): Display the current CLI version.
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
- `composio connections list [--toolkit <toolkit>]`: Print toolkit connections as JSON with each account's id, status, alias, and provider display name when available.
- `composio connections remove <account>`: Remove a toolkit connection after confirmation; pass `--yes` to skip the prompt, which is required when not running interactively.
- `composio artifacts cwd`: Print the cwd-scoped CLI session artifacts directory.
- `composio dev <subcommand>`: Developer workflows for init, playground execution, logs, toolkits, auth configs, accounts, triggers, orgs, and projects.
- `composio generate [-o, --output-dir <directory>] [--toolkits <toolkit>] [--type-tools]`: Auto-detect the project language (Python or TypeScript) and generate type stubs for toolkits, tools, and triggers.
- `composio generate py [-o, --output-dir <directory>] [--toolkits <toolkit>]`: Generate Python type stubs for toolkits, tools, and triggers from the Composio API.
- `composio generate ts [-o, --output-dir <directory>] [--compact] [--transpiled] [--type-tools] [--toolkits <toolkit>]`: Generate TypeScript types for toolkits, tools, and triggers from the Composio API.
- `composio upgrade [--beta]`: Self-update the Composio CLI from the stable channel, or from the beta channel with `--beta`.
- `composio setup skill <claude|codex|openclaw> [--name skill-name]`: Manually install the composio skill for Claude, Codex, or OpenClaw.

Use `composio execute <slug> --get-schema` to print a tool's input schema as JSON.
`composio execute <slug> --help` now shows command options and examples.

### Creating development triggers

For a project with 2FA enabled, pass the user who owns the connected account:

```bash
composio dev triggers create GMAIL_NEW_GMAIL_MESSAGE --connected-account-id ca_123 --user-id user_123
```

Every `composio dev` command that acts as a user (`playground-execute`,
`connected-accounts link`, `toolkits list` and `info`, `triggers create`) follows
one rule. It acts on the developer project (this directory's, or the one
`--project-name` names) as the shared `--user-id`, which works before or after
the subcommand. When omitted, it uses the directory project's test user (only
when acting on that same project), then the global test user configured by
`composio login`, and names the one it used on stderr. Setting both
`COMPOSIO_ORG_ID` and `COMPOSIO_PROJECT_ID` in the process environment overrides
directory configuration, including its test user. If no test user is resolved,
`triggers create` omits `user_id` and the server applies the project's ownership
policy. Root commands such as `composio execute` and `composio link` always act as
your own (consumer) user and take no `--user-id`.

## Configuration

The Composio CLI supports configuration via environment variables. It stores authenticated user context in `user_data.json` and general CLI settings in `config.json`.

By default, both files are stored in `~/.composio`, but you can specify a custom location using the `COMPOSIO_CACHE_DIR` environment variable.

| Environment Variable                     | JSON config                         | Description                                                                                            | Default                                                                  |
| ---------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| COMPOSIO_USER_API_KEY                    | `user_data.json`: `api_key`         | Composio user API key                                                                                  | None                                                                     |
| COMPOSIO_ENVIRONMENT                     | -                                   | Selects the production or staging URL defaults                                                         | production                                                               |
| COMPOSIO_BASE_URL                        | `user_data.json`: `base_url`        | The base URL of the Composio backend API (see below)                                                   | https://backend.composio.dev                                             |
| COMPOSIO_WEB_URL                         | `user_data.json`: `web_url`         | The base URL of the Composio web app (see below)                                                       | https://dashboard.composio.dev/                                          |
| COMPOSIO_CACHE_DIR                       | -                                   | The directory where the Composio CLI stores cache files                                                | ~/.composio                                                              |
| COMPOSIO_SESSION_DIR                     | `config.json`: `artifact_directory` | The root directory for CLI session artifacts                                                           | `COMPOSIO_CACHE_DIR`, then `artifact_directory`, then `$TMPDIR/composio` |
| COMPOSIO_BIN_DIR                         | -                                   | The directory `composio install` adds to `PATH` (see below)                                            | Resolved from the running binary                                         |
| COMPOSIO_LOG_LEVEL                       | -                                   | The log level for the Composio CLI (case-sensitive: All, Trace, Debug, Info, Warn, Error, Fatal, None) | None                                                                     |
| COMPOSIO_ORG_ID                          | -                                   | The organization ID used for project-scoped commands                                                   | Active project                                                           |
| COMPOSIO_PROJECT_ID                      | -                                   | The project ID used for project-scoped commands                                                        | Active project                                                           |
| COMPOSIO_AGENTS_BASE_URL                 | -                                   | The base URL of the Composio agents service                                                            | https://agents.composio.dev                                              |
| COMPOSIO_WEBHOOK_SECRET                  | -                                   | The signing secret for events forwarded by `composio dev triggers listen`                              | Generated for the current session                                        |
| COMPOSIO_DISABLE_CONNECTED_ACCOUNT_CACHE | -                                   | Disables the connected-account cache                                                                   | true                                                                     |
| COMPOSIO_PERF_DEBUG                      | -                                   | Set to `1` to write performance diagnostics                                                            | 0                                                                        |
| COMPOSIO_TOOL_DEBUG                      | -                                   | Set to `1` to write tool diagnostics                                                                   | 0                                                                        |
| COMPOSIO_CLI_TELEMETRY_DISABLED          | -                                   | Set to `1` to disable CLI telemetry (`COMPOSIO_DISABLE_TELEMETRY` and `TELEMETRY_DISABLED` also work)  | 0                                                                        |
| DEBUG_OVERRIDE_VERSION                   | -                                   | The version to use when upgrading the Composio CLI (for debugging)                                     | None                                                                     |
| FORCE_USE_CACHE                          | -                                   | Whether to force the use of previously cached HTTP responses                                           | None                                                                     |
| NO_COLOR                                 | -                                   | If set, disables color output in the CLI (https://no-color.org/)                                       | None                                                                     |

`composio login` records the backend it logged in to as `base_url` and `web_url` in `user_data.json`, and later commands keep using it. Setting `COMPOSIO_BASE_URL` or `COMPOSIO_ENVIRONMENT` overrides it; when that sends the stored API key to a different backend, the CLI prints a warning on stderr. A key from `COMPOSIO_USER_API_KEY` always uses the backend the environment selects. `composio logout` forgets the recorded backend.

The CLI, its installer, and the Composio agent plugins use these variables to coordinate nested commands. They aren't intended for manual configuration.

| Environment Variable           | Description                                                                                          | Default |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- | ------- |
| COMPOSIO_CLI_INVOCATION_ORIGIN | Identifies whether another CLI surface, such as `composio run`, invoked it                           | cli     |
| COMPOSIO_CLI_PARENT_RUN_ID     | Reuses the parent run ID for nested command telemetry                                                | None    |
| COMPOSIO_RUN_OUTPUT_DIR        | Shares one artifact directory across nested `composio run` commands                                  | None    |
| COMPOSIO_RUN_STAGED_FILES_FILE | Points to the temporary JSON file containing upload names and types for the child `composio execute` | None    |
| COMPOSIO_AGENT_HOST            | Names the agent host (`claude` or `codex`) whose chat the command runs in; set by the plugin's hook  | None    |
| COMPOSIO_AGENT_SESSION_ID      | Carries that host's ID for the chat; read only together with `COMPOSIO_AGENT_HOST`                   | None    |

Additionally, `composio upgrade` supports the following environment variables:

| Environment Variable         | Description                                                                                            | Default                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------- |
| COMPOSIO_GITHUB_API_BASE_URL | The base URL for the GitHub API                                                                        | https://api.github.com |
| COMPOSIO_GITHUB_OWNER        | The owner of the Composio repository on GitHub                                                         | ComposioHQ             |
| COMPOSIO_GITHUB_REPO         | The repository name for the Composio CLI                                                               | composio               |
| COMPOSIO_GITHUB_TAG          | The tag to use when fetching the Composio CLI binary from Github                                       | latest                 |
| COMPOSIO_GITHUB_ACCESS_TOKEN | The access token for the GitHub API. Useful during development to avoid getting rate-limited by Github | None                   |

Every variable above is declared in `src/config/`, one catalog per purpose; that directory is the place to look up or add a setting.

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

### Agent compaction state

Inside a Claude Code or Codex chat, the CLI reports how many times that chat was compacted, next to the agent session it already reports. The CLI cannot observe a compaction. The agent plugin's hooks record each one in a file, and the CLI reads that file.

This section is the contract for the hooks that write the file, in `ComposioHQ/composio-plugin-cc` and `ComposioHQ/composio-plugin-openai`. No released plugin writes it yet, so the CLI reports no count today.

#### Path

```text
$HOME/.composio/agent-compactions/<host>/<host_session_id>
```

- `$HOME` is the user's home directory (`%USERPROFILE%` on Windows). The path ignores `COMPOSIO_CACHE_DIR`, because a hook cannot know the value a later command runs with.
- `<host>` is `claude` or `codex`, in lower case.
- `<host_session_id>` is the host's own ID for the chat, unchanged, with no file extension.

#### Keying

The CLI reads the file of the host and session ID it resolved for the command:

1. `COMPOSIO_AGENT_HOST` and `COMPOSIO_AGENT_SESSION_ID`, when a hook exported both.
2. Otherwise `CLAUDE_CODE_SESSION_ID` for `claude`, or `CODEX_SESSION_ID`, then `CODEX_THREAD_ID`, for `codex`.

Name the file after the same host and ID your hook exports. If your hook exports nothing, name it after the ID the host puts in its own variable.

- **Nested hosts without an export.** When both hosts' own variables are present and no pair was exported, the CLI resolves no session and reads no file. So naming the file after the host's own variable works only when exactly one host's variable is set.
- **A hook that inherits a pair.** A hook that starts with a parent's exported pair already in its environment keeps that pair, and writes the file under that pair, not under its own host's ID. The CLI reads the file of the pair it resolved, and an inherited pair is the one it resolves.
- **Permissions.** Create the directories for the owner only (mode `0700`). The file names are the hosts' session IDs.

The CLI builds the path only when the ID matches `^[A-Za-z0-9_-]{1,128}$`, which every UUID does. For any other ID it reports no count. The ID is used to find this file and is never sent.

#### Format

- Plain text in UTF-8 or ASCII, append-only. Never rewrite or truncate the file.
- Windows PowerShell 5.1 writes UTF-16 with `>>` and with `Out-File`. The CLI reports no count for a UTF-16 file, so write with an explicit `utf8` or `ascii` encoding there.
- One line per compaction, ending in a newline. Append it with a single write, which `>>` in a shell hook does.
- The count is the number of lines that hold anything other than whitespace. The CLI does not parse a line, so its content is yours to choose. A timestamp is enough.
- Keep the file under 64 KiB. The CLI ignores a larger one and reports no count.

#### When to create it

Create the file, empty, when the chat starts, along with any missing parent directory. If it already exists, leave its lines in place.

A missing file and an empty file mean different things:

| State of the file | What the CLI reports |
| ----------------- | -------------------- |
| Does not exist    | No count             |
| Exists, empty     | `0`                  |
| Exists, `n` lines | `n`                  |

An empty file says "a hook is recording, and the chat was not compacted yet". No file says "nothing is recording".

#### How the CLI reads it

- The CLI only reads. It never creates, changes, or deletes the file or its directories, so removing the files of old chats is up to the writer.
- The count is read per command. Each `composio` command reads the file when it runs, and nothing is cached between commands, so the first command after a compaction reports the new count. A long-running command such as `composio listen` keeps the count it first read for its API requests.
- The count is sent as the number `agent_compaction_count` on telemetry events and as the header `x-cli-agent-compaction-count` (a decimal string) on the requests that carry the agent session headers.
- A file that is missing, unreadable, larger than 64 KiB, not a regular file, or that holds a NUL character, as a UTF-16 file does, gives no count. The command runs exactly as it would without it and prints nothing about it.
- When telemetry is disabled (`COMPOSIO_CLI_TELEMETRY_DISABLED`, `COMPOSIO_DISABLE_TELEMETRY`, `TELEMETRY_DISABLED`, or `CI`), the CLI does not read the file and sends no count.

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

The [contributor guide](CONTRIBUTING.md) explains command structure, argument parsing, Effect composition, and verification through a worked example. The generated [command catalog](src/commands/COMMANDS.md) lists command registrations and their source files.

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
