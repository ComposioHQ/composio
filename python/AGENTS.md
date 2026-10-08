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

## Trust boundary

**Every field of an API response is untrusted input** — including slugs, IDs, and
filenames. The SDK's threat model assumes the backend may be compromised or the
connection MITM'd, and that a third-party toolkit can return anything.

When untrusted directory components such as slugs or IDs become part of a
filesystem path, use
`composio.utils.safe_path.secure_join(root, *components)`. For an untrusted
filename, use `secure_basename_join(base, filename, root=root)` so ordinary
extensions remain valid while the write stays anchored to the trusted root.
Both helpers enforce two rules:

1. **Anchor containment on a constant.** Checking a derived path against a
   directory that untrusted input helped build compares tainted against tainted
   and always passes. A directory built as `root / untrusted_a / untrusted_b`
   and then validated against that same built directory is checked against a
   reference the input was free to move.
2. **Validate before touching the filesystem.** No `mkdir` or `open` until the
   final path is known to be inside the root, so a rejected write leaves no
   attacker-chosen directories behind.

`tests/test_path_join_guardrail.py` enforces this: any path join whose right-hand
side is not a literal or module constant must be listed there with a reason.
