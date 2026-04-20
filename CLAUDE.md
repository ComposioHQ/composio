# CLAUDE.md

Composio SDK monorepo -- TypeScript and Python SDKs for connecting LLMs to 500+ external tools.

## Repository Structure

```
composio/
├── ts/packages/core/          # @composio/core -- main SDK
├── ts/packages/cli/           # @composio/cli -- CLI (Effect.ts + Bun)
├── ts/packages/cli-keyring/   # @composio/cli-keyring -- OS keyring for API key storage
├── ts/packages/providers/     # AI provider integrations (openai, anthropic, google, langchain, vercel, mastra, llamaindex, cloudflare, claude-agent-sdk, openai-agents)
├── ts/packages/json-schema-to-zod/  # Schema conversion utility
├── ts/packages/ts-builders/   # TypeScript AST code generation
├── ts/e2e-tests/              # Runtime compatibility tests (Node, Deno, Cloudflare)
├── ts/vendor/                 # Read-only git submodules (effect, clack) -- DO NOT modify
├── python/                    # Python SDK (composio v0.11.5)
├── docs/                      # Documentation site (Fumadocs) -- see docs/CLAUDE.md
└── .agents/skills/            # AI agent skills (bug-fixing, cli-test, e2e, etc.)
```

## Delegated CLAUDE.md Files

- `docs/CLAUDE.md` -- documentation site tasks
- `ts/packages/cli/CLAUDE.md` -- CLI development (Effect.ts architecture, commands, services)

## Commands

```bash
# TypeScript
pnpm build                    # Build all packages
pnpm build:packages           # Build only TS packages
pnpm lint && pnpm lint:fix    # Lint
pnpm format                   # Prettier
pnpm test                     # Run all tests (Vitest)
cd ts/packages/core && pnpm test  # Core tests only
pnpm test:e2e                 # E2E: Node + Deno + Cloudflare
pnpm test:e2e:node            # E2E: Node only (CJS/ESM, Docker)

# Python (always activate venv first)
cd python && make env && source .venv/bin/activate
make fmt                      # Ruff format
make chk                      # Lint + type check (ruff + mypy)
make tst                      # pytest
pytest -m core                # Core tests only

# Release
pnpm changeset                # Create changeset
pnpm changeset:version        # Version packages
pnpm changeset:release        # Publish
```

## Tooling

- **Node.js**: 20.19.0 (`.nvmrc`), **Bun**: 1.3.10, **pnpm**: 10.28.0
- **Python**: >=3.10, uses `uv` + `nox` for automation
- TypeScript uses Vitest, ESLint, Prettier, Husky pre-commit hooks
- Python uses Ruff (lint+format), mypy (types), pytest

## Key Files

- **SDK entry**: `ts/packages/core/src/index.ts`, `ts/packages/core/src/composio.ts`
- **Experimental exports**: `ts/packages/core/src/experimental/index.ts`
- **Types**: `ts/packages/core/src/types/`
- **Build configs**: `turbo.jsonc`, `tsconfig.base.json`, `tsdown.config.base.ts`
- **Python SDK**: `python/composio/` (deps: `pysher`, `pydantic>=2.6.4`, `composio-client==1.33.0`)
- **Python config**: `python/config/` (pytest.ini, mypy.ini, ruff.toml)

## Gotchas

- Default branch is `next`, not `master`.
- `ts/vendor/` submodules (Effect, Clack) are read-only reference. CLI deps come from npm.
- CLI uses `@composio/cli-keyring` for secure API key storage (OS keyring, not plaintext).
- Provider packages live under `ts/packages/providers/<name>/`, not at top level.
- Python `composio-client` version in `pyproject.toml` must match `setup.py`.
- When updating GitHub Actions, sync tool versions in `ts/docs/internal/release.md`.
- Scaffold new providers with `pnpm create:provider <name> [--agentic]`.
- `session.toolkits()` supports pagination -- do not assume all results in one call.

## Environment Variables

```bash
COMPOSIO_API_KEY              # Required: API key
COMPOSIO_BASE_URL             # Optional: custom API URL
COMPOSIO_LOG_LEVEL            # Optional: silent|error|warn|info|debug
COMPOSIO_DISABLE_TELEMETRY    # Optional: "true" to disable
COMPOSIO_USER_API_KEY         # Optional: user-level API key (CLI login)
```
