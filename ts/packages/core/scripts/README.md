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

## Usage blocks

A class page gets a Usage block only when the class is reachable from a `Composio` instance. The generator walks public properties and getters whose type references a class, starting from `Composio`, and picks one path per class: internal classes are skipped, non-deprecated paths win, then the shortest path, then the earliest member in TypeDoc output order. A path through a deprecated property gets a deprecation note. Classes reached only through return values, such as `RemoteFile` and sessions, get no Usage block.

## Code fences

- Method, constructor and overload signatures are emitted as ` ```typescript signature `, which tells the reference checker to skip them.
- An `@example` that contains fences is emitted as written: prose and every fence, with fence options kept and `ts` normalized to `typescript`. A fence-less example is wrapped in one `typescript` fence.
- Authors may mark an example fence `nocheck="<reason>"`. Generation fails if an authored fence uses `signature`.

## CI

`.github/workflows/docs-sdk-reference-drift.yml` regenerates the reference on PRs to `next` that change `ts/packages/core/src/**` or this generator, and fails if the committed output differs.
