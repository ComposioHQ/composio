# @composio/cli

> A tool for managing Composio.dev projects in Python and TypeScript.

This package defines the Composio CLI used to interact with the Composio Platform. It provides a powerful and flexible way to manage and execute tools, handle authentication, and integrate with various platforms and frameworks.

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

## 🧭 Commands

| Command                                                                                                                | Description                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `composio version`                                                                                                     | Display the current CLI version.                                                                                   |
| `composio whoami`                                                                                                      | Show the currently logged-in user/account.                                                                         |
| `composio login [--no-browser]`                                                                                        | Log in to the Composio SDK.                                                                                        |
| `composio logout`                                                                                                      | Log out from the Composio SDK.                                                                                     |
| `composio generate [-o, --output-dir <directory>] [--toolkits <toolkit>] [--type-tools]`                               | Auto-detect the project language (Python or TypeScript) and generate type stubs for toolkits, tools, and triggers. |
| `composio py`                                                                                                          | Python project-specific commands.                                                                                  |
| `composio py generate [-o, --output-dir <directory>] [--toolkits <toolkit>]`                                           | Generate Python type stubs for toolkits, tools, and triggers from the Composio API.                                |
| `composio ts`                                                                                                          | TypeScript project-specific commands.                                                                              |
| `composio ts generate [-o, --output-dir <directory>] [--compact] [--transpiled] [--type-tools] [--toolkits <toolkit>]` | Generate TypeScript types for toolkits, tools, and triggers from the Composio API.                                 |
| `composio upgrade`                                                                                                     | Self-update the Composio CLI if a new release is out.                                                              |

## Configuration

The Composio CLI supports configuration via environment variables.
Additionally, for storing and retrieving user session context, a `user_data.json` JSON configuration file is used.

By default, this file is stored in `~/.composio`, but you can specify a custom location using the `COMPOSIO_CACHE_DIR` environment variable.

| Environment Variable   | User JSON config | Description                                                        | Default                       |
| ---------------------- | ---------------- | ------------------------------------------------------------------ | ----------------------------- |
| COMPOSIO_API_KEY       | `api_key`        | Composio backend API key                                           | None                          |
| COMPOSIO_BASE_URL      | `base_url`       | The base URL of the Composio backend API                           | https://backend.composio.dev  |
| COMPOSIO_WEB_URL       | `web_url`        | The base URL of the Composio web app                               | https://platform.composio.dev |
| COMPOSIO_CACHE_DIR     | -                | The directory where the Composio CLI stores cache files            | ~/.composio                   |
| COMPOSIO_LOG_LEVEL     | -                | The log level for the Composio CLI                                 | None                          |
| DEBUG_OVERRIDE_VERSION | -                | The version to use when upgrading the Composio CLI (for debugging) | None                          |
| FORCE_USE_CACHE        | -                | Whether to force the use of previously cached HTTP responses       | None                          |
| NO_COLOR               | -                | If set, disables color output in the CLI (https://no-color.org/)   | None                          |

Additionally, `composio upgrade` supports the following environment variables:

| Environment Variable         | Description                                                                                            | Default                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------- |
| COMPOSIO_GITHUB_API_BASE_URL | The base URL for the GitHub API                                                                        | https://api.github.com |
| COMPOSIO_GITHUB_OWNER        | The owner of the Composio repository on GitHub                                                         | ComposioHQ             |
| COMPOSIO_GITHUB_REPO         | The repository name for the Composio CLI                                                               | composio               |
| COMPOSIO_GITHUB_TAG          | The tag to use when fetching the Composio CLI binary from Github                                       | latest                 |
| COMPOSIO_GITHUB_ACCESS_TOKEN | The access token for the GitHub API. Useful during development to avoid getting rate-limited by Github | None                   |

## Caching

The CLI implements a file-based caching system for improved performance and offline capabilities.

### Cache Features

- **Cache-first reads**: When `FORCE_USE_CACHE=true`, the CLI first checks for cached data before making API calls. If you already ran `composio generate` before, it will work even if you're offline.
- **Best-effort writes**: All successful API responses are automatically cached to disk for future use.
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
bun run build:bin
```

or

```bash
bun run ./scripts/build-binary.ts
```

### Install self-contained executable

```bash
bun run install:bin
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
bun cli ts generate
```

### Test

```bash
bun run test
```
