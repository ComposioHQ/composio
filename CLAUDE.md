# CLAUDE.md

Guidance for Claude Code working on the Composio SDK monorepo (TypeScript + Python SDKs, the `@composio/cli`, and the docs site).

## Layout

```
composio/
├── ts/
│   ├── packages/
│   │   ├── core/                    # @composio/core SDK
│   │   ├── cli/                     # @composio/cli (Effect.ts + Bun)
│   │   ├── cli-keyring/             # OS-keyring API key storage for the CLI
│   │   ├── providers/{anthropic,openai,openai-agents,google,langchain,llamaindex,mastra,vercel,cloudflare,claude-agent-sdk}/
│   │   ├── json-schema-to-zod/
│   │   └── ts-builders/
│   ├── examples/                    # Per-provider/feature example apps
│   ├── e2e-tests/{cli,runtimes/{node,deno,cloudflare}}/
│   └── vendor/{effect,clack}/       # Read-only git submodules for reference
├── python/                          # Python SDK (uv + nox + Make)
└── docs/                            # Fumadocs site (see docs/CLAUDE.md)
```

Workspaces are declared in `pnpm-workspace.yaml` (note: providers are at `ts/packages/providers/*`, not `ts/packages/wrappers/*` — older docs may say wrappers). Default branch is `next` — base all PRs against `next`.

## TypeScript / pnpm Commands

Run from repo root unless noted. Toolchain is pinned: Node via `.nvmrc`, Bun via `.bun-version`, pnpm via `package.json#packageManager`.

```bash
pnpm install                          # If preinstall fails on Bun version mismatch: BYPASS_BUN_VERSION_CHECK=1 pnpm install
pnpm build                            # turbo build, all packages
pnpm build:packages                   # only ts/packages/**
pnpm typecheck                        # turbo typecheck (uses tsgo / @typescript/native-preview)
pnpm typecheck:tsc                    # fallback to stock tsc
pnpm lint        / pnpm lint:fix
pnpm format
pnpm test                             # turbo test across packages + validate examples
pnpm test:e2e[:node|:deno|:cli|:cloudflare]
pnpm create:provider <name> [--agentic]
pnpm create:example <name>
pnpm changeset / pnpm changeset:version / pnpm changeset:release
```

Per-package work: `cd ts/packages/<pkg> && pnpm test` / `pnpm typecheck`.

## CLI (`@composio/cli`)

Built on Effect.ts + Bun. See `ts/packages/cli/CLAUDE.md` for command-by-command details. **When you touch anything under `ts/packages/cli/src/commands/`, run `pnpm typecheck` from repo root before declaring done** — the CLI uses `tsgo` and Effect's strict types catch wiring errors that runtime tests miss.

API keys are stored in the OS keyring via `@composio/cli-keyring` (migrated from plaintext in `~/.composio/`). The `composio agent` family (signup/login/whoami/inbox/claim) is the unattended-agent auth path; `composio login` is the interactive browser flow.

## Python SDK

Lives in `python/`. Uses `uv` + `nox` + a `Makefile`. The repo-root `pyproject.toml` is for tooling only; the SDK itself is `python/pyproject.toml`. Always activate the venv before `pytest`/`ruff`.

```bash
cd python
make env && source .venv/bin/activate # First-time setup (creates .venv, installs deps + providers)
make sync                             # Re-sync dependencies
make provider                         # Install all provider sub-packages editable
make fmt   # ruff format       (nox -s fmt)
make chk   # ruff + mypy       (nox -s chk)
make tst   # pytest            (nox -s tst)
make snt   # sanity tests      (nox -s snt)
pytest -m core|openai|langchain|agno  # Marker-scoped test runs
```

Python ≥3.10. Linter/formatter config: `python/config/ruff.toml`. Type checker: `python/config/mypy.ini`.

## Vendored Reference Sources

`ts/vendor/effect/` and `ts/vendor/clack/` are git submodules used as **read-only** references when working on the CLI. Never modify files under `ts/vendor/`; the actual deps come from npm. Useful paths:

- `ts/vendor/effect/packages/{effect,cli,platform}/src/`
- `ts/vendor/clack/packages/{prompts,core}/src/`

## Environment Variables

```
COMPOSIO_API_KEY               # Required for SDK + CLI calls
COMPOSIO_BASE_URL              # Override API base (defaults to backend.composio.dev)
COMPOSIO_LOG_LEVEL             # silent|error|warn|info|debug
COMPOSIO_DISABLE_TELEMETRY     # "true" to disable
COMPOSIO_TOOLKIT_VERSION_<NAME># Pin a toolkit version (CLI generate)
COMPOSIO_E2E_NODE_VERSION      # Pin Node version for e2e (e.g. 22.12.0)
COMPOSIO_E2E_DENO_VERSION      # Pin Deno version for e2e
DEBUG_OVERRIDE_VERSION         # CLI debug overrides (DEBUG_OVERRIDE_*)
FORCE_USE_CACHE                # CLI: force cached toolkits/tools
BYPASS_BUN_VERSION_CHECK       # Skip preinstall Bun-version pin check
```

## Gotchas

- **Default branch is `next`, not `main`/`master`.** PRs and rebases must target `next`.
- **Bun pin is hard**: `pnpm install`'s preinstall hook fails when `bun --version` ≠ `.bun-version`. Use `BYPASS_BUN_VERSION_CHECK=1` in sandboxes; CI sets this automatically.
- **Don't hand-edit generated TS** — anything under `@composio/core/generated` and CLI `tools-as-enums.json` / `toolkits.json` caches comes from `composio generate` or CI; regenerate instead.
- **Provider packages are at `providers/*`, not `wrappers/*`** despite `pnpm-workspace.yaml` listing both globs (only `providers/*` exists today).
- **`docs/` builds and ships independently** with Bun, not pnpm. Read `docs/CLAUDE.md` before touching MDX/links/changelog entries — code blocks are type-checked at build time.
- **GitHub Actions tool versions**: when editing `.github/workflows/`, also update the Prerequisites section in `ts/docs/internal/release.md` to match `.nvmrc`, `.bun-version`, and `package.json#packageManager`.
- **CLI release channels**: pushes to `next` that touch `ts/packages/cli/**` auto-publish a beta to GitHub Releases. Stable releases only land via a merged Changeset version-bump PR. Details in `ts/packages/cli/CLAUDE.md`.

## When Updating GitHub Actions

Update `ts/docs/internal/release.md` Prerequisites with current versions:

```bash
cat .nvmrc                                            # Node
cat .bun-version                                      # Bun
jq -r .packageManager package.json | cut -d'@' -f2    # pnpm
```
