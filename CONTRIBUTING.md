# Contributing to Composio

This repository contains the Composio TypeScript SDK, Python SDK, CLI, docs site, examples, and release tooling. Read the contribution policy before you open an issue or a pull request.

## Table of Contents

- [Contribution Policy](#contribution-policy)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Commands](#development-commands)
- [Working with AI Coding Agents](#working-with-ai-coding-agents)
- [Coding Standards](#coding-standards)
- [Documentation Changes](#documentation-changes)
- [Pull Request Process](#pull-request-process)
- [Creating New Providers](#creating-new-providers)
- [Testing Guidelines](#testing-guidelines)
- [Release Process](#release-process)
- [Questions and Support](#questions-and-support)
- [License](#license)

## Contribution Policy

### Open an issue first

Issues are the preferred way to contribute. A clear bug report or feature request is often more useful to us than a pull request, and it avoids long review cycles for changes we might not accept.

- **Composio employees** can open issues and pull requests directly.
- **External contributors** should open an issue first. Open a pull request only for an existing, open issue, and link that issue in the pull request description. Wait for a maintainer to confirm the approach on the issue before you invest in a large change.

Use the [issue templates](https://github.com/ComposioHQ/composio/issues/new/choose) for bug reports, feature requests, and tool requests. For support questions, see [Questions and Support](#questions-and-support). For security issues, follow [`SECURITY.md`](.github/SECURITY.md) instead of opening a public issue.

### Pull requests we may close

We reserve the right to close pull requests that don't make a meaningful contribution to Composio's SDKs, CLI, or docs. This includes pull requests that:

- have no linked issue, when opened by an external contributor
- make cosmetic, speculative, or drive-by changes without a clear user benefit
- are too broad to review, or mix unrelated changes
- add links or content that promote a third-party project (see [Documentation Changes](#documentation-changes))
- show that the author hasn't read or verified the submitted code

### Read the code you submit

You are responsible for every line in your pull request, whether you wrote it yourself or with an LLM or coding agent. Before you open a pull request:

- Read and understand the whole diff.
- Run the relevant checks and describe what you ran.
- Remove unrelated edits, generated noise, and speculative code.
- Be ready to explain any change a reviewer asks about.

AI assistance is welcome. Unreviewed AI output is not.

### Third-party links in docs

We normally don't accept docs changes that add links to, or promote, third-party projects. The exceptions are:

- frontier model providers, such as OpenAI and Anthropic
- partners that have an agreement with Composio

### Partnerships

To propose a partnership, including a docs listing or integration, contact us through [composio.dev/contact](https://composio.dev/contact). Don't open an issue or a pull request for a partnership request.

## Development Setup

### Prerequisites

Tool versions are pinned in [`mise.toml`](mise.toml), which is the source of truth for local development and CI. It pins Node.js, pnpm, Bun, Deno, Python, and uv. Install the toolchain with [mise](https://mise.jdx.dev):

```bash
mise install
```

mise installs pnpm through its npm backend. Don't rely on Corepack for this repository.

### Getting started

1. Fork and clone the repository:

   ```bash
   git clone https://github.com/YOUR_USERNAME/composio.git
   cd composio
   ```

2. Install the toolchain and dependencies, then build and test:

   ```bash
   mise install
   pnpm install
   pnpm build
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

Don't hand-edit generated or vendored paths, such as `ts/vendor/**`, `ts/packages/core/generated/**`, and lockfiles. [`AGENTS.md`](AGENTS.md#generated-and-vendored-paths) has the full list.

## Development Commands

```bash
pnpm build              # Build all packages
pnpm build:packages     # Build TypeScript packages only
pnpm lint               # Lint TypeScript packages
pnpm lint:fix           # Fix lint issues where possible
pnpm format             # Format supported files
pnpm typecheck          # Type-check TypeScript packages
pnpm check:peer-deps    # Check peer dependencies
pnpm update:peer-deps   # Update peer dependencies

pnpm create:provider <provider-name> [--agentic]   # New TypeScript provider
pnpm create:example <example-name>                 # New TypeScript example
```

### Dead code detection

The `Dead Code` CI workflow reports likely-orphaned code on every PR. Findings land in the run's Step Summary and never fail the build. Run the same checks locally:

```bash
# TypeScript: unused files, exports, types, and dependencies
pnpm dlx knip@5            # config in knip.json

# Python: unused functions, classes, and variables
cd python && make dead-code   # vulture; allowlist in python/config/vulture_allowlist.py

# GitHub Actions: orphaned reusable workflows and composite actions
bash .github/scripts/check-orphan-ci.sh
```

These tools report false positives for public API surface, dynamic imports, and import-map targets. Verify that a finding is unreferenced before you delete it, and suppress confirmed false positives in `knip.json` or `vulture_allowlist.py`.

## Working with AI Coding Agents

This repository ships its own agent guidance, and CI keeps it accurate. An agent that reads this repository inherits its layout, commands, and rules, including the [Contribution Policy](#contribution-policy).

`AGENTS.md` files live at the root and inside each subtree (`ts/`, `python/`, `docs/`, and the packages). Coding agents read the nearest one automatically. Keep them accurate when you move code. The canonical skill tree is `.agents/skills/`, with `.claude/skills` as a compatibility symlink.

Two deterministic checks guard this guidance:

```bash
pnpm validate:agent-skills    # frontmatter, reference links, stale guidance refs, command names
pnpm validate:skill-routing   # routing smoke test over skill descriptions
```

`validate:agent-skills` parses `package.json`, `python/Makefile`, and `python/noxfile.py`, then verifies that every command mentioned in guidance exists. Both checks run in CI through `.github/workflows/agent-substrate.yml`.

If you add or rename a skill, or rewrite a skill description, run both checks and add a routing probe in `ts/scripts/test-skill-routing.mjs`. Read [`.agents/skills/skill-maintenance/SKILL.md`](.agents/skills/skill-maintenance/SKILL.md) before you author or edit a skill.

Using an agent doesn't change your responsibility: [read the code you submit](#read-the-code-you-submit).

## Coding Standards

### TypeScript

- Follow the style of the package you're editing.
- Use named exports for public APIs unless the package uses another pattern.
- Type public API changes and document them with TSDoc.
- Add focused tests for new behavior and bug fixes.
- Use Oxlint and Prettier through the repository scripts.

### Python

- Follow the existing layout under `python/`.
- Use Ruff formatting and linting through the Python make targets.
- Keep provider-specific changes inside the relevant `python/providers/*` package.
- Add pytest coverage for behavior changes.

### Error handling

- Use the existing error classes and result shapes in the package you're editing.
- Include enough context in error messages to identify the failing operation.
- Don't swallow errors unless the caller has an explicit fallback path.

## Documentation Changes

Update docs when a change affects public behavior, install flows, examples, environment variables, release steps, or provider usage.

For the documentation site, read [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) and [`docs/AGENTS.md`](docs/AGENTS.md). They cover the docs app, MDX conventions, link checks, generated data, and validation.

Docs changes follow the [third-party links policy](#third-party-links-in-docs).

## Pull Request Process

1. For external contributions, confirm that an open issue exists and that a maintainer agreed with the approach.

2. Branch from `next`, which is the base for most SDK and docs work:

   ```bash
   git checkout next
   git pull origin next
   git checkout -b feat/your-change
   ```

3. Keep the change focused on the issue. Split unrelated changes into separate pull requests.

4. Add or update tests for behavior changes, and update docs for user-facing changes.

5. Add a changeset for changes that affect published TypeScript packages:

   ```bash
   pnpm changeset
   ```

   Documentation-only and agent-guidance-only changes don't need a changeset.

6. Read your full diff and run the smallest meaningful checks locally.

7. Open a pull request against `next`. Fill in the template, link the issue, and describe how you tested the change.

## Creating New Providers

Open an issue before you build a new provider. We may decline providers we can't maintain.

### TypeScript providers

```bash
pnpm create:provider my-provider [--agentic]
```

Implement the required provider methods, add tests under the provider package, and add docs or examples for user-facing setup.

### Python providers

Run from the `python/` directory:

```bash
cd python
make create-provider name=my-provider
make create-provider name=my-provider agentic=true   # agentic provider
```

Then add provider tests and run the relevant Python checks.

## Testing Guidelines

### TypeScript SDK

```bash
pnpm test                   # Unit tests
pnpm test:e2e               # All end-to-end tests
pnpm test:e2e:node          # Runtime-specific end-to-end tests
pnpm test:e2e:deno
pnpm test:e2e:cli
pnpm test:e2e:cloudflare
pnpm test:ui                # Vitest UI
```

### Python SDK

```bash
cd python
make env
source .venv/bin/activate
make fmt
make chk
make tst
make snt
```

For a focused run, use pytest through uv:

```bash
uv run pytest tests/test_sdk.py -v
```

### Docs site

Run from `docs/`:

```bash
cd docs
bun install
bun run build
bun run lint:links
```

[`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) lists the full set of docs checks.

## Release Process

Only maintainers publish releases.

- TypeScript packages and the CLI: [`ts/docs/internal/release.md`](ts/docs/internal/release.md)
- Python packages: [`python/docs/release.md`](python/docs/release.md)

## Questions and Support

- [Documentation](https://docs.composio.dev)
- [Discord community](https://discord.gg/composio)
- [Support guide](.github/SUPPORT.md)
- Partnerships: [composio.dev/contact](https://composio.dev/contact)

## License

By contributing to Composio, you agree that your contributions are licensed under the [MIT License](LICENSE).
