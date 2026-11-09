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

On PRs to `next` that change either SDK source or generator, `.github/workflows/docs-sdk-reference-drift.yml` regenerates both references and fails if the committed output differs. Regenerate with the commands above and commit the result.

The SDK release workflow (`.github/workflows/sdk.release.yml`) also regenerates both references in each release PR, so the published reference always matches the released packages.
