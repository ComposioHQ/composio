# CLAUDE.md

This file provides guidance for PR review, code quality checks, and addressing PR comments in this repository.

## Repository Overview

This is the Composio SDK v3 monorepo containing TypeScript (`/ts/`) and Python (`/python/`) SDKs. For documentation tasks, refer to `fern/CLAUDE.md`.

## Code Quality Commands

### TypeScript

```bash
# Install dependencies
pnpm install

# Lint code
pnpm lint
pnpm lint:fix

# Format code
pnpm format

# Type check and build
pnpm typecheck
pnpm build:packages

# Run tests
pnpm test
```

### Python

```bash
# Setup environment (from /python directory)
cd python
make env
source .venv/bin/activate

# Format code
make fmt

# Check linting and types
make chk

# Run tests
make tst
```

## PR Review Workflow

1. Checkout the PR branch locally
2. Review the diff and understand the changes
3. Run relevant quality checks (lint, typecheck, tests)
4. Verify changes work as expected

## Addressing PR Comments

1. Checkout the PR branch
2. Make the requested changes
3. Run quality checks:
   - TypeScript: `pnpm lint && pnpm typecheck`
   - Python: `make chk`
4. Commit and push changes

## Key Configuration Files

- TypeScript: `eslint.config.mjs`, `tsconfig.base.json`
- Python: `python/config/ruff.toml`, `python/config/mypy.ini`
- Build: `turbo.json`
