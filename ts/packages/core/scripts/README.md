# SDK Documentation Generator

Generates MDX reference docs from TypeScript source using TypeDoc.

## Usage

```bash
pnpm generate:docs
```

## How it works

1. TypeDoc extracts JSDoc from `src/models/*.ts` → JSON AST
2. `generate-docs.ts` transforms AST → MDX files
3. Output written to `fumadocs/content/reference/sdk-reference/typescript/`

## Configuration

- **Entry points**: Auto-discovered from `src/models/*.ts`
- **Excluded classes**: `INTERNAL_CLASSES` set in script
- **User-instantiated classes**: `USER_INSTANTIATED_CLASSES` (shows constructor)

## CI

`.github/workflows/generate-sdk-docs.yml` triggers on changes to `ts/packages/core/src/**` and opens a PR with updated docs.
