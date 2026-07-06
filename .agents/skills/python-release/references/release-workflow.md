# Python Release Workflow

## Build

Run from `python/` after the environment is ready:

```bash
make build
```

`make build` cleans build outputs, builds the root package, then builds provider packages and collects distributions.

## Client Pin Bumps

Before bumping `composio-client`, verify the version resolves:

```bash
pip index versions composio-client
```

Update all Python pins together:

- `python/pyproject.toml`
- `python/setup.py`
- root `uv.lock`

Regenerate the lockfile from the repo root:

```bash
uv lock --upgrade-package composio-client
```

## Verification

Run import and package checks after dependency changes:

```bash
uv run --package composio python -c "import composio"
```

Then run the focused nox/Makefile checks relevant to the change.
