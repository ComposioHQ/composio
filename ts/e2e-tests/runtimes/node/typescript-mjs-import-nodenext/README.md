# TypeScript .mjs Import Resolution Test

Verifies that `composio ts generate` produces TypeScript files that compile correctly with `moduleResolution: "nodenext"`.

## Background

When `composio ts generate --output-dir ./types` runs without `--transpiled`:

- Only `.ts` files are generated
- These files contain `import ... from "./foo.mjs"` statements
- With `moduleResolution: "node16"` or `"nodenext"`, TypeScript resolves:
  - `.js` imports → `.ts` files ✅
  - `.mjs` imports → `.mts` files only (not `.ts`) ❌

This causes `TS2307: Cannot find module './foo.mjs'` errors.

## What It Tests

| Test                   | Description                                                    |
| ---------------------- | -------------------------------------------------------------- |
| composio ts generate   | Runs CLI to generate TypeScript files for entelligence toolkit |
| File existence         | Verifies generated .ts files exist                             |
| TypeScript compilation | Runs `tsc --noEmit` to check import resolution                 |

## Isolation Tool

**Docker** with Node.js version: current runtime

This test uses the current Node.js runtime version for simplicity.

## Running

```bash
pnpm test:e2e
```

## Expected Behavior

- **If bug exists (importExtension: 'mjs')**: TypeScript compilation fails with TS2307
- **If fixed (importExtension: 'js')**: All tests pass
