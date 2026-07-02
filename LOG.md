# SDK v1 Goal Log

## 2026-07-03 - B9 parity guardrail

Selected blocker: B9, parity is not enforced in CI.

Hypothesis: A dependency-free root validator can close the first guardrail slice by checking the current TypeScript and Python public SDK surface, provider matrix, and generated-client pins, then running from both the TypeScript and Python CI workflows alongside the agent skill validators.

Files changed:

- `ts/scripts/validate-sdk-parity.mjs`
- `package.json`
- `.github/workflows/ts.test.yml`
- `.github/workflows/py.check.yaml`
- `LOG.md`

Commands run:

- `node ts/scripts/validate-sdk-parity.mjs`
- `pnpm run validate:sdk-parity`
- `pnpm run validate:agent-skills`
- `pnpm run validate:skill-routing`
- `git diff --check`

Result: Green. `validate:sdk-parity` now exists and checks normalized root namespaces, ten resource method surfaces, provider directories against the `cross-sdk-parity-policy.md` matrix, and the recorded generated-client pin pair. The validator currently passes with 28 declared current gaps; those allowances are stale-checked so closing a gap requires removing its allowance in the same PR. `ts.test.yml` and `py.check.yaml` now run `validate:sdk-parity`, `validate:agent-skills`, and `validate:skill-routing`.

Next blocker: Continue the low-risk release plumbing lane, starting with B1 provider peer ranges so TypeScript providers do not reject `@composio/core@1.x` during `check-peer-deps`.

## 2026-07-03 - B1 provider peer ranges

Selected blocker: B1, TypeScript provider peer ranges cap `@composio/core` at `<1.0.0`.

Hypothesis: Widening the provider peer range to `>=0.10.0 <2.0.0` keeps compatibility with the current core line, allows the 1.x stability line, and still blocks an unreviewed 2.x major.

Files changed:

- `ts/packages/providers/*/package.json`
- `.changeset/wide-provider-peer-ranges.md`
- `LOG.md`

Commands run:

- `pnpm run check:peer-deps`
- `command rg -n '>=0\.10\.0 <1\.0\.0|>=0\.10\.0 <2\.0\.0' ts/packages/providers/*/package.json`
- `node -e "const semver=require('semver'); for (const range of ['>=0.10.0 <2.0.0']) { if (!semver.satisfies('1.0.0', range) || !semver.satisfies('1.9.9', range) || semver.satisfies('2.0.0', range)) process.exit(1); } console.log('provider peer range accepts core 1.x and rejects 2.x')"`
- `pnpm run validate:sdk-parity`

Result: Green. All ten TypeScript provider packages now peer-depend on `@composio/core` with `>=0.10.0 <2.0.0`, and a patch changeset records the provider metadata update.

Next blocker: Continue the low-risk release plumbing lane with B7, pinning Python providers to the SDK line without allowing a future `composio==2.x`.

## 2026-07-03 - B7 Python provider pins

Selected blocker: B7, Python providers depend on an unpinned `composio`.

Hypothesis: Pinning each provider package below `2.x` in both `pyproject.toml` and `setup.py` prevents providers from resolving against a future incompatible core `2.x`. The exact release-cut lower bound should be `>=1.0`, but applying that before the root `composio` package is versioned as `1.0` makes the current uv workspace unsatisfiable.

Files changed:

- `python/providers/*/pyproject.toml`
- `python/providers/*/setup.py`
- `uv.lock`
- `LOG.md`

Commands run:

- Structured metadata parser over every Python provider `pyproject.toml` and `setup.py`
- `command rg -n '^\s*"composio",\s*$|install_requires=\[[^\]]*"composio"' python/providers/*/pyproject.toml python/providers/*/setup.py || true`
- `command rg -n 'composio>=0\.17\.1,<2' python/providers | wc -l`
- `pnpm run validate:sdk-parity`
- `uv lock`
- `uv lock --check`
- `uv sync --dry-run --frozen`
- `git diff --check`

Result: Green with a release-cut follow-up. All twelve Python provider packages now declare `composio>=0.17.1,<2` in both metadata surfaces, for 24 pinned entries total, and the root `uv.lock` is refreshed. No bare dependency entries remain. Attempting the final `composio>=1.0,<2` lower bound before the root package version reaches `1.0` made `uv sync` fail, so the final lower-bound tightening must happen in the same release slice that bumps the Python SDK to 1.0.

Next blocker: Continue the low-risk release plumbing lane with B8, stopping `python/composio/__version__.py` from drifting from release metadata.

## 2026-07-03 - B8 Python runtime version

Selected blocker: B8, `python/composio/__version__.py` can drift from release metadata.

Hypothesis: Runtime imports should read the source-tree `pyproject.toml` version during development and installed package metadata in built installs, leaving `python/pyproject.toml` as the source of truth.

Files changed:

- `python/composio/__version__.py`
- `python/tests/test_imports.py`
- `LOG.md`

Commands run:

- `uv run python -c "import composio; print(composio.__version__)"`
- `uv run ruff check composio/__version__.py tests/test_imports.py`
- `uv run pytest tests/test_imports.py`

Result: Green. `composio.__version__` now follows `python/pyproject.toml` in the source tree and falls back to installed package metadata for built installs. A focused import test asserts the runtime version matches `pyproject.toml`.

Next blocker: Continue the low-risk release plumbing lane by wiring TypeScript package export/type checks such as `publint` and `@arethetypeswrong/cli` into the release path.
