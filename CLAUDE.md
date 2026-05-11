# Composio SDK

Monorepo for the Composio SDK v3 (TypeScript + Python). Default branch is **`next`** — branch from `next`, target PRs at `next`, not `master`.

`AGENTS.md` covers the same architecture for generic agents — keep them in sync when changing repo-wide structure. Per-area details live in `docs/CLAUDE.md` and `ts/packages/cli/CLAUDE.md`.

## Layout

```
composio/
├── ts/                         # TypeScript SDK (primary)
│   ├── packages/
│   │   ├── core/               # @composio/core — main SDK
│   │   ├── cli/                # @composio/cli — Effect.ts + Bun binary
│   │   ├── cli-keyring/        # OS keychain access for the CLI
│   │   ├── cli-local-tools/    # Local tool execution for the CLI
│   │   ├── providers/          # @composio/{anthropic,openai,openai-agents,
│   │   │                       #  claude-agent-sdk,google,langchain,llamaindex,
│   │   │                       #  mastra,vercel,cloudflare}
│   │   ├── json-schema-to-zod/ # Schema conversion utility
│   │   └── ts-builders/        # TS AST builders (used by CLI codegen)
│   ├── e2e-tests/              # Node CJS/ESM, Deno, Cloudflare Workers, CLI E2E
│   ├── examples/, scripts/
│   └── vendor/                 # READ-ONLY git submodules (Effect, Clack) — reference only
├── python/                     # Python SDK (uv + nox)
├── docs/                       # Fumadocs site (see docs/CLAUDE.md)
└── examples/                   # Cross-language examples
```

## Toolchain

- Node `cat .nvmrc` (currently 20.20.2), pnpm `cat package.json | jq -r .packageManager` (10.28.2), Bun `cat .bun-version` (1.3.10)
- Python `cat .python-version`, managed via `uv` + `nox`
- When editing `.github/workflows/`, also bump the version table in `ts/docs/internal/release.md`.

## TypeScript commands

```bash
pnpm install                    # Install (uses BYPASS_BUN_VERSION_CHECK=1 if Bun mismatch)
pnpm build                      # Turbo build everything
pnpm build:packages             # Just ts/packages/**
pnpm typecheck                  # Turbo typecheck (run before pushing CLI changes)
pnpm lint                       # eslint ts/packages
pnpm format                     # prettier
pnpm test                       # Vitest across packages + validate-examples
pnpm test:ui                    # Vitest UI
pnpm create:provider <name> [--agentic]
pnpm create:example <name>
pnpm check:peer-deps
pnpm changeset                  # Required for any version-bumping PR
```

E2E suites are Docker-based (Node + Deno) or Wrangler-based (Cloudflare):

```bash
pnpm test:e2e                   # All runtimes
pnpm test:e2e:node              # CJS + ESM Node compatibility
pnpm test:e2e:deno              # npm: specifier compatibility
pnpm test:e2e:cloudflare        # Cloudflare Workers
pnpm test:e2e:cli               # CLI binary E2E
COMPOSIO_E2E_NODE_VERSION=22.12.0 pnpm test:e2e:node   # Pin runtime version
```

E2E tree:

```
ts/e2e-tests/
├── _utils/                   # Shared Docker infra
├── runtimes/{node,deno,cloudflare}/<scenario>/
└── cli/                      # Used by /cli-test-with-bundling
```

Update `ts/e2e-tests/README.md` when adding new E2E scenarios.

## Python SDK

```bash
cd python
make env                         # uv venv + sync (dev) + install all providers
source .venv/bin/activate
make sync                        # Re-sync after pulling
make provider                    # Reinstall provider packages
make fmt                         # nox -s fmt (ruff)
make chk                         # nox -s chk (ruff + mypy across modules) — chk and fmt are the only nox sessions
nox -s fix                       # ruff --fix
nox -s type_inference            # Verify provider type-inference works (full provider install)
make build                       # Build wheels
make bump                        # Version bump
```

Python layout: `python/{composio,providers/*,tests,examples,scripts,config/{pytest.ini,mypy.ini,ruff.toml}}`.

Pytest markers (defined in `python/pytest.ini`): `slow`, `integration`, `unit`, `schema`. The old `core|openai|langchain|agno` markers no longer exist — use the current set.

Providers shipped: `anthropic, autogen, claude_agent_sdk, crewai, gemini, google, google_adk, langchain, langgraph, llamaindex, openai, openai_agents`.

Python deps pinned in `python/pyproject.toml` — current core: `pysher`, `pydantic>=2.6.4`, `composio-client==1.37.0`, `typing-extensions>=4.0.0`, `openai`, `json-schema-to-pydantic>=0.4.8`. Requires Python `>=3.10,<4`.

## Vendored references

`ts/vendor/effect/` and `ts/vendor/clack/` are git submodules cloned **read-only** for reference (Effect.ts and `@clack/prompts` source). Do NOT modify. CLI runtime deps come from npm. See `ts/packages/cli/CLAUDE.md` for usage.

## Environment

```
COMPOSIO_API_KEY                 # Required
COMPOSIO_BASE_URL                # Override API base
COMPOSIO_LOG_LEVEL               # silent | error | warn | info | debug
COMPOSIO_DISABLE_TELEMETRY=true  # Opt out of telemetry
DEVELOPMENT, CI                  # Mode flags
OPENAI_API_KEY                   # For OpenAI provider examples
```

## Release gotchas

- pnpm preinstall enforces Bun version against `.bun-version`. If the sandbox Bun is newer, use `BYPASS_BUN_VERSION_CHECK=1 pnpm install`. CI sets this automatically.
- Any version-bumping change requires a `pnpm changeset` entry — the changeset bot opens the release PR; merging that PR triggers npm publish + (for `@composio/cli`) a stable binary build.
- See `ts/packages/cli/CLAUDE.md` for the CLI-specific beta/stable two-channel release flow.

## Docs and CLI subprojects

- Docs site (Fumadocs, Bun-based): `docs/` — see `docs/CLAUDE.md`.
- CLI (Effect.ts, Bun binary): `ts/packages/cli/` — see `ts/packages/cli/CLAUDE.md`. Required: `pnpm typecheck` from repo root before pushing CLI command changes.
