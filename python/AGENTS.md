# AGENTS.md

Python SDK guidance for AI agents.

## Scope

`python/` contains the Python SDK, provider packages, tests, nox sessions, release scripts, and Python docs.

## Skill Routing

- Use `python-sdk` for core SDK code under `python/composio/`.
- Use `python-providers` for `python/providers/*`.
- Use `python-testing` for Ruff, mypy, pytest, nox, and Makefile verification.
- Use `python-release` for build, bump, and publishing workflow changes.
- Use `cross-sdk-parity` when matching TypeScript SDK behavior.

## Setup

Run from `python/`:

```bash
make env
source .venv/bin/activate
```

## Commands

```bash
make fmt
make chk
make tst
make snt
make type_inference
make build
```

## Rules

- Use Ruff for formatting/linting and mypy for type checks.
- Add pytest coverage for behavior changes.
- Keep provider-specific changes under the relevant `python/providers/<provider>/` package.
- When bumping `composio-client`, update `python/pyproject.toml`, `python/setup.py`, and root `uv.lock` together.
