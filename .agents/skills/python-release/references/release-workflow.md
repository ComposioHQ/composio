# Python Release Workflow

## Build

Run from `python/` after the environment is ready:

```bash
make build
```

`make build` cleans build outputs, builds the root package, then builds provider packages and collects distributions.

Stable Python releases use the unified `sdk.release.yml` member request and one approved release PR. Author changesets for the private `@composio/python-sdk` marker; the release bot synchronizes core and all supported provider metadata. Read `ts/docs/internal/release.md` for request, approval, merge, recovery and owner setup steps.

Recovery: re-run a failed tag run with `gh run rerun <tag-run-id> --failed`. When the approved candidate expired, add a changeset and request a new release. Agents stop at "release PR ready for approval" and never merge it.

Candidate builds install only the `release` dependency group from `uv.lock` with `uv sync --locked --only-group release` and use `BUILD_ARGS=--no-isolation`. Bump `build` or `setuptools` in that group, then run `uv lock`. Stable publication uses the tag-only `pypi-release` OIDC environment. The legacy `py.release.yml` keeps build-only dispatch and core-prerelease publication through `pypi`.

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
