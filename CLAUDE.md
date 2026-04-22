# Composio SDK

Monorepo containing the TypeScript SDK (primary), Python SDK, CLI, and docs site.

> For documentation tasks, see `docs/CLAUDE.md`.
> For CLI work, see `ts/packages/cli/CLAUDE.md` (aliased from `AGENTS.md`).

## Default Branch

**Default branch is `next`** (not `master` or `main`). Base all branches and PRs off `next`.

## Repository Structure

```
composio/
├── ts/
│   ├── packages/
│   │   ├── core/                 # @composio/core — main SDK (src/composio.ts)
│   │   ├── cli/                  # @composio/cli — Effect.ts + Bun, ships as binary
│   │   ├── cli-keyring/          # OS keyring integration for CLI API key storage
│   │   ├── providers/*/          # @composio/{openai,anthropic,google,langchain,vercel,mastra,...}
│   │   ├── json-schema-to-zod/   # Schema conversion utility
│   │   └── ts-builders/          # TypeScript AST code generation (for CLI `generate`)
│   ├── examples/                 # Per-provider examples (openai, anthropic, langchain, vercel, mcp, ...)
│   ├── e2e-tests/                # Runtime compat tests: node-*, deno-*, cf-*, cli-*
│   └── vendor/                   # Read-only git submodules: effect/, clack/ (reference only)
├── python/
│   ├── composio/                 # Main package (sdk.py, client, core, types.py)
│   ├── providers/*/              # openai, anthropic, langchain, langgraph, crewai, google, ...
│   └── noxfile.py                # Nox automation (fmt, chk, fix, tst, snt)
├── docs/                         # Fumadocs site (Bun); see docs/CLAUDE.md
└── plans/                        # In-flight design docs
```

## TypeScript SDK Commands

```bash
pnpm install                    # Install all workspaces
pnpm build                      # Build everything via Turbo
pnpm build:packages             # Build only ts/packages/**
pnpm typecheck                  # Turbo typecheck — REQUIRED after CLI command changes
pnpm lint / pnpm lint:fix       # ESLint over ts/packages
pnpm format                     # Prettier
pnpm test                       # Vitest across packages + validate examples
pnpm test:e2e:node              # Docker-based Node CJS/ESM compat
pnpm test:e2e:deno              # Docker-based Deno `npm:` specifier
pnpm test:e2e:cloudflare        # Cloudflare Workers runtime
pnpm test:e2e:cli               # CLI binary e2e

pnpm create:provider <name> [--agentic]   # Scaffold new provider
pnpm create:example <name>                # Scaffold new example
pnpm check:peer-deps                      # Verify provider peer deps align
```

Package manager: `pnpm@10.28.0`. Node via `.nvmrc`, Bun via `.bun-version`.

## Python SDK Commands

```bash
cd python
make env                        # Create .venv with uv, sync deps, install providers
source .venv/bin/activate       # REQUIRED before any Python command
make sync                       # Re-sync deps into existing venv
make fmt                        # ruff format
make chk                        # ruff lint + mypy (strict optional)
nox -s fix                      # Auto-fix lint
pytest -m core                  # Markers: core, openai, langchain, agno
```

Requires Python >=3.10,<4. Deps managed by `uv`, automation by `nox`.

## Release Management

```bash
pnpm changeset                  # Add a changeset for a PR
pnpm changeset:version          # Version bump (normally done by bot)
pnpm changeset:release          # Build + publish to npm
```

CLI has its own two-channel release system (beta auto, stable via changeset). See `ts/packages/cli/CLAUDE.md`.

## Environment Variables

```
COMPOSIO_API_KEY              # API key (required for most operations)
COMPOSIO_BASE_URL             # Override API base URL
COMPOSIO_LOG_LEVEL            # silent | error | warn | info | debug
COMPOSIO_DISABLE_TELEMETRY    # "true" disables telemetry
COMPOSIO_CACHE_DIR            # Override CLI cache dir (default ~/.composio/)
DEBUG_OVERRIDE_VERSION        # CLI debug: pretend to be a specific version
FORCE_USE_CACHE               # CLI: skip API, use stale cache
COMPOSIO_TOOLKIT_VERSION_<NAME>  # Pin a toolkit to a specific version
```

## Reference Submodules (Read-Only)

The CLI ecosystem is built on Effect and Clack. Source code is vendored at `ts/vendor/` as submodules for reference — **never modify** these; the actual deps come from npm.

- `ts/vendor/effect/packages/{effect,cli,platform}/src/` — Effect runtime, @effect/cli, @effect/platform
- `ts/vendor/clack/packages/{prompts,core}/src/` — @clack/prompts, @clack/core

## Gotchas

- **PRs target `next`**, not `master`. The docs site, changesets, and CLI build pipeline all key off `next`.
- **Don't modify `ts/vendor/`** — it's submoduled for reference only.
- **Always activate `python/.venv`** before running any Python command — system Python lacks deps.
- **TS code blocks in MDX are type-checked at build time** (twoslash). `bun run build` in `docs/` catches these; `bun dev` does not.
- **CLI typecheck is mandatory** when touching `ts/packages/cli/src/commands/` — run `pnpm typecheck` from repo root.
- **E2E tests run in Docker** — they are slow and require Docker daemon. Scope to the runtime you changed.
- **Examples are tutorial code** — reviewed for clarity, not production-readiness. See `docs/CLAUDE.md`.
- **`ts/packages/cli/CLAUDE.md` and `AGENTS.md` are the same file** — keep them in sync (or symlink if the tooling allows).

## GitHub Actions Maintenance

When modifying files in `.github/workflows/`, update the "Prerequisites" section in `ts/docs/internal/release.md` with current tool versions:

```bash
cat .nvmrc                                        # Node.js
cat .bun-version                                  # Bun
jq -r .packageManager package.json | cut -d'@' -f2  # pnpm
```
