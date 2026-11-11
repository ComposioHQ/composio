# SDK Documentation Generator

Generates MDX reference docs from TypeScript source using TypeDoc.

## Usage

```bash
pnpm generate:docs
```

## How it works

1. TypeDoc extracts JSDoc from `src/models/*.ts` → JSON AST
2. `generate-docs.ts` transforms AST → MDX files
3. Output written to `docs/content/reference/sdk-reference/typescript/`

## Configuration

- **Entry points**: Auto-discovered from `src/models/*.ts`
- **Excluded classes**: `INTERNAL_CLASSES` set in script
- **User-instantiated classes**: `USER_INSTANTIATED_CLASSES` (shows constructor)

## CI

`.github/workflows/docs-sdk-reference-drift.yml` regenerates the reference on PRs to `next` that change `ts/packages/core/src/**` or this generator, and fails if the committed output differs.
