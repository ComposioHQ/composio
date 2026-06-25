# SDK Reference Documentation

Auto-generated SDK documentation from source code.

## TypeScript SDK

| Item | Path |
|------|------|
| Source | `ts/packages/core/src/models/*.ts` (JSDoc comments) |
| Generator | `ts/packages/core/scripts/generate-docs.ts` |
| Output | `content/reference/sdk-reference/typescript/` |
| Regenerate | `pnpm --filter @composio/core generate:docs` |

## Python SDK

| Item | Path |
|------|------|
| Source | `python/composio/**/*.py` (docstrings) |
| Generator | `python/scripts/generate-docs.py` (uses griffe) |
| Output | `content/reference/sdk-reference/python/` |
| Regenerate | `cd python && uv run --with griffe python scripts/generate-docs.py` |

## CI Integration

CI auto-generates on changes to `ts/packages/core/src/**` or `python/composio/**` via `.github/workflows/generate-sdk-docs.yml`.
