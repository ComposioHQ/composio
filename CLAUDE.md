# CLAUDE.md

Guidance for Claude Code when working in this repository. For Codex / generic-agent guidance see `AGENTS.md`.

## Overview

Composio SDK v3 — monorepo containing the **TypeScript SDK** (primary, under `ts/`) and the **Python SDK** (under `python/`). Built with **pnpm workspaces + Turbo** for TS, **uv + nox** for Python. Default branch: `next`.

## Repository Layout

```
composio/
├── ts/
│   ├── packages/
│   │   ├── core/              # @composio/core — main SDK
│   │   ├── providers/         # @composio/openai, anthropic, google, langchain, vercel, mastra, ...
│   │   ├── cli/               # @composio/cli — Effect.ts + Bun (see ts/packages/cli/AGENTS.md)
│   │   ├── cli-keyring/       # @composio/cli-keyring — macOS Keychain / Linux Secret Service
│   │   ├── cli-local-tools/   # @composio/cli-local-tools — local toolkit declarations
│   │   ├── json-schema-to-zod/
│   │   └── ts-builders/       # AST builders for code generation
│   ├── vendor/                # Read-only Effect + Clack submodules (do NOT modify)
│   ├── e2e-tests/             # Docker-based Node/Deno/Cloudflare runtime tests
│   └── examples/
├── python/                    # Python SDK (composio, providers, examples)
└── docs/                      # Fumadocs site (see docs/CLAUDE.md)
```

## TypeScript Commands

```bash
pnpm install                # First-time setup. Use BYPASS_BUN_VERSION_CHECK=1 if .bun-version mismatch
pnpm build                  # Build all packages (Turbo)
pnpm build:packages         # TS packages only
pnpm lint / lint:fix
pnpm format
pnpm typecheck              # MANDATORY before pushing CLI changes
pnpm test                   # Vitest, all packages
pnpm test:e2e               # All runtimes (Node CJS+ESM, Deno, Cloudflare Workers) via Docker
pnpm test:e2e:node          # Override with COMPOSIO_E2E_NODE_VERSION=22.12.0
pnpm test:e2e:deno          # Override with COMPOSIO_E2E_DENO_VERSION=2.6.7
pnpm test:e2e:cloudflare
pnpm changeset              # Create release changeset (required for stable CLI/SDK releases)
pnpm create:provider <name> [--agentic]
pnpm create:example <name>
```

Pinned tool versions: Node `.nvmrc` (20.20.2), Bun `.bun-version` (1.3.10), pnpm via `packageManager` in `package.json`. CI sets `BYPASS_BUN_VERSION_CHECK=1`; local sandboxes often need it too.

## Python Commands

```bash
cd python
make env                    # uv-managed venv with all deps (NOT pre-built in sandboxes)
source .venv/bin/activate   # ALWAYS activate before pytest/ruff/pip
make fmt                    # ruff format
make chk                    # ruff check + mypy
make tst / make snt         # pytest / sanity tests
pytest -m core              # Markers: core, openai, langchain, agno
make build / make bump
```

Python: >=3.10, <4. Formatter/linter: Ruff (88 char). Type checker: mypy strict. Core deps include `composio-client` (Stainless-generated; source repo is `ComposioHQ/composio-base-py`).

## Environment Variables

```bash
COMPOSIO_API_KEY            # Required
COMPOSIO_BASE_URL           # Optional override
COMPOSIO_LOG_LEVEL          # silent | error | warn | info | debug
COMPOSIO_DISABLE_TELEMETRY  # "true" to disable
```

## Gotchas

- **Default branch is `next`**, not `main`/`master`. Branch from `next` and target `next` for PRs.
- **Docs PRs also target `next`** (see `docs/CLAUDE.md` rule).
- `pnpm install` hard-fails on Bun version mismatch — use `BYPASS_BUN_VERSION_CHECK=1`.
- `ts/vendor/effect/` and `ts/vendor/clack/` are **read-only reference submodules** — npm provides the actual deps.
- The CLI is **Effect.ts + Bun**, not plain Node — see `ts/packages/cli/AGENTS.md` (CLI's `CLAUDE.md` is a symlink to it).
- E2E tests run in **Docker** and require Docker daemon access; skip them in restricted sandboxes.
- Tool execution code generation is auto-derived from OpenAPI specs in hermes — don't hand-edit generated files under `@composio/core/generated`.

## Key Files

- Main SDK entry: `ts/packages/core/src/index.ts`
- Core Composio class: `ts/packages/core/src/composio.ts`
- Types: `ts/packages/core/src/types/`, errors: `ts/packages/core/src/errors/`
- Build configs: `turbo.jsonc`, `tsconfig.base.json`, `tsdown.config.base.ts`
- CI release docs to update when bumping toolchain: `ts/docs/internal/release.md` (Node/Bun/pnpm versions)
- Python config: `python/Makefile`, `python/noxfile.py`, `python/config/{pytest.ini,ruff.toml}`

## See Also

- `AGENTS.md` — Codex/generic-agent variant of this file
- `docs/CLAUDE.md` — Fumadocs site, link-checker, API-reference versioning
- `ts/packages/cli/AGENTS.md` — CLI architecture, services, commands, release flow
