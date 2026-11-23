# SDK Reference Documentation

Auto-generated SDK documentation from source code.

## TypeScript SDK

| Item       | Path                                                |
| ---------- | --------------------------------------------------- |
| Source     | `ts/packages/core/src/models/*.ts` (JSDoc comments) |
| Generator  | `ts/packages/core/scripts/generate-docs.ts`         |
| Output     | `content/reference/sdk-reference/typescript/`       |
| Regenerate | `pnpm --filter @composio/core generate:docs`        |

## Python SDK

| Item       | Path                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| Source     | `python/composio/**/*.py` (docstrings)                                                                      |
| Generator  | `python/scripts/generate-docs.py` (griffe, pinned in the `docs-reference` group in `python/pyproject.toml`) |
| Output     | `content/reference/sdk-reference/python/`                                                                   |
| Regenerate | `cd python && uv run --frozen --only-group docs-reference python scripts/generate-docs.py`                  |

## CI Integration

On PRs and pushes to `next`, `.github/workflows/docs-sdk-reference-drift.yml` regenerates both references and fails if the committed output differs. Edit the JSDoc or docstrings, run the corresponding generator, then commit the regenerated pages.

Run `pnpm run check:docs-reference` at the repository root to check TypeScript examples against workspace `@composio/core`. Examples resolve public package exports from a consumer context. Usage blocks follow the real `composio` property path. Classes reachable only through return values have no Usage block.

From `docs/`, run `bun run check:python-snippets --reference` to check Python syntax and SDK-attributed mypy diagnostics against the local Python SDK. Both checkers skip generated `signature` fences and report author opt-outs marked `nocheck="<reason>"`.

Stable SDK release PRs regenerate both references. The `SDK candidate docs` job checks the installed TypeScript core candidate when the release includes it. The Changesets TypeScript release workflow checks the local build after building the packages. Both use `pnpm run check:docs-reference --built-package <package-directory>` to resolve package exports to declarations and compare the shipped reference files under `dist/docs` with the repository copies.
