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
| composio ts generate   | Runs CLI to generate TypeScript files for hackernews toolkit |
| File existence         | Verifies generated .ts files exist                             |
| TypeScript compilation | Runs `tsc --noEmit` to check import resolution                 |

## Fixture

```
fixtures/
├── index.mjs       # Test runner script that generates and compiles TypeScript
└── tsconfig.json   # TypeScript config with moduleResolution: "nodenext"
```

The fixture script:

1. Cleans up any previous generated files
2. Runs `composio ts generate --toolkits hackernews --output-dir ./generated`
3. Verifies generated `.ts` files exist
4. Runs `npx tsc --noEmit` to check TypeScript compilation
5. Fails if TS2307 errors occur (indicating `.mjs` import bug)

**tsconfig.json:**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "nodenext",
    "strict": true,
    "noEmit": true
  },
  "include": ["generated/**/*.ts"]
}
```

## Isolation Tool

**Docker** with Node.js versions: current (as specified in `.nvmrc`).

## Running

```bash
pnpm test:e2e
```

## Expected Behavior

- **If bug exists (importExtension: 'mjs')**: TypeScript compilation fails with TS2307
- **If fixed (importExtension: 'js')**: All tests pass
