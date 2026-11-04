# Python Release Workflow

## Build

Run from `python/` after the environment is ready:

```bash
make build
```

`make build` cleans build outputs, builds the root package, then builds provider packages and collects distributions.

Stable Python releases use the unified `sdk.release.yml` member request and one approved release PR. Author Changesets notes for the private `@composio/python-sdk` marker; the coordinator synchronizes core and all supported provider metadata. Read `ts/docs/internal/release.md` for request, approval, merge, re-run, supersede and owner bootstrap steps.

Candidate builds install only the `release` dependency group from `uv.lock` with `uv sync --locked --only-group release` and use `BUILD_ARGS=--no-isolation`. Bump `build` or `setuptools` in that group, then run `uv lock`. Direct stable publication uses the new tag-only `pypi-release` OIDC environment. The legacy `py.release.yml` retains build-only dispatch and core-prerelease publication through `pypi`; it cannot publish stable Python from the new workflow copy. Preserve `main` beta metadata and its existing trusted identity.

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
