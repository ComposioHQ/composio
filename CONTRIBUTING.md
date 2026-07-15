# Contributing to Composio SDK

Thank you for your interest in contributing to Composio. This guide covers the root SDK repository. The monorepo contains the TypeScript SDK, Python SDK, docs site, examples, and release tooling.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Commands](#development-commands)
- [Coding Standards](#coding-standards)
- [Documentation Requirements](#documentation-requirements)
- [Pull Request Process](#pull-request-process)
- [Creating New Providers](#creating-new-providers)
- [Testing Guidelines](#testing-guidelines)
- [Release Process](#release-process)
- [Questions and Support](#questions-and-support)

## Development Setup

### Prerequisites

Tool versions are pinned in [`mise.toml`](mise.toml), which is the source of truth for local development and CI:

- Node.js 24.17.0
- pnpm 11.8.0
- Bun 1.3.10
- Deno 2.6.7
- Python 3.12
- uv 0.8.19

Use [mise](https://mise.jdx.dev) to install the toolchain:

```bash
mise install
```

pnpm is installed through mise's npm backend. Do not rely on Corepack for this repository.

### Getting Started

1. Fork and clone the repository:

   ```bash
   git clone https://github.com/YOUR_USERNAME/composio.git
   cd composio
   ```

2. Install the pinned toolchain:

   ```bash
   mise install
   ```

3. Install dependencies:

   ```bash
   pnpm install
   ```

4. Build the project:

   ```bash
   pnpm build
   ```

5. Run tests:

   ```bash
   pnpm test
   ```

## Project Structure

```text
composio/
├── ts/                        # TypeScript SDK workspace
│   ├── packages/
│   │   ├── core/              # Core SDK package (@composio/core)
│   │   ├── cli/               # CLI binary and command implementations
│   │   ├── cli-keyring/       # Keyring helper for the CLI
│   │   ├── cli-local-tools/   # Local tools support for the CLI
│   │   ├── providers/         # AI framework provider adapters
│   │   ├── json-schema-to-zod/ # Schema conversion utility
│   │   └── ts-builders/       # TypeScript build helpers
│   ├── e2e-tests/             # Runtime and CLI end-to-end tests
│   ├── examples/              # TypeScript examples
│   └── scripts/               # TypeScript build and maintenance scripts
├── python/                    # Python SDK
│   ├── composio/              # Main Python package
│   ├── providers/             # Python provider adapters
│   ├── tests/                 # pytest test suite
│   ├── scripts/               # Python development and release scripts
│   └── docs/                  # Python release notes and process docs
├── docs/                      # Documentation site
├── test/                      # Root-level release/install script tests
└── .github/                   # GitHub Actions and shared CI actions
```

## Development Commands

```bash
# Build all packages
pnpm build

# Build TypeScript packages only
pnpm build:packages

# Lint TypeScript packages
pnpm lint

# Fix lint issues where possible
pnpm lint:fix

# Format supported files
pnpm format

# Create a new TypeScript provider
pnpm create:provider <provider-name> [--agentic]

# Create a new TypeScript example
pnpm create:example <example-name>

# Check peer dependencies
pnpm check:peer-deps

# Update peer dependencies
pnpm update:peer-deps
```

### Dead code detection

The `Dead Code` CI workflow reports likely-orphaned code on every PR (findings
land in the run's Step Summary; it never fails the build). Run the same checks
locally:

```bash
# TypeScript — unused files, exports, types and dependencies
pnpm dlx knip@5            # config in knip.json

# Python — unused functions, classes and variables
cd python && make dead-code   # vulture; allowlist in python/config/vulture_allowlist.py

# GitHub Actions — orphaned reusable workflows and composite actions
bash .github/scripts/check-orphan-ci.sh
```

These tools carry false positives (public API surface, dynamic imports,
import-map targets), so treat their output as advisory: verify a finding is
truly unreferenced before deleting, and suppress confirmed false positives via
`knip.json` / `vulture_allowlist.py`.

## Coding Standards

### TypeScript

1. Follow the style of the package you are editing.
2. Use TypeScript for new TypeScript SDK code.
3. Use named exports for public APIs unless the local package pattern says otherwise.
4. Keep public API changes typed and documented with TSDoc.
5. Add focused tests for new behavior and bug fixes.
6. Use ESLint and Prettier through the repo scripts.
7. Keep generated or vendored code out of manual edits unless the package explicitly owns that output.

### Python

1. Follow the existing Python SDK layout under `python/`.
2. Use Ruff formatting and linting through the Python make targets.
3. Keep provider-specific changes inside the relevant `python/providers/*` package.
4. Add pytest coverage for behavior changes.

### Error Handling

1. Use the existing error classes and result shapes in the package you are editing.
2. Include enough context in error messages to identify the failing operation.
3. Avoid swallowing errors unless the caller has an explicit fallback path.

## Documentation Requirements

Update docs when a change affects public behavior, install flows, examples, environment variables, release steps, or provider usage.

For documentation-site work, read [`docs/CLAUDE.md`](docs/CLAUDE.md) first. It documents the docs app, MDX conventions, link checking, generated data, and docs branch workflow.

Package documentation should generally include:

1. A short package description.
2. Installation instructions.
3. Usage examples.
4. Public API notes.
5. Environment variables or authentication requirements when relevant.
6. Provider limitations or streaming details when relevant.

## Pull Request Process

1. Create a branch from the target base branch. Most active SDK and docs work targets `next`.

   ```bash
   git checkout next
   git pull origin next
   git checkout -b feature/your-feature-name
   ```

2. Make focused changes that match the issue or feature scope.

3. Add or update tests for behavior changes.

4. Update documentation when user-facing behavior changes.

5. Add a changeset for changes that affect published TypeScript packages:

   ```bash
   pnpm changeset
   ```

   Root-level documentation-only changes, such as edits to this file, do not need a changeset.

6. Run the smallest meaningful verification command locally before opening the PR.

7. Push your branch and open a PR against the correct base branch.

## Creating New Providers

### TypeScript Providers

Use the TypeScript provider creation script:

```bash
pnpm create:provider my-provider [--agentic]
```

Then:

1. Implement the required provider methods.
2. Add tests under the provider package.
3. Add examples or docs when the provider has user-facing setup details.
4. Run the package tests and relevant build checks.

### Python Providers

Use the Python provider creation target from the `python/` directory:

```bash
cd python
make create-provider name=my-provider
```

For agentic providers:

```bash
cd python
make create-provider name=my-provider agentic=true
```

Then add provider tests and run the relevant Python checks.

## Testing Guidelines

### TypeScript SDK

Run the root TypeScript test suite:

```bash
pnpm test
```

Run all TypeScript end-to-end tests:

```bash
pnpm test:e2e
```

Run runtime-specific end-to-end tests:

```bash
pnpm test:e2e:node
pnpm test:e2e:deno
pnpm test:e2e:cli
pnpm test:e2e:cloudflare
```

Open the Vitest UI:

```bash
pnpm test:ui
```

### Python SDK

Set up the Python development environment:

```bash
cd python
make env
source .venv/bin/activate
```

Run Python checks:

```bash
make fmt
make chk
make tst
make snt
```

You can also run a focused pytest command through uv:

```bash
uv run pytest tests/test_sdk.py -v
```

### Docs Site

For docs changes:

```bash
cd docs
bun install
bun run build
bun run lint:links
```

See [`docs/CLAUDE.md`](docs/CLAUDE.md) for the full docs workflow.

## Release Process

Only maintainers publish releases.

For TypeScript package and CLI release details, use [`ts/docs/internal/release.md`](ts/docs/internal/release.md). The root scripts are:

```bash
pnpm changeset
pnpm changeset:version
pnpm changeset:release
```

For Python package release details, use [`python/docs/release.md`](python/docs/release.md). Python package versioning and release preparation are handled from the `python/` workspace.

## Questions and Support

- Join our [Discord Community](https://discord.gg/composio)
- Check our [Documentation](https://docs.composio.dev)
- File issues on [GitHub](https://github.com/ComposioHQ/composio/issues)

## License

By contributing to Composio SDK, you agree that your contributions will be licensed under the ISC License.
