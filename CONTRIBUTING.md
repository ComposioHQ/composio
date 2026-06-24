# Contributing to Composio

Thank you for taking the time to contribute to Composio. This guide is meant to get you from a fresh checkout to a focused pull request without guessing which part of the monorepo owns a change.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Common Commands](#common-commands)
- [TypeScript SDK Workflow](#typescript-sdk-workflow)
- [Python SDK Workflow](#python-sdk-workflow)
- [Documentation Workflow](#documentation-workflow)
- [Creating Providers and Examples](#creating-providers-and-examples)
- [Testing Guidelines](#testing-guidelines)
- [Changesets](#changesets)
- [Pull Request Process](#pull-request-process)
- [Release Notes](#release-notes)
- [Questions and Support](#questions-and-support)

## Development Setup

### Prerequisites

Composio pins its local and CI toolchain in `mise.toml` and `mise.lock`. Use those files as the source of truth for Node.js, Bun, Deno, Python, uv, and pnpm versions.

Install [mise](https://mise.jdx.dev/installing-mise.html), then run:

```bash
mise install
pnpm install
```

The current toolchain includes:

- Node.js, Bun, Deno, Python, uv, and pnpm from `mise.toml`
- pnpm installed through mise's npm backend, not through Corepack
- Python workflows managed with uv

If `pnpm install` fails during the preinstall toolchain check, run `mise install` again and make sure mise is active in your shell.

### Getting Started

```bash
git clone https://github.com/YOUR_USERNAME/composio.git
cd composio
mise install
pnpm install
```

For most SDK changes, start from the `next` branch unless a maintainer asks you to target another branch.

## Project Structure

The repository is a monorepo. The main source trees are:

```text
composio/
├── ts/                         # TypeScript SDK, providers, CLI, and E2E tests
│   ├── packages/core/           # @composio/core
│   ├── packages/providers/      # TypeScript provider packages
│   ├── packages/cli/            # Composio CLI
│   └── e2e-tests/               # Runtime compatibility tests
├── python/                      # Python SDK and provider packages
│   ├── composio/                # Core Python package
│   ├── providers/               # Python provider packages
│   ├── tests/                   # Python tests
│   ├── docs/                    # Python development and release notes
│   └── examples/                # Python examples
├── docs/                        # Documentation site and generated API data
├── .github/                     # Actions, issue templates, and repository policy
├── ts/docs/internal/            # Internal TypeScript release and maintenance docs
├── mise.toml                    # Toolchain source of truth
└── toolchain-versions.json      # CI runtime matrices
```

Avoid relying on old top-level `packages/` paths. TypeScript packages live under `ts/packages/`, and Python packages live under `python/`.

## Common Commands

From the repository root:

```bash
pnpm build                  # Build packages through Turborepo
pnpm test                   # Main TypeScript package tests plus install/release checks
pnpm typecheck              # TypeScript package type checks
pnpm lint                   # ESLint for TypeScript packages
pnpm format                 # Format supported source files
pnpm test:e2e               # All E2E runtimes
pnpm test:e2e:node          # Node.js runtime E2E tests
pnpm test:e2e:deno          # Deno runtime E2E tests
pnpm test:e2e:cli           # CLI E2E tests
pnpm test:e2e:cloudflare    # Cloudflare Workers E2E tests
```

Prefer the narrowest command that proves your change. For example, run a package-level test for a small SDK fix, then mention that scope in the pull request.

## TypeScript SDK Workflow

TypeScript packages are under `ts/packages/`.

Useful commands include:

```bash
pnpm --filter @composio/core test
pnpm --filter @composio/core typecheck
pnpm --filter @composio/core build
pnpm --filter @composio/cli test
pnpm --filter @composio/cli typecheck
```

When changing provider packages, run the relevant provider tests and type checks rather than the entire monorepo if the change is isolated.

For runtime compatibility changes, check the relevant E2E package under `ts/e2e-tests/`. The root scripts support focused runtime groups such as `test:e2e:node`, `test:e2e:deno`, `test:e2e:cli`, and `test:e2e:cloudflare`.

## Python SDK Workflow

Python code is under `python/`. Use uv and the repo-pinned Python version from `mise.toml`.

Useful commands include:

```bash
uv run --project python pytest python/tests
uv run --project python ruff check --config python/config/ruff.toml python
uv run --project python ruff format --check --config python/config/ruff.toml python
```

For a small Python SDK change, run the affected test file or class first, then expand to the nearest relevant suite. For example:

```bash
uv run --project python pytest python/tests/test_tool_router.py -q
```

Python development notes live in `python/docs/`.

## Documentation Workflow

Documentation lives under `docs/`. Some data files under `docs/public/data/` and `docs/public/openapi*.json` are generated, so check the surrounding scripts before editing generated output by hand.

Useful references:

- `docs/CLAUDE.md` for docs-specific conventions
- `docs/scripts/` for documentation data generation
- `.github/workflows/docs-*.yml` for docs CI coverage

When changing docs, run the narrow validation command that matches the touched area. If a generated file changes, explain how it was regenerated in the PR body.

## Creating Providers and Examples

Use the repository scripts so package layout, README structure, and workspace metadata stay consistent.

```bash
pnpm create:provider <provider-name> [--agentic]
pnpm create:example <example-name>
```

Provider implementations should include tests, documentation, and examples that match the conventions of nearby providers. Keep provider-specific behavior in the provider package; avoid changing core SDK behavior unless the integration requires it.

## Testing Guidelines

Good pull requests include tests that pin the behavior they change.

When possible:

1. Add a focused regression test before or with the fix.
2. Cover the negative path, not only the happy path.
3. Keep fixtures minimal and local.
4. Avoid live service calls in unit tests.
5. Document any test you could not run locally.
6. Use `git diff --check` before submitting to catch whitespace issues.

For SDK changes, prefer package-level tests over broad monorepo runs unless the behavior crosses package boundaries. For docs-only changes, code tests are usually not needed, but markdown/link or generated-data checks may apply.

## Coding Standards

Follow the style of the files you edit.

General expectations:

- Keep changes focused and reviewable.
- Use clear names and small functions.
- Add comments only when they explain non-obvious behavior.
- Prefer typed errors and existing error classes over ad-hoc exceptions.
- Avoid introducing new public API surface without tests and documentation.
- Do not add boilerplate file headers unless the surrounding package already uses them.

## Changesets

Run `pnpm changeset` when your change affects a published package or user-visible package behavior.

A changeset is usually needed for:

- TypeScript or Python SDK runtime behavior changes
- New provider package behavior
- Public API additions or removals
- Bug fixes that should appear in release notes

A changeset is usually not needed for:

- Docs-only changes
- Tests-only changes
- Internal CI or repository-maintenance changes with no published package impact

If you are unsure, mention it in the PR body and ask the maintainer whether a changeset is expected.

## Pull Request Process

1. Branch from the appropriate base, usually `next`.
2. Keep the scope small and explain why the change belongs in that scope.
3. Add or update tests for behavior changes.
4. Run the narrowest meaningful validation commands.
5. Add a changeset when the change affects published package behavior.
6. Open the PR with a clear summary, test plan, and any known limitations.

A good PR body answers:

- What changed?
- Why is this the right layer for the fix?
- How was it tested?
- What is intentionally out of scope?

## Release Notes

Release processes are maintained in dedicated docs:

- TypeScript and CLI release notes: `ts/docs/internal/release.md`
- Python release notes: `python/docs/release.md`

Most contributors do not need to run release commands. Add a changeset when needed and let the release workflow handle publishing.

## Questions and Support

- Join the [Discord community](https://discord.gg/composio)
- Read the [documentation](https://docs.composio.dev)
- Open or comment on a [GitHub issue](https://github.com/ComposioHQ/composio/issues)

## License

By contributing to Composio, you agree that your contributions will be licensed under the ISC License.
