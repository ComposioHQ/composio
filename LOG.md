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

## 2026-07-03 - TypeScript package export checks

Selected blocker: TypeScript package export/type checks are configured in direct `tsdown` builds but are skipped under Turbo, so the release workflow can publish without an explicit packed-package export check.

Hypothesis: Running a serial checker after `build:packages` gives the release path the same package-shape coverage without reintroducing the concurrent tarball race that disabled `tsdown` checks under Turbo.

Files changed:

- `ts/scripts/check-package-exports.mjs`
- `package.json`
- `ts/scripts/changeset-release.sh`
- `.github/workflows/ts.release.yml`
- `ts/packages/**/package.json` for publishable TypeScript packages
- `.changeset/package-export-entrypoints.md`
- `tsdown.config.base.ts`
- `LOG.md`

Commands run:

- `pnpm run check:package-exports`
- `pnpm run build:packages`
- `pnpm run check:package-exports`
- `pnpm run validate:sdk-parity`
- `pnpm run check:peer-deps`
- `git diff --check`

Result: Green. `check:package-exports` now discovers the 14 public TypeScript packages that publish `exports`, verifies `main`/`types` match the release `dist` metadata, and runs packed-package `publint` plus `attw` serially to avoid the tarball race documented in `tsdown.config.base.ts`. The release workflow and `changeset:release` script run the checker after `build:packages`, before `changeset publish`. Public TypeScript package manifests now expose built `dist/index.mjs` and `dist/index.d.mts` through top-level `main`/`types`, with a patch changeset.

Next blocker: Continue the low-risk release plumbing lane by auditing whether additional TypeScript release gates should run before publish, or move to the next unresolved SDK v1 blocker in `road-to-v1.md`.

## 2026-07-03 - Release guide branch target

Selected blocker: The internal release guide still points regular and manual release operators at `main`, even though this repo branches and releases from `next`.

Hypothesis: A narrow branch-language cleanup closes the roadmap's internal-release-guide drift without changing release authentication or publish behavior.

Files changed:

- `ts/docs/internal/release.md`
- `.github/workflows/ts.release.yml`
- `LOG.md`

Commands run:

- `rg -n "main|master|next" ts/docs/internal/release.md .github/workflows/ts.release.yml`
- `pnpm exec prettier --check ts/docs/internal/release.md .github/workflows/ts.release.yml LOG.md`
- `git diff --check`

Result: Green. `ts/docs/internal/release.md` now directs regular and manual TypeScript SDK release operators to `next`, and the `ts.release.yml` Changesets step comment now says it runs on `next` merges. The targeted branch search only reports `next` in those files.

Next blocker: Continue the polish lane by choosing either Python type-contract tightening or TypeScript provider test/typecheck coverage.

## 2026-07-03 - Python type-contract tightening

Selected blocker: Python auth-config and MCP methods still expose loose return types, and the custom-provider type-inference file exists but is omitted from the `type_inference` nox session.

Hypothesis: Use generated response classes where they exist, mirror the auth-config update/status shape with the generated retrieve response until the generated client exposes a dedicated update schema, and add the custom-provider inference file to the nox gate.

Files changed:

- `python/composio/client/types.py`
- `python/composio/core/models/auth_configs.py`
- `python/composio/core/models/mcp.py`
- `python/noxfile.py`
- `LOG.md`

Commands run:

- `uv run ruff check composio/client/types.py composio/core/models/auth_configs.py composio/core/models/mcp.py noxfile.py`
- `uv run pytest tests/test_auth_configs.py -q`
- `uv run nox -s type_inference`
- `.nox/type_inference/bin/mypy --config-file config/mypy.ini composio/client/types.py composio/core/models/auth_configs.py composio/core/models/mcp.py`
- `uv run ruff format --check composio/client/types.py composio/core/models/auth_configs.py composio/core/models/mcp.py noxfile.py tests/test_type_inference_custom_provider.py`
- `git diff --check`

Result: Green. `auth_configs.update()` and the status helpers now return local aliases to `AuthConfigRetrieveResponse`, `auth_configs.delete()` returns the generated `AuthConfigDeleteResponse`, and `mcp.get()` / `mcp.update()` return generated MCP response classes. `nox -s type_inference` now checks `tests/test_type_inference_custom_provider.py` and passes across 13 source files. `mcp.delete()` intentionally remains a dict-shaped convenience wrapper because changing it to the generated response object would alter current runtime behavior and was not part of this blocker.

Next blocker: Continue the polish lane with TypeScript provider typecheck/test coverage or the TypeScript barrel export audit.

## 2026-07-03 - TypeScript provider typecheck scripts

Selected blocker: Nine TypeScript provider packages have real Vitest suites but no `typecheck` script, so the workspace `typecheck` task skips those adapters.

Hypothesis: Giving every provider the same `typecheck` / `typecheck:tsc` scripts already used by `@composio/mastra` makes provider type coverage explicit without changing provider runtime behavior.

Files changed:

- `ts/packages/providers/{anthropic,claude-agent-sdk,cloudflare,google,langchain,llamaindex,openai,openai-agents,vercel}/package.json`
- `LOG.md`

Commands run:

- `pnpm typecheck --filter='./ts/packages/providers/**'`
- `pnpm exec turbo test --filter='./ts/packages/providers/**'`
- `pnpm exec prettier --check ts/packages/providers/anthropic/package.json ts/packages/providers/claude-agent-sdk/package.json ts/packages/providers/cloudflare/package.json ts/packages/providers/google/package.json ts/packages/providers/langchain/package.json ts/packages/providers/llamaindex/package.json ts/packages/providers/openai-agents/package.json ts/packages/providers/openai/package.json ts/packages/providers/vercel/package.json LOG.md`
- `git diff --check`

Result: Green. All ten TypeScript provider packages now expose both `typecheck` and `typecheck:tsc`; the existing provider test suites still pass. This completes the script half of the roadmap's TypeScript provider coverage item while preserving the existing real test suites.

Next blocker: Continue the TypeScript polish lane with the barrel export audit or Zod v3/v4 support matrix.

## 2026-07-03 - TypeScript Zod support matrix

Selected blocker: The TypeScript SDK supports both Zod 3 and Zod 4 in practice, but the v1 contract does not spell out which surfaces support which major, and one stable core file still imports the bare `zod` entrypoint.

Hypothesis: Normalizing the stable core import to `zod/v3` and documenting the support matrix in the stability contract clarifies the 1.0 promise without changing runtime behavior.

Files changed:

- `ts/packages/core/src/lib/toolRouterParams.ts`
- `docs/decisions/sdk-1.0-stability-contract.md`
- `LOG.md`

Commands run:

- `command rg -n "from ['\"]zod['\"]|from ['\"]zod/" ts/packages/core/src --glob '!**/dist/**'`
- `pnpm --filter @composio/core typecheck`
- `pnpm --filter @composio/core test`
- `pnpm exec prettier --check docs/decisions/sdk-1.0-stability-contract.md LOG.md ts/packages/core/src/lib/toolRouterParams.ts`
- `git diff --check`

Result: Green. Stable core now uses explicit `zod/v3` imports at schema boundaries, and the only core `zod/v4` import is the custom-tool conversion path that calls `toJSONSchema`. The stability contract now records the Zod 3/4 support matrix for stable core schemas, custom tools, JSON Schema helpers, provider packages, and CLI internals.

Next blocker: Continue the TypeScript polish lane with the barrel export audit.
