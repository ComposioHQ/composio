# Python Release Workflow

## Build

Run from `python/` after the environment is ready:

```bash
make build
```

`make build` cleans build outputs, builds the root package, then builds provider packages and collects distributions.

`py.release.yml` does not run `make env`. It installs only the `release` dependency group from `uv.lock` with `uv sync --locked --only-group release` and builds with `BUILD_ARGS=--no-isolation`, so the release build fetches nothing unlocked. A separate `publish` job uploads to PyPI through trusted publishing (OIDC, `pypi` environment). Bump `build` or `setuptools` in that group, then run `uv lock`.

## Dependency Bounds

Third-party runtime dependencies carry an upper bound at the next major line after the newest release available when the cap was set (`<1` for 0.x packages). `certifi` stays uncapped so CA bundle updates always install. `pysher` is pinned exactly because it is unmaintained. Keep `pyproject.toml` and `setup.py` identical for each package.

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
