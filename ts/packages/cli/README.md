# @composio/cli

> A tool for managing Composio.dev projects in Python and TypeScript.

This package defines the Composio CLI used to interact with the Composio Platform. It provides a powerful and flexible way to manage and execute tools, handle authentication, and integrate with various platforms and frameworks.

## Overview

The CLI is build using:

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

## 🧭 Commands

| Command                                                               | Description                                                                                     | Status                                                                                    |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `composio version`                                                    | Display the current CLI version.                                                                | ✅                                                                                        |
| `composio whoami`                                                     | Show the currently logged-in user/account.                                                      | ✅ It displays the local API_KEY, or shows a message if no API_KEY is found.              |
| `composio login`                                                      | Log in to the Composio SDK.                                                                     | ⏰ The session client is defined, but the authentication workflow is currently incomplete |
| `composio generate [-o, --output-dir <directory>]`                    | Auto-detect the project language (Python or TypeScript) and generate the latest app type stubs. | ✅                                                                                        |
| `composio py`                                                         | Python project-specific commands.                                                               |
| `composio py generate [-o, --output-dir <directory>]`                 | Generate updated Python stubs with the latest app data.                                         | ✅                                                                                        |
| `composio ts`                                                         | TypeScript project-specific commands.                                                           | ✅                                                                                        |
| `composio ts generate [-o, --output-dir <directory>] [--single-file]` | Generate updated TypeScript stubs, optionally as a single file.                                 | ✅                                                                                        |
| `composio upgrade`                                                    | Self-update the Composio CLI if a new release is out.                                           | 🛑 Not implemented yet                                                                    |

## Configuration

The Composio CLI supports configuration via environment variables and a JSON configuration file.

The Composio CLI also supports a JSON configuration file. The default location is `~/.composio/user_data.json`, but you can specify a custom location using the `COMPOSIO_CACHE_DIR` environment variable.

| Environment Variable   | User JSON config | Description                                                        | Default |
| ---------------------- | ---------------- | ------------------------------------------------------------------ | ------- |
| COMPOSIO_API_KEY       | `api_key`        | Your Composio API key                                              | None    |
| COMPOSIO_BASE_URL      | `base_url`       | The base URL of the Composio backend API                           | None    |
| COMPOSIO_CACHE_DIR     | `cache_dir`      | The directory where the Composio CLI stores cache files            | None    |
| COMPOSIO_LOG_LEVEL     | `log_level`      | The log level for the Composio CLI                                 | None    |
| DEBUG_OVERRIDE_VERSION | `version`        | The version to use when upgrading the Composio CLI (for debugging) | None    |

## Development

### Installation

```bash
pnpm install
```

### Build TypeScript code

```bash
pnpm build
```

### Build self-contained executable

```bash
pnpm build:bin
```

or

```bash
bun run ./scripts/build-binary.ts
```

### Run interactively

```bash
pnpm cli
```

For instance, to generate type stubs for a TypeScript project, you can run:

```bash
pnpm cli ts generate
```

### Test

```bash
pnpm test
```
