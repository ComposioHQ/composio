# TypeScript .mjs Import Resolution Test

Verifies that `composio ts generate` produces TypeScript files that compile correctly with `moduleResolution: "nodenext"`.

## The Issue

When `composio ts generate --output-dir ./types` runs without `--transpiled`:

- Only `.ts` files are generated
- These files contain `import ... from "./foo.mjs"` statements
- With `moduleResolution: "node16"` or `"nodenext"`, TypeScript resolves:
  - `.js` imports → `.ts` files ✅
  - `.mjs` imports → `.mts` files only (not `.ts`) ❌

This causes `TS2307: Cannot find module './foo.mjs'` errors.

## What It Tests

| Test                   | Description                                                 |
| ---------------------- | ----------------------------------------------------------- |
| composio ts generate   | Runs CLI to generate TypeScript files for entelligence toolkit |
| File existence         | Verifies generated .ts files exist                          |
| TypeScript compilation | Runs `tsc --noEmit` to check import resolution              |

## Running

```bash
# With nvm - test specific Node.js versions
nvm use 20.18.0 && pnpm install && pnpm test:e2e
nvm use 20.19.0 && pnpm install && pnpm test:e2e
```

## Expected Behavior

- **If bug exists (importExtension: 'mjs')**: Test 3 fails with TS2307
- **If fixed (importExtension: 'js')**: All tests pass
